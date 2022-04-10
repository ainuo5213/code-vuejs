import { getCurrentInstance } from "../renderer.js";
const cache = new Map(); // 缓存对象
export const KeepAlive = {
  __isKeepAlive: true,
  props: {
    include: RegExp,
    exclude: RegExp,
  },
  setup(props, { slots }) {
    const instance = getCurrentInstance(); // 获取当前组件实例
    const { move, createElement } = instance.keepAliveContext; // 拿到keepalive组件的有关渲染的方法
    const storageContainer = createElement("div"); // 创建容器

    // 添加俩内部方法
    // 隐藏vnode
    instance._deActivate = (vnode) => {
      move(vnode, storageContainer);
    };

    // 激活vnode
    instance._activate = (vnode, container, anchor) => {
      move(vnode, container, anchor);
    };

    return () => {
      let rawVNode = slots.default(); // 获取组件默认插槽的内容
      // 如果插槽不是组件，直接渲染
      if (typeof rawVNode.type !== "object") {
        return rawVNode;
      }

      const componentName = rawVNode.type.name;
      console.log(componentName)
      if (
        componentName &&
        ((props.include && !props.include.test(componentName)) ||
          (props.exclude && props.exclude.test(componentName)))
      ) {
        return rawVNode;
      }

      // 取得缓存中的vnode
      const cachedVNode = cache.get(rawVNode.type);
      // 如果vnode存在
      if (cachedVNode) {
        // 给当前默认插槽的组件设置Component上下文
        rawVNode.Component = cachedVNode.Component;
        // 添加一个keptAlive标志，标记组件正在被激活
        rawVNode.keptAlive = true;
      } else {
        cache.set(rawVNode.type, rawVNode);
      }

      // 添加一个属性shouldKeepAlive，避免渲染器真的将该组件卸载
      rawVNode.shouldKeepAlive = true;
      // 设置该vnode组件的实例对象，以便被渲染器访问
      rawVNode.keepAliveInstance = instance;
      return rawVNode;
    };
  },
};
