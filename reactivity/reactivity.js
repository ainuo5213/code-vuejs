let activeEffectFn;
const jobQueue = new Set(); // 利用Set数据结构自动去重的功能
const p = Promise.resolve(); // 创建一个promise实例，我们用它将一个任务添加到微任务队列
let isFlushing = false;
const effectStack = [];
const bucket = new WeakMap(); // bucket是一个多个data数据的weakMap
const data = {
  text: "hello world",
  ok: true,
  foo: 3,
  bar: "bar",
  a: 0,
  b: 1,
};
const obj = new Proxy(data, {
  get(target, key) {
    // 记录依赖
    track(target, key);
    return target[key];
  },
  set(target, key, newValue) {
    target[key] = newValue;
    // 执行副作用
    trigger(target, key);
  },
});

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
  if (!activeEffectFn) return;
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

function trigger(target, key) {
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
// 执行副作用函数所需要的函数
function effect(fn, options = {}) {
  // 定义一个函数用来执行副作用函数
  const effectFn = () => {
    cleanup(effectFn); // 每次执行副作用之前清空当前副作用函数所关联的依赖
    activeEffectFn = effectFn; // 当effectFn执行时，将其设置为当前激活的副作用函数
    effectStack.push(effectFn); // 调用副作用函数之前将当前副作用压入栈中
    const res = fn(); // 将副作用函数fn的执行结果保存到res中
    effectStack.pop(); // 执行完副作用函数之后，将当前副作用弹出栈，将activeEffectFn还原为当前栈顶的值。
    // 这样做的目的是栈底始终是外层副作用函数，栈顶是当前副作用函数，保证每个activeEffectFn不会被覆盖
    activeEffectFn = effectStack[effectStack.length - 1];

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

function computed(getter) {
  let value; // 上一次计算的结果进行缓存
  let dirty = true; // dirty标志位，用来标识值是否已经过期，如果过期就需要重新计算
  const effectFn = effect(getter, {
    lazy: true,
    scheduler() {
      if (!dirty) {
        dirty = true;
        trigger(obj, "value"); // 当前计算属性发生变化时，手动调用trigger执行其他依赖于该计算属性的副作用函数
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

function traverse(source, seen = new Set()) {
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

function watch(source, cb, options) {
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

function sleep() {
  return new Promise((resolve) => {
    setTimeout(resolve, 3000);
  });
}

let finalData;
watch(
  () => obj.foo,
  async (newValue, oldValue, onInvalidate) => {
    let expired = false;
    onInvalidate(() => {
      expired = true;
    });
    await sleep();

    // 如果当前副作用周期已过期则舍弃其结果，只要未过期时的值
    if (!expired) {
      finalData = newValue;
    }
    console.log(`数据发生了变化：${oldValue} => ${newValue}`);
  },
  {
    immediate: false,
    // 回调函数会在watch创建时立即执行一次
    flush: "sync", // 还可指定 pre | sync
  }
);

// const subRes = computed(() => {
//   console.log(1111);
//   return obj.a + obj.b;
// });

// effect(() => {
//   console.log(subRes.value);
// });

// effect(
//   () => {
//     console.log(obj.foo);
//   },
//   {
//     // 调度器scheduler是一个函数
//     scheduler(fn) {
//       jobQueue.add(fn);
//       flushJob();
//     },
//     lazy: true, // 指定了lazy这个副作用函数不会马上执行
//   }
// );

// obj.foo = "foo1";
// obj.foo = "foo2";
// obj.foo = "foo3";
// console.log('结束了')
// let tmp1, tmp2;
// effect(() => obj.foo += 1); // 这里会引起无限递归，因为再obj.foo取值时收集依赖，而在赋值时trigger变化时会执行已收集的副作用函数，但是该副作用函数还未运行完毕，导致自身无限递归
// effect(function effectFn1() {
//     console.log('effectFn1 执行');
//     effect(function effectFn2() {
//         console.log('effectFn2 执行');
//         tmp1 = obj.bar;
//     })
//     document.body.innerText = obj.ok ? obj.text : 'not';
//     tmp2 = obj.foo
// });
// setTimeout(() => {
//     obj.text = "hello vue3"
// }, 2000)
