import {
  effect,
  reactive,
  shallowReactive,
  shallowReadonly,
} from "../reactivity/reactivity.js";
export const Text = Symbol();
export const Comment = Symbol();
export const Fragment = Symbol();
// 存储正在被初始化的组件
let currentInstance = null;
export function shouldSetAsProps(el, key, value) {
  // 当设置Input的form属性时，该属性是只读的，不能直接设置，只能通过setAttribute设置
  if (key === "form" && el.tagName === "INPUT") {
    return false;
  }

  return key in el;
}

// 规范化class
export function normalizeClass(...args) {
  let classes = [];

  for (let i = 0; i < args.length; i++) {
    let arg = args[i];
    if (!arg) continue;

    let argType = typeof arg;

    if (argType === "string" || argType === "number") {
      classes.push(arg);
    } else if (Array.isArray(arg)) {
      if (arg.length) {
        let inner = normalizeClass.apply(null, arg);
        if (inner) {
          classes.push(inner);
        }
      }
    } else if (argType === "object") {
      if (arg.toString === Object.prototype.toString) {
        for (let key in arg) {
          if (Object.prototype.hasOwnProperty.call(arg, key) && arg[key]) {
            classes.push(key);
          }
        }
      } else {
        classes.push(arg.toString());
      }
    }
  }

  return classes.join(" ");
}

// 移除节点
function unmount(vnode) {
  // 待处理
  if (typeof vnode.type === "object") {
    const componentOptions = vnode.type;
    const { beforeUnmount, unMounted } = componentOptions;
    const instance = vnode.Component;
    const { beforeUnmount: beforeUnmountHooks, unMounted: unMountedHooks, context, subTree } =
      instance;
    beforeUnmountHooks &&
      beforeUnmountHooks.forEach((hook) => hook.call(context));
    beforeUnmount && beforeUnmount.call(context, context);
    unMountedHooks && unMountedHooks.forEach((hook) => hook.call(context));
    unMounted && unMounted.call(context, context);
    unmount(subTree);
    return;
  }
  if (vnode.type === Fragment) {
    vnode.children.forEach((r) => unmount(r));
    return;
  }
  const el = vnode.el;
  const parent = el.parentNode;
  if (parent) {
    parent.removeChild(el);
  }
}

// 寻找最长递增子序列
function getSequence(arr) {
  const p = arr.slice();
  const result = [0];
  let i, j, u, v, c;
  const len = arr.length;
  for (let i = 0; i < len; i++) {
    const arrI = arr[i];
    if (arrI !== 0) {
      j = result[result.length - 1];
      if (arr[j] < arrI) {
        p[i] = j;
        continue;
      }
      u = 0;
      v = result.length - 1;
      while (u < v) {
        c = ((u + v) / 2) | 0;
        if (arr[result[c]] < arrI) {
          u = c + 1;
        } else {
          v = c;
        }
      }
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p[i] = result[u - 1];
        }
        result[u] = i;
      }
    }
  }
  u = result.length;
  v = result[u - 1];
  while (u-- > 0) {
    result[u] = v;
    v = p[v];
  }

  return result;
}

const queue = new Set();
let isFlusing = false;
const p = Promise.resolve();

function queueJob(job) {
  queue.add(job);
  if (!isFlusing) {
    isFlusing = true;
    p.then(() => {
      try {
        queue.forEach((j) => j());
      } finally {
        isFlusing = false;
        queue.clear();
      }
    });
  }
}

// 从传递给组件的propData中解析出props（组件参数）、attrs（组件属性）
function resolveProps(options = {}, propsData = {}) {
  const props = {};
  const attrs = {};
  const listeners = {};
  for (const key in propsData) {
    if (key in options) {
      // 组件声明接收的props，存到props
      props[key] = propsData[key];
    } else if (key.startsWith("on")) {
      // 存储事件监听到listeners
      listeners[key] = propsData[key];
    } else {
      // 组件未声明接收的props，传递到attrs
      attrs[key] = propsData[key];
    }
  }

  return { props, attrs, listeners };
}

function setCurrentInstance(instance) {
  currentInstance = instance;
}

export function getCurrentInstance() {
  return currentInstance;
}

