export const Text = Symbol();
export const Comment = Symbol();
export const Component = Symbol();
export const Fragment = Symbol();
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

  function patch(vnode1, vnode2, container) {
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
        mountElement(vnode2, container);
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
    } else {
    }
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
        //TODO: 如果新旧节点的子节点都是一组节点，这里就涉及到Diff算法，这里为保证功能可用，直接将原子节点清空，再挂载新的
        vnode1.children.forEach((r) => unmount(r));
        vnode2.children.forEach((r) => patch(null, r, el));
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

  function mountElement(vnode, container) {
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

    // 挂载元素
    insert(el, container);
  }

  return {
    render,
  };
}
