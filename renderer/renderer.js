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

  // 双端diff算法
  function patchKeyedChildren(vnode1, vnode2, el) {
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
        // 第二步 oldStartVNode和newEndVNode比较，如果相同，则表示oldStartVNode节点可复用，只需要把oldVNode的el插入到oldEndVNode的el的下一个兄弟节点前
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
        console.log(newStartVNode, idxInOld)
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
  function patchKeyedChildren_simple(vnode1, vnode2, el) {
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