function hasPropsChanged(prevProps, nextProps) {
  const nextKeys = Object.keys(nextProps);
  if (nextKeys.length !== Object.keys(prevProps).length) {
    return true;
  }

  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i];
    if (nextProps[key] !== prevProps[key]) return true;
  }
}

export function onMounted(fn) {
  if (currentInstance) {
    currentInstance.mounted.push(fn);
  } else {
    console.error("onMounted函数只能在setup函数中调用");
  }
}

export function onBeforeMount(fn) {
  if (currentInstance) {
    currentInstance.beforeMount.push(fn);
  } else {
    console.error("onBeforeMount函数只能在setup函数中调用");
  }
}

export function onBeforeUpdate(fn) {
  if (currentInstance) {
    currentInstance.beforeUpdate.push(fn);
  } else {
    console.error("onBeforeUpdate函数只能在setup函数中调用");
  }
}

export function onUpdated(fn) {
  if (currentInstance) {
    currentInstance.updated.push(fn);
  } else {
    console.error("onUpdated函数只能在setup函数中调用");
  }
}

export function onBeforeUnmount(fn) {
  if (currentInstance) {
    currentInstance.beforeUnmount.push(fn);
  } else {
    console.error("onBeforeUnmount函数只能在setup函数中调用");
  }
}

export function onUnmounted(fn) {
  if (currentInstance) {
    currentInstance.unMounted.push(fn);
  } else {
    console.error("onUnmounted函数只能在setup函数中调用");
  }
}

