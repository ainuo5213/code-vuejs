let activeEffectFn;
let isFlushing = false;
const jobQueue = new Set(); // 利用Set数据结构自动去重的功能
const p = Promise.resolve(); // 创建一个promise实例，我们用它将一个任务添加到微任务队列
const effectStack = [];
const bucket = new WeakMap(); // bucket是一个多个data数据的weakMap
const reactivityMap = new Map(); // 定义一个map实例，存储原始对象与代理对象的映射，用于调用数组api时判断对象类型的是否一样（因为每次reactive都是一个新的proxy）

// 触发trigger的方式
const TriggerType = {
  SET: "SET",
  ADD: "ADD",
  DELETE: "DELETE",
};

// 对象新增属性或删除属性时需要建立响应式联系所关联的key
const __ITERATOR_KEY__ = Symbol();

// 由于proxy数组时，proxy的数组的项和原数组内的每一个项在某些方法可能表现得不一样，需要重写数组api
const arrayImplQueryMethods = [
  "includes",
  "indexOf",
  "lastIndexOf",
  "find",
  "findIndex",
  "filter",
  "findLastIndex",
  "findLast",
]; // 直接查找对象中的数据所对应的需要重写的数组方法
const arrayImplUpdateMethods = ["push", "pop", "splice", "unshift", "shift"]; // 涉及到修改原数组长度的数组方法，需要屏蔽掉对length的写入，避免响应式无限循环造成栈溢出
const arrayImpl = {};

function iterationMethod() {
  const wrap = (val) =>
    typeof val === "object" && val !== null ? reactive(val) : val;
  const target = this.raw;
  const iterator = target[Symbol.iterator]();
  track(target, __ITERATOR_KEY__);
  return {
    next() {
      // 手动调用迭代器的next方法得到value和next，如果有value需要做一下reactive响应式
      const { value, done } = iterator.next();
      return {
        value: value ? [wrap(value[0]), wrap(value[1])] : value,
        done,
      };
    },
    [Symbol.iterator]() {
      return this;
    },
  };
}

function valueIterationMethod() {
  const wrap = (val) =>
    typeof val === "object" && val !== null ? reactive(val) : val;
  const target = this.raw;
  const iterator = target[Symbol.iterator]();
  track(target, __ITERATOR_KEY__);
  return {
    next() {
      // 手动调用迭代器的next方法得到value和next，如果有value需要做一下reactive响应式
      const { value, done } = iterator.next();
      return {
        value: wrap(value),
        done,
      };
    },
    [Symbol.iterator]() {
      return this;
    },
  };
}

// set、map的方法重写
const iteratorImplMethods = {
  add(key) {
    const target = this.raw;
    const hasKey = target.has(key);
    const res = target.add(key);

    if (!hasKey) {
      trigger(target, key, TriggerType.ADD);
    }

    return res;
  },
  delete(key) {
    const target = this.raw;
    const hasKey = target.has(key);
    const res = target.delete(key);
    if (hasKey) {
      trigger(target, key, TriggerType.DELETE);
    }

    return res;
  },
  get(key) {
    const target = this.raw; // 读取原始对象
    const hasKey = target.has(key);
    track(target, key); // 追踪依赖，建立响应式联系
    if (hasKey) {
      const res = target.get(key);
      // 是对象的话还需再包装一层
      return typeof res === "object" ? reactive(res) : res;
    }
  },
  set(key, value) {
    const target = this.raw;
    const hasKey = target.has(key);
    const oldValue = target.get(key);
    const rawValue = value.raw || value; // 这里避免设置到target的value是一个响应式数据，从而污染原始数据
    target.set(key, rawValue);
    if (!hasKey) {
      trigger(key, value, TriggerType.ADD);
    } else if (
      oldValue !== value ||
      (oldValue === oldValue && value === value)
    ) {
      trigger(target, key, TriggerType.SET);
    }
  },
  forEach(callback, thisArg) {
    const wrap = (val) => (typeof val === "object" ? reactive(val) : val);
    const target = this.raw;
    track(target, __ITERATOR_KEY__);
    target.forEach((val, idx) => {
      // 手动调用callback，避免val是非响应式对象的场合，对于此类情况需要使他变得响应式
      callback.call(thisArg, wrap(val), wrap(idx), this);
    });
  },
  [Symbol.iterator]: iterationMethod,
  entries: iterationMethod,
  values: valueIterationMethod,
};

