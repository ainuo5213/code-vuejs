export function shouldSetAsProps(el, key, value) {
  // 当设置Input的form属性时，该属性是只读的，不能直接设置，只能通过setAttribute设置
  if (key === "form" && el.tagName === "INPUT") {
    return false;
  }

  return key in el;
}
// 封装操作dom的api到options
export function createRenderer(options) {
  const { createElement, insert, setElementText, patchProps } = options;
  function render(vnode, container) {
    if (vnode) {
      // 新vnode存在，将其与旧vnode一起传递给patch函数
      patch(container._vnode, vnode, container);
    } else {
      // 旧vnode存在，且新vnode不存在，说明是卸载操作，只需要清空innerHTML即可
      if (container._vnode) {
        container.innerHTML = "";
      }
    }

    // 存储新vnode到container
    container._vnode = vnode;
  }

  function patch(vnode1, vnode2, container) {
    // 如果vnode1不存在，意味着不存在旧节点，处于mount阶段
    if (!vnode1) {
      mountElement(vnode2, container);
    } else {
      // vnode1存在，意味着打补丁
    }
  }

  function mountElement(vnode, container) {
    // 创建dom元素
    const el = createElement(vnode.type);

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
