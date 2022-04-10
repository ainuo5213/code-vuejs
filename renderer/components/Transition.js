import { nextTick } from "../nextTick.js";

function formatClassName(prefix) {
  return (className) => {
    return `${prefix}-${className}`;
  };
}

export const Transition = {
  name: "Transition",
  props: {
    name: String,
  },
  setup(props, { slots }) {
    const name = props.name;
    const prefix = name || "v";
    const withClassName = formatClassName(prefix);
    const enterFromClassName = withClassName("enter-from");
    const enterActiveClassName = withClassName("enter-active");
    const enterToClassName = withClassName("enter-to");
    const leaveFromClassName = withClassName("leave-from");
    const leaveActiveClassName = withClassName("leave-active");
    const leaveToClassName = withClassName("leave-to");
    const innerNode = slots.default();
    if (innerNode.children.length > 1) {
      console.warn("transition组件最多只能有一个子节点");
    }
    return () => {
      innerNode.transition = {
        beforeEnter(el) {
          el.classList.add(enterFromClassName);
          el.classList.add(enterActiveClassName);
        },
        enter(el) {
          nextTick(() => {
            el.classList.remove(enterFromClassName);
            el.classList.add(enterToClassName);
            el.addEventListener("transitionend", () => {
              el.classList.remove(enterToClassName);
              el.classList.remove(enterActiveClassName);
            });
          });
        },
        leave(el, removeAction) {
          el.classList.add(leaveFromClassName);
          el.classList.add(leaveActiveClassName);
          reflow();
          nextTick(() => {
            el.classList.remove(leaveFromClassName);
            el.classList.add(leaveToClassName);
            el.addEventListener("transitionend", () => {
              el.classList.remove(leaveToClassName);
              el.classList.remove(leaveActiveClassName);
              removeAction();
            });
          });
        },
      };

      return innerNode;
    };
  },
};