function isFalsy(method, value) {
  // 判断函数执行的返回结果是否为真
  switch (method) {
    // -1的情况
    case "findIndex":
    case "indexOf":
    case "lastIndexOf":
    case "findLastIndex":
      return value === -1;
    // undefined的情况
    case "find":
    case "findLast":
      return value === undefined;
    // 空数组的情况
    case "filter":
      return value.length === 0;
  }
}
arrayImplQueryMethods.forEach((method) => {
  const originMethod = Array.prototype[method];
  arrayImpl[method] = function (...args) {
    // 这里的this由于外部调用使用的是Reflect.get调用， 所以这里的this是代理对象
    // 现在代理对象中查找该值的，如果没找到就到原始数组中查找
    let res = originMethod.apply(this, args);
    if (isFalsy(method, res)) {
      res = originMethod.apply(this.raw, args);
    }
    return res;
  };
});

// 标记是否进行跟踪，默认值为true，允许跟踪
let shouldTrack = true;
arrayImplUpdateMethods.forEach((method) => {
  const originMethod = Array.prototype[method];
  arrayImpl[method] = function (...args) {
    // 调用方法前禁止追踪，这样对于数组长度的修改，就不会影响其他副作用函数对于length的读取，造成的死循环
    shouldTrack = false;

    // 默认行为，先进行数组操作
    let res = originMethod.apply(this, args);

    // 操作完之后允许追踪
    shouldTrack = true;
    return res;
  };
});