// 封装操作dom的api到options
export function createRenderer(options) {
  const {
    createElement,
    insert,
    setElementText,
    patchProps,
    setText,
    createText,
    createComment,
    setComment,
    createFragment,
  } = options;

  function render(vnode, container) {
    if (vnode) {
      // 新vnode存在，将其与旧vnode一起传递给patch函数
      patch(container._vnode, vnode, container);
    } else {
      // 旧vnode存在，且新vnode不存在，说明是卸载操作，只需要清空innerHTML即可
      if (container._vnode) {
        unmount(container._vnode);
      }
    }

    // 存储新vnode到container
    container._vnode = vnode;
  }

  function patch(vnode1, vnode2, container, anchor) {
    // 如果vnode1存在且两个的type不同，则要卸载原老节点
    if (vnode1 && vnode1.type !== vnode2.type) {
      unmount(vnode1); // 卸载老节点
      vnode1 = null;
    }

    const { type } = vnode2;
    // 如果类型是string表示原生的元素节点
    if (typeof type === "string") {
      // 如果vnode1不存在，意味着不存在旧节点，处于mount阶段，否则处于更新阶段
      if (!vnode1) {
        // 将锚点元素传递给mountElement
        mountElement(vnode2, container, anchor);
      } else {
        patchElement(vnode1, vnode2);
      }
    }
    // 新vnode类型是一个Text表示是个文本节点
    else if (type === Text) {
      // 旧节点vnode1不存在时，创建新的文本节点
      if (!vnode1) {
        const el = (vnode2.el = createText(vnode2.children));
        insert(el, container);
      } else {
        // 旧节点vnode1存在时，看其children是否一样，如果不一样则修改nodeValue
        const el = (vnode2.el = vnode1.el);
        if (vnode1.children !== vnode2.children) {
          setText(el, vnode2.nodeValue);
        }
      }
    } else if (type === Comment) {
      if (!vnode1) {
        const el = (vnode2.el = createComment(vnode2.children));
        insert(el, container);
      } else {
        const el = (vnode2.el = vnode1.el);
        if (vnode1.children !== vnode2.children) {
          setComment(el, vnode2.nodeValue);
        }
      }
    } else if (type === Fragment) {
      // 创建节点片段
      const el = (vnode2.el = createFragment());
      vnode2.children.forEach((r) => patch(null, r, el));
      // 旧节点vnode1不存在，直接insert
      if (!vnode1) {
        insert(el, container);
      } else {
        // 旧节点vnode1存在，只需更新Fragment的children
        patchChildren(vnode1, vnode2, container);
      }
    } else if (typeof type === "object") {
      if (!vnode1) {
        mountComponent(vnode2, container, anchor);
      } else {
        patchComponent(vnode1, vnode2, anchor);
      }
    }
  }

  function patchComponent(vnode1, vnode2, anchor) {
    // 获取组件实例，并让vnode2.Component也指向vnode1.Component
    const instance = (vnode2.Component = vnode1.Component);
    // 获取当前组件实例的props数据
    const { props } = instance;
    // 如果props变了，则需要更改props
    if (hasPropsChanged(vnode1.props, vnode2.props)) {
      // 获取vnode2的props
      const { props: nextProps } = resolveProps(
        vnode2.type.props,
        vnode2.props
      );
      // 更改或添加旧组件的props
      for (const k in nextProps) {
        props[k] = nextProps[k];
      }

      // 删除旧组件不存在的prop
      for (const k in props) {
        if (!(k in nextProps)) {
          delete props[k];
        }
      }
    }
  }

  function mountComponent(vnode, container, anchor) {
    const componentOptions = vnode.type;
    const {
      render,
      data,
      beforeCreate,
      created,
      beforeMount,
      mounted,
      beforeUpdate,
      updated,
      setup,
      props: propOptions,
    } = componentOptions;

    const { attrs, props, listeners } = resolveProps(propOptions, vnode.props); // propOptions是子组件声明接收的props选项，vnode.props是传递给组件的props数据
    let slots = vnode.children || {};
    // 保存组件实例，以及生命周期，数据等
    const state = data ? reactive(data()) : null; // 调用data函数得到原始数据，用reactive使其具有响应式
    const instance = {
      state,
      attrs: shallowReactive(attrs), // 注入attrs
      listeners: shallowReadonly(listeners),
      props: shallowReactive(props), // 注入props
      isMounted: false,
      subTree: null,
      slots,
      // 以下存储组件在setup注册的生命周期钩子函数，在组件合适的时机forEach调用
      beforeMount: [],
      mounted: [],
      beforeUpdate: [],
      updated: [],
      beforeUnmount: [],
      unMounted: [],
    };

    // setup第二个参数的emit方法
    function emit(event, ...payload) {
      const eventName = `on${event[0].toUpperCase() + event.slice(1)}`;
      const handler = instance.listeners[eventName];
      if (handler) {
        handler(...payload);
      } else {
        console.error("事件不存在");
      }
    }

    let setupState = null;
    if (setup) {
      const setupContext = { attrs, emit, slots }; // setup第二个参数
      setCurrentInstance(instance); // 在调用setup之前设置currentInstance，这样用户可以在setup中拿到其组件实例
      const setupResult = setup(shallowReadonly(props), setupContext); // 执行setup，获取其返回值
      setCurrentInstance(null); // 在调用setup之后还原为null
      if (typeof setupResult === "function") {
        if (render)
          console.error("setup函数返回值是函数时，render选项将被忽略");
        render = setupResult;
      } else {
        // setup返回值不是函数，则赋值给setupState
        setupState = setupResult;
      }
    }

    beforeCreate && beforeCreate(); // beforeCreate生命周期
    vnode.Component = instance;

    // 创建上下文，本质是instance的代理对象
    const renderContext = new Proxy(instance, {
      get(t, k, r) {
        const { state, props, attrs, slots } = t;
        if (k === "$slots") return slots;
        else if (state && k in state) {
          return state[k];
        } else if (k in props) {
          return props[k];
        } else if (setupState && k in setupState) {
          // 如果setup返回了一个对象，优先取setup返回的对象里面的值
          return setupState[k];
        } else if (k in attrs) {
          return attrs[k];
        } else {
          console.error("不存在哦");
        }
      },
      set(t, k, v, r) {
        const { state, props } = t;
        if (state && k in state) {
          state[k] = v;
        } else if (k in props) {
          props[k] = v;
        } else if (setupState && k in setupState) {
          // 除了props，如果setup返回了对象，则设置该值
          setupState[k] = v;
        } else if (k in attrs) {
          attrs[k] = v;
        } else {
          console.error("不存在哦");
        }
      },
    });

    instance.context = renderContext;

    created && created.call(renderContext); // created生命周期
    // 定义副作用函数，副作用函数就是执行挂载节点和更新节点的
    effect(
      () => {
        const subTree = render.call(renderContext, renderContext); // 设置render函数的this为state，并传递state到render函数
        // 如果组件已经mount，则要进行对比旧节点打补丁
        if (!instance.isMounted) {
          instance.beforeMount &&
            instance.beforeMount.forEach((hook) => hook.call(renderContext)); // 执行setup中onBeforeMount钩子函数
          beforeMount && beforeMount.call(renderContext); // beforeMount生命周期
          patch(null, subTree, container, anchor);
          instance.mounted &&
            instance.mounted.forEach((hook) => hook.call(renderContext)); // 执行setup中onMounted钩子函数
          mounted && mounted.call(renderContext); // mounted生命周期
          instance.isMounted = true;
        } else {
          instance.beforeUpdate &&
            instance.beforeUpdate.forEach((hook) => hook.call(renderContext)); // 执行setup中onBeforeUpdate钩子函数
          beforeUpdate && beforeUpdate.call(renderContext); // beforeUpdate生命周期
          patch(instance.subTree, subTree, container, anchor);
          instance.updated &&
            instance.updated.forEach((hook) => hook.call(renderContext)); // 执行setup中onBeforeUpdate钩子函数
          updated && updated.call(renderContext); // updated生命周期
        }
        instance.subTree = subTree; // 设置subTree，用于patch比较和Unmount操作
      },
      {
        // 指定调度器为queueJob，使组件的更新有缓冲
        scheduler: queueJob,
      }
    );
  }

  function patchElement(vnode1, vnode2) {
    const el = (vnode2.el = vnode1.el);
    const oldProps = vnode1.props;
    const newProps = vnode2.props;

    // 更新属性：将新属性和旧属性做对比分别path到el的属性上
    for (const key in newProps) {
      if (newProps[key] !== oldProps[key]) {
        patchProps(el, key, oldProps[key], newProps[key]);
      }
    }

    for (const key in oldProps) {
      if (!(key in newProps)) {
        patchProps(el, key, oldProps[key], null);
      }
    }

    // patch children
    patchChildren(vnode1, vnode2, el);
  }

  function patchChildren(vnode1, vnode2, el) {
    // 如果新的vnode的children是文本，卸载vnode1，然后设置文本
    if (typeof vnode2.children === "string") {
      if (Array.isArray(vnode1.children)) {
        vnode1.children.forEach((r) => unmount(r));
      }

      setElementText(el, vnode2.children);
    }
    // 如果vnode2的children是一组节点
    else if (Array.isArray(vnode2.children)) {
      if (Array.isArray(vnode1.children)) {
        patchKeyedChildren(vnode1, vnode2, el);
      } else {
        // 其他不符合的情况，就节点奥么是文本节点，要么不存在，则需要把节点内容清空，然后挂载新节点的children即可
        setElementText(el, "");
        vnode2.children.forEach((r) => patch(null, r, el));
      }
    } else {
      // 新节点vnode2不存在，vnode1是文本节点，清空内容
      if (typeof vnode1.children === "string") {
        setElementText(el, "");
      } else if (Array.isArray(vnode1.children)) {
        // 新节点vnode2不存在，vnode1子节点是一组节点，挨个unmount
        vnode1.children.forEach((r) => unmount(r));
      } else {
        // 如果两个vnode都不存在，啥也不做
      }
    }
  }

  // 快速diff算法
  function patchKeyedChildren(vnode1, vnode2, el) {
    const oldChildren = vnode1.children;
    const newChildren = vnode2.children;

    let j = 0;
    let oldVNode = oldChildren[j];
    let newVNode = newChildren[j];
    // 从前向后遍历，直到遇到不同的key为止，先把头部相同key的处理掉
    while (oldVNode.key === newVNode.key) {
      patch(oldVNode, newVNode, el);
      j++;
      oldVNode = oldChildren[j];
      newVNode = newChildren[j];
    }

    let oldEnd = oldChildren.length - 1;
    let newEnd = newChildren.length - 1;
    oldVNode = oldChildren[oldEnd];
    newVNode = newChildren[newEnd];
    // 从后向前遍历，直到遇到不同的key为止，再把尾部相同key的处理掉
    while (oldVNode.key === newVNode.key) {
      patch(oldVNode, newVNode, el);
      oldEnd--;
      newEnd--;
      oldVNode = oldChildren[oldEnd];
      newVNode = newChildren[newEnd];
    }

    // oldEnd < j，说明处理过程中，所有的旧节点都处理完了
    // newEnd >= j，说明处理过程中，还有未被处理的新节点
    if (j > oldEnd && j <= newEnd) {
      const anchorIndex = newEnd + 1;

      // 锚点元素为未处理的新的一组节点的尾部节点，以该节点作为基准插入到该节点前
      const anchor =
        anchorIndex < newChildren.length ? newChildren[anchorIndex].el : null;

      // j到newEnd之间的节点需要新增到对应锚点元素之前
      while (j <= newEnd) {
        patch(null, newChildren[j++], el, anchor);
      }
    }
    // j大于newEnd，但小于oldEnd，说明，旧节点多了，需要unmount
    else if (j > newEnd && j <= oldEnd) {
      while (j <= oldEnd) {
        unmount(oldChildren[j++]);
      }
    }
    // 其他情况，表示非理想情况，可能乱序的，可能有新增，也可能有删除，也可能有移动
    else {
      // 填充source数据（source是存储剩余未处理的新的一组子节点在旧的一组子节点中的索引）
      const count = newEnd - j + 1;
      const source = new Array(count).fill(-1);
      const oldStart = j;
      const newStart = j;
      let moved = false; // 是否需要移动节点
      let pos = 0;

      // 建立一张索引表，存储未处理的新节点每个key所在未处理的新节点中的索引；
      const keyIndex = {};
      let patched = 0; // 代表更新过的节点数量
      for (let i = newStart; i <= newEnd; i++) {
        keyIndex[newChildren[i].key] = i;
      }

      // 遍历未处理的旧节点
      for (let i = oldStart; i <= oldEnd; i++) {
        oldVNode = oldChildren[i];

        // 如果已更新的节点大于了要更新的节点数量，说明旧节点多余了，需要卸载
        if (patched <= count) {
          const k = keyIndex[oldVNode.key];
          // 通过索引表找到了该key对应的索引，更新
          if (typeof k !== "undefined") {
            newVNode = newChildren[k];
            patch(oldVNode, newVNode, el);
            patched++;
            source[k - newStart] = i; // 设置索引
            // 如果索引呈现递增趋势，说明不需要移动节点（移动其他节点达到移动的目的），反之需要移动
            if (k < pos) {
              moved = true;
            } else {
              pos = k; // 始终保持k为当前最大的子序列的最大的那个值的索引
            }
          } else {
            // 没有找到执行umount操作
            unmount(oldVNode);
          }
        } else {
          unmount(oldVNode);
        }
      }

      // 如果需要移动
      if (moved) {
        const seq = getSequence(source); // getSequence为寻找最长递增子序列的方法，seq为最长递增子序列的索引数组、
        let s = seq.length - 1; // s是最长递增子序列的最后一个索引
        let i = count - 1; // i指向新未处理的一组子节点最后一个元素
        // 从新的一组未处理的子节点从后向前遍历
        for (i; i >= 0; i--) {
          // 没找着新的，需要增加
          if (source[i] === -1) {
            const pos = i + newStart; // 需要挂载的新的未处理的子节点的索引
            const newVNode = newChildren[pos];
            const nextPos = pos + 1; // 该节点的下一个节点的位置索引
            const anchor =
              nextPos < newChildren.length ? newChildren[nextPos].el : null; // 找到锚点元素，锚元素时下一个节点，插入到下一个节点之前
            patch(null, newVNode, el, anchor);
          } else if (i !== seq[s]) {
            // 如果节点的索引和当前最长自增子序列的最后一个元素所对应的值不同，说明该节点需要移动
            // 以下为找到该节点和该节点下一个节点的位置将下一个节点作为锚点元素
            const pos = i + newStart;
            const newVNode = newChildren[pos];
            const nextPos = pos + 1;
            const anchor =
              nextPos < newChildren.length ? newChildren[nextPos].el : null;
            insert(newVNode.el, el, anchor);
          } else {
            // 当i === seq[s]时，说明该节点不需要移动，只要让s指向下一个位置
            s--;
          }
        }
      }
    }
  }

  // 双端diff算法
  function patchKeyedChildrenDE(vnode1, vnode2, el) {
    const oldChildren = vnode1.children;
    const newChildren = vnode2.children;

    let oldStartIdx = 0;
    let oldEndIdx = oldChildren.length - 1;
    let newStartIdx = 0;
    let newEndIdx = newChildren.length - 1;

    let oldStartVNode = oldChildren[oldStartIdx];
    let oldEndVNode = oldChildren[oldEndIdx];
    let newStartVNode = newChildren[newStartIdx];
    let newEndVNode = newChildren[newEndIdx];

    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      // 如果旧节点经过比较移动了位置，需要跳过
      if (!oldStartVNode) {
        oldStartVNode = oldChildren[++oldStartIdx];
      } else if (!oldEndVNode) {
        oldEndVNode = newChildren[--oldEndIdx];
      } else if (oldStartVNode.key === newStartVNode.key) {
        // 第一步 oldStartVNode和newStartVNode比较，如果相同，则表示oldStartVNode节点可复用，由于两个都位于第一，不需要交换DOM位置，但还需要patch
        patch(oldStartVNode, newStartVNode, el);
        oldStartVNode = oldChildren[++oldStartIdx];
        newStartVNode = newChildren[++newStartIdx];
      } else if (oldEndVNode.key === newEndVNode.key) {
        // 第二步 oldEndVNode和newEndVNode比较，如果相同，则表示oldEndVNode节点可复用，由于两个都位于最后，不需要交换DOM位置，但还需要patch
        patch(oldEndVNode, newEndVNode, el);
        oldEndVNode = oldChildren[--oldEndIdx];
        newEndVNode = newChildren[--newEndIdx];
      } else if (oldStartVNode.key === newEndVNode.key) {
        // 第二步 oldStartVNode和newEndVNode比较，如果相同，则表示oldStartVNode节点可复用，只需要把oldStartVNode的el插入到oldEndVNode的el的下一个兄弟节点前
        patch(oldStartVNode, newEndVNode, el);
        insert(oldStartVNode.el, el, oldEndVNode.el.nextSibling);

        oldStartVNode = oldChildren[++oldStartIdx];
        newEndVNode = newChildren[--newEndIdx];
      } else if (oldEndVNode.key === newStartVNode.key) {
        // 第二步 oldEndVNode和newStartVNode比较，如果相同，则表示oldEndVNode节点可复用，只需要把oldEndVNode的el插入到oldStartVNode.el前
        patch(oldEndVNode, newStartVNode, el);
        insert(oldEndVNode.el, el, oldStartVNode.el);

        oldEndVNode = oldChildren[--oldEndIdx];
        newStartVNode = newChildren[++newStartIdx];
      } else {
        // 两端都没找到可复用的节点，遍历旧的一组节点，视图寻找newStartVNode有相同key的节点
        const idxInOld = oldChildren.findIndex(
          (r) => r && r.key === newStartVNode.key
        );
        console.log(newStartVNode, idxInOld);
        // 找到了可复用的节点
        if (idxInOld > 0) {
          // vnodeToMove就是对应vnode需要移动的节点
          const vnodeToMove = oldChildren[idxInOld];

          patch(vnodeToMove, newStartVNode, el);

          // 将vnodeToMove的el移到oldStartVNode的el前
          insert(vnodeToMove.el, el, oldStartVNode.el);

          // 由于当前位置的vnode所对应的el已经移动，这里置空
          oldChildren[idxInOld] = undefined;
        } else {
          // 没找到可复用的节点代表是新节点，需要增加，将newStartVNode挂载到头部
          patch(null, newStartVNode, el, oldStartVNode.el);
        }
        newStartVNode = newChildren[++newStartIdx];
      }
    }

    // 循环结束后，检查一下是否新节点遗漏（旧的循环完了，新的还没循环完），需要增加
    if (oldEndIdx < oldStartIdx && newStartIdx <= newEndIdx) {
      for (let i = newStartIdx; i < newEndIdx; i++) {
        patch(null, newChildren[i], el, oldStartVNode.el);
      }
    }
    // 循环结束，旧的没循环完，新的循环完了，需要移除
    else if (oldStartIdx <= oldEndIdx && newEndIdx < newStartIdx) {
      for (let i = oldStartIdx; i < oldEndIdx; i++) {
        unmount(oldChildren[i]);
      }
    }
  }

  // 简单diff算法
  function patchKeyedChildrenSimple(vnode1, vnode2, el) {
    //TODO: 如果新旧节点的子节点都是一组节点，这里就涉及到Diff算法，这里为保证功能可用，直接将原子节点清空，再挂载新的
    const oldChildren = vnode1.children;
    const newChildren = vnode2.children;
    let lastIndex = 0;
    for (let i = 0; i < newChildren.length; i++) {
      const newVNode = newChildren[i];
      let j = 0;
      let find = false; // 是否找到相同key的节点，如果没有代表要新增
      for (j; j < oldChildren.length; j++) {
        const oldVNode = oldChildren[j];
        // 找到key相同的节点，调用patch更新节点
        if (newVNode.key === oldVNode.key) {
          find = true;
          patch(oldVNode, newVNode, el);
          if (j < lastIndex) {
            // 如果当前找到的节点在旧children中的索引小于最大索引值lastIndex，说明该节点对应的真实DOM需要移动
            // 如果当前vnode的索引值大于lastIndex，不需要移动，因为其他节点必然有小于他的，让其他节点移动
            // 先获取newvNode取得前一个vnode
            const prevNode = newChildren[i - 1];
            // 如果prevNode不存在，则说明当前newVNode是第一个节点，它不需要移动
            if (prevNode) {
              // 由于需要将newVNode对应的真实DOM移动到prevNode所对应的真实DOM后，需要获取prevNode所对应的真实DOM的下一个兄弟节点，插入到该兄弟节点前
              const anchor = prevNode.el.nextSibling;
              insert(newVNode.el, el, anchor);
            }
          } else {
            lastIndex = j; // 始终保持lastIndex是当前最大的索引，如果在该轮中，查找到的老索引小于当前最大的索引，则表示要移动
          }
          break;
        }
      }
      // 找了一轮发现还没找到要新增DOM
      if (!find) {
        // 为了将节点挂载到正确位置，需要获取该新节点的前一个vnode节点
        const prevNode = newChildren[i - 1];
        let anchor = null;
        if (prevNode) {
          // 如果有前一个vnode节点，则使用它的下一个兄弟节点作为锚点元素
          anchor = prevNode.el.nextSibling;
        } else {
          // 如果没有前一个节点，说明当前节点是第一个节点，用当前el的firstChild作为锚点元素
          anchor = el.firstChild;
        }

        patch(null, newVNode, el, anchor);
      }
    }

    // 更新操作结束之后，检查一遍oldChildren，找到oldChildren中key在newChildren中没有的节点，将其删除
    for (let i = 0; i < oldChildren.length; i++) {
      const oldVNode = oldChildren[i];
      const hasExist = newChildren.find((vnode) => vnode.key === oldVNode.key);
      if (!hasExist) {
        unmount(oldVNode);
      }
    }
  }

  function mountElement(vnode, container, anchor) {
    // 创建dom元素，并将dom元素挂载到vnode.el
    const el = (vnode.el = createElement(vnode.type));

    // 挂载prop
    if (vnode.props) {
      for (const propKey in vnode.props) {
        const value = vnode.props[propKey];
        patchProps(el, propKey, null, value);
      }
    }

    // 如果子节点是字符串类型，设置其文本
    if (typeof vnode.children === "string") {
      setElementText(el, vnode.children);
    } else if (Array.isArray(vnode.children)) {
      // 递归渲染子节点
      vnode.children.forEach((child) => {
        patch(null, child, el);
      });
    }

    // 挂载元素时可以指定锚点元素
    insert(el, container, anchor);
  }

  return {
    render,
  };
}
