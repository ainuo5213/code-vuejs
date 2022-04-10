export const Teleport = {
  __isTeleport: true,
  process(vnode1, vnode2, container, anchor, internals) {
    /**
     * vnode2: {
     *  type: Teleport,
     *  children: [{ type: 'div', children: 'text' }],
     *  props: {
     *     to: document.body
     *  }
     * }
     */
    const { patch, patchChildren, move } = internals;
    if (!vnode1) {
      // 获取容器
      const target =
        typeof vnode2.props.to === "string"
          ? document.querySelector(vnode2.props.to)
          : vnode2.props.to;
      // 以此挂载其子节点到目标容器
      vnode2.children.forEach((r) => patch(null, r, target, anchor));
    } else {
      // 更新
      patchChildren(vnode1, vnode2, container);

      // 新旧节点的to不一样，挂载到的容器也不一样
      if (vnode1.props.to !== vnode2.props.to) {
        const newTarget =
          typeof vnode2.props.to === "string"
            ? document.querySelector(vnode2.props.to)
            : vnode2.props.to;
        vnode2.children.forEach((r) => move(r, newTarget));
      }
    }
  },
};