function hasProperty(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function flushJob() {
  // 队列正在刷新，啥也不做
  if (isFlushing) return;
  // 设置队列为正在刷新
  isFlushing = true;
  p.then(() => {
    // 执行任务队列里的每一个任务
    jobQueue.forEach((job) => job());
  }).finally(() => {
    // 设置队列为未刷新
    isFlushing = false;
  });
}

function track(target, key) {
  // 没有活跃的副作用函数或者不允许追踪时直接返回
  if (!activeEffectFn || !shouldTrack) return;
  let depsMap = bucket.get(target); // depsMap是当前target数据中的key-value形式的Map
  if (!depsMap) {
    bucket.set(target, (depsMap = new Map()));
  }
  let deps = depsMap.get(key);
  if (!deps) {
    depsMap.set(key, (deps = new Set())); // 一个数据项可以有多个依赖，所以这里需要用set存储
  }
  deps.add(activeEffectFn); // 将当前激活的副作用函数添加到依赖集合deps中，用于trigger时遍历依赖项执行
  activeEffectFn.deps.push(deps); // 添加依赖于当前数据项的集合到activeEffectFn.deps中，用于副作用函数执行之前时清除当前副作用的依赖
  // 将deps合activeEffectFn.deps添加关联
}

function trigger(target, key, type, newValue) {
  const depsMap = bucket.get(target);
  if (!depsMap) return;

  const effects = depsMap.get(key);
  const effectsToRun = new Set(effects);

  // 由于在trigger时取得的副作用函数执行时又会有新的副作用被添加进来，所以这里用set再套一层，避免无限循环
  effects &&
    effects.forEach((effect) => {
      // 如果trigger触发执行的副作用函数和当前的activeEffectFn不相同的话，才会执行，如果相同且执行的话会导致无限递归
      if (effect !== activeEffectFn) {
        effectsToRun.add(effect);
        // 将要执行的effect添加到effectsToRun
      }
    });

  // 只有当操作类型为'ADD'和'DELETE'时，才触发__ITERATOR_KEY__关联的副作用函数重新执行
  // 注：涉及对象属性增删的操作都应触发__ITERATOR_KEY__关联的副作用函数重新执行
  if (
    type === TriggerType.ADD ||
    type === TriggerType.DELETE ||
    // 如果操作类型是set，但是对象类型是map（map的set既关心值，也关心键2）
    // 需要将与之相关的__ITERATOR_KEY__的副作用函数也执行了
    (type === TriggerType.SET &&
      Object.prototype.toString.call(target) === "[object Map]")
  ) {
    // 取得与__ITERATOR_KEY__相关联的副作用函数
    const iterateEffects = depsMap.get(__ITERATOR_KEY__);
    // 将__ITERATOR_KEY__相关的副作用函数也添加到effectsToRun
    iterateEffects &&
      iterateEffects.forEach((effect) => {
        if (effect !== activeEffectFn) {
          effectsToRun.add(effect);
        }
      });
  }
  // 操作类型为add且目标为数组时，应取出依赖于length的副作用函数到effectsToRun
  if (type === TriggerType.ADD && Array.isArray(target)) {
    const lengthEffects = depsMap.get("length");
    lengthEffects &&
      lengthEffects.forEach((effect) => {
        if (effect !== activeEffectFn) {
          effectsToRun.add(effect);
        }
      });
  }

  // 操作目标是数组，且操作的是length属性，需要把原来的副作用函数中index大于newValue(新的length)的数组项所对应的副作用函数放到effectsToRun
  if (Array.isArray(target) && key === "length") {
    depsMap.forEach((effects, key) => {
      if (key >= newValue) {
        effects.forEach((effect) => {
          if (effect !== activeEffectFn) {
            effectsToRun.add(effect);
          }
        });
      }
    });
  }

  effectsToRun.forEach((effectFn) => {
    // 如果指定了调度器执行effect，则使用调度器执行，否则直接执行
    if (effectFn.options.scheduler) {
      effectFn.options.scheduler(effectFn);
    } else {
      effectFn();
    }
  });
}

// 清理挂载到effectFn上对于effectFn的依赖
function cleanup(effectFn) {
  for (let i = 0; i < effectFn.deps.length; i++) {
    const deps = effectFn.deps[i];
    deps.delete(effectFn); // 在deps的依赖中删除所关联的副作用函数
  }
  effectFn.deps.length = 0;
}

// 接收一个参数isShallow，代表是否浅响应式，默认为false
// 接收一个参数isReadonly，代表是否只读，默认为false
function createReactive(obj, isShallow = false, isReadonly = false) {
  return new Proxy(obj, {
    deleteProperty(target, key) {
      // 如果是只读的就给警告
      if (isReadonly) {
        console.warn(`property ${key} is readonly`);
        return true;
      }

      // 被操作的属性是否是对象自己的属性
      const hasKey = hasProperty(target, key);

      // 利用Reflect.deleteProperty完成属性的删除
      const res = Reflect.deleteProperty(target, key);
      if (hasKey && res) {
        // 只有被删除的属性是自身的属性且成功删除时才触发更新
        trigger(target, key, TriggerType.DELETE);
      }

      return res;
    },
    get(target, key, receiver) {
      // 如果key为raw，那么返回未代理的对象
      if (key === "raw") {
        return target;
      }

      // 如果读取的是size属性，通过指定第三个参数receiver为原始对象修复问题
      if (key === "size") {
        track(target, __ITERATOR_KEY__);
        return Reflect.get(target, key, target);
      }
      if (
        (Object.prototype.toString.call(target) === "[object Map]" ||
          Object.prototype.toString.call(target) === "[object Set]") &&
        hasProperty(iteratorImplMethods, key)
      ) {
        return Reflect.get(iteratorImplMethods, key, receiver);
      }

      // 如果目标是数组，且key为存在与arrayImpl的方法时，使用arrayImpl里方法对数据进行处理并返回
      if (Array.isArray(target) && hasProperty(arrayImpl, key)) {
        return Reflect.get(arrayImpl, key, receiver);
      }

      const res = Reflect.get(target, key, receiver);

      // 不是只读的时候才建立副作用函数与以来的关系
      // key如果是symbol类型也不能建立响应式联系，因为symbol不能用于比较、计算等
      if (!isReadonly && typeof key !== "symbol") {
        // 记录依赖
        track(target, key);
      }

      // 如果是浅层响应式直接返回，不需要再做包装
      if (isShallow) {
        return res;
      }

      if (typeof res === "object" && res !== null) {
        // 如果是只读的，那么包装内部的only
        return isReadonly ? readonly(res) : reactive(res);
      }

      return res.bind(target);
    },
    has(target, key, receiver) {
      track(target, key);
      return Reflect.has(target, key, receiver);
    },
    ownKeys(target) {
      // 如果目标是数组的话，用for in循环时监听，用length属性作为key建立响应式联系
      track(target, Array.isArray(target) ? "length" : __ITERATOR_KEY__);
      return Reflect.ownKeys(target);
    },
    set(target, key, newValue, receiver) {
      // 如果是只读的就给警告
      if (isReadonly) {
        console.warn(`property ${key} is readonly`);
        return true;
      }
      // 判断操作类型：对于数组，如果操作的长度小于目标当前长度则为set，否则为add；对于对象，如果操作的属性存在于该对象，则为set，否则为add
      const type = Array.isArray(target)
        ? Number(key) < target.length
          ? TriggerType.SET
          : TriggerType.ADD
        : hasProperty(target, key)
        ? TriggerType.SET
        : TriggerType.ADD;

      // 使用Reflect.set避免魔法
      const oldValue = Reflect.get(target, key);
      const res = Reflect.set(target, key, newValue, receiver);

      // target === receiver.raw 说明receiver就是target的代理对象，此时不触发其proto的trigger，只触发child的trigger，保证触发一次
      if (target === receiver.raw) {
        // 只有当新值和旧值不全等时且都不是NaN时才触发响应
        if (
          oldValue !== newValue &&
          (oldValue === oldValue || newValue === newValue)
        ) {
          // 执行副作用
          trigger(target, key, type, newValue);
        }
      }

      return res;
    },
  });
}

// 执行副作用函数所需要的函数
export function effect(fn, options = {}) {
  // 定义一个函数用来执行副作用函数
  const effectFn = () => {
    cleanup(effectFn); // 每次执行副作用之前清空当前副作用函数所关联的依赖
    activeEffectFn = effectFn; // 当effectFn执行时，将其设置为当前激活的副作用函数
    effectStack.push(effectFn); // 调用副作用函数之前将当前副作用压入栈中
    const res = fn(); // 将副作用函数fn的执行结果保存到res中
    effectStack.pop(); // 执行完副作用函数之后，将当前副作用弹出栈，将activeEffectFn还原为当前栈顶的值。
    // 这样做的目的是栈底始终是外层副作用函数，栈顶是当前副作用函数，保证每个activeEffectFn不会被覆盖
    activeEffectFn = effectStack[effectStack.length - 1]; // 将activeEffectFn设置为外层副作用函数，这样做的目的是在多层effect时，能够保存上层effect

    return res;
  };
  effectFn.options = options; // 将options挂载到effectFn上
  effectFn.deps = []; // activeEffectFn.deps用来存储所有与该副作用有关的依赖集合
  // 只有非lazy的时候，才会立即执行副作用函数
  if (!options.lazy) {
    effectFn(); // 执行佛作用函数，将effectFn赋值给activeEffectFn，并执行fn回调
  }

  return effectFn; // 将包装的副作用函数返回，这样我们可以通过执行他来获得真正的副作用函数的返回值
}

export function computed(getter) {
  let value; // 上一次计算的结果进行缓存
  let dirty = true; // dirty标志位，用来标识值是否已经过期，如果过期就需要重新计算
  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      if (!dirty) {
        dirty = true;
        trigger(obj, "value", TriggerType.SET); // 当前计算属性发生变化时，手动调用trigger执行其他依赖于该计算属性的副作用函数
      }
    },
  });

  const obj = {
    get value() {
      // 只有当dirty为false时，才重新计算该值
      if (dirty) {
        value = effectFn();
        dirty = false;
      }
      track(obj, "value"); // 读取value时，手动调用track函数进行依赖跟踪
      return value;
    },
  };

  return obj;
}

export function traverse(source, seen = new Set()) {
  // 如果读取的数据是原始值，或者已经被读取过了，则不再读取（读取的过程就是在访问他，达到track的目的）
  if (typeof source !== "object" || source === null || seen.has(source)) {
    return;
  }

  // 添加数据到已访问的集合中
  seen.add(source);

  // 递归访问
  for (const key in source) {
    traverse(source[key], seen);
  }
  return source;
}

export function watch(source, cb, options) {
  let getter;

  // 如果source是一个function，则认为是一个getter，用户想单独监听某个属性改变，而非一整个对象
  if (typeof source === "function") {
    getter = source;
  } else {
    // 否则就利用traverse递归调用，进行每个属性的监听，让其具有通用性
    getter = () => traverse(source);
  }
  let newValue, oldValue; // 定义新值和旧值

  let cleanup; // cleanup用来存储用户注册的过期回调
  function onInvalidate(fn) {
    cleanup = fn; // 将过期函数存储到cleanup
  }

  // 提取scheduler调度函数为一个独立的job函数
  const job = () => {
    // 重新运行副作用函数得到最新的值
    newValue = effectFn();

    // 在执行watch回调之前先调用过期回调
    if (cleanup) {
      cleanup();
    }
    // 调用回调函数并传递参数，将onInvalidate传递给用户使用
    cb(newValue, oldValue, onInvalidate);
    // 将新值改为旧值
    oldValue = newValue;
  };
  // 开启lazy选项，副作用函数执行后会返回一个副作用函数将其存储到effectFn中，以便后续手动调用得到新值
  const effectFn = effect(() => getter(), {
    lazy: true,
    scheduler() {
      // flush为post时，将其放入微队列执行
      if (options.flush === "post") {
        const p = Promise.resolve();
        p.then(job);
      } else {
        // 其他情况直接执行job函数
        job();
      }
    },
  });
  // 当设置了immediate为true时，立即执行job触发监听，执行回调
  if (options.immediate) {
    job();
  } else {
    oldValue = effectFn();
  }
}

export function reactive(obj) {
  // 判断是否已添加该对象的代理，如果已存在则不再重新代理
  const existionProxy = reactivityMap.get(obj);
  if (existionProxy) return existionProxy;
  const proxy = createReactive(obj);
  reactivityMap.set(obj, proxy);
  return proxy;
}

export function shallowReactive(obj) {
  return createReactive(obj, true);
}

export function shallowReadonly(obj) {
  return createReactive(obj, true, true);
}

export function readonly(obj) {
  return createReactive(obj, false, true);
}
