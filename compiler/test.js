import { createRenderer, shouldSetAsProps } from "./compiler.js";

const vnode = {
  type: "h1",
  props: {
    id: "foo",
  },
  children: [
    {
      type: "button",
      children: "hello",
      props: {
        disabled: true,
      },
    },
  ],
};

const renderer = createRenderer({
  createElement(tag) {
    return document.createElement(tag);
  },

  setElementText(el, text) {
    el.textContent = text;
  },

  insert(el, parent, anchor = null) {
    console.log(parent, el);
    parent.insertBefore(el, anchor);
  },

  patchProps(el, propKey, prevValue, nextValue) {
    // 如果是DOM Properties（DOM Properties为DOM本身的属性，可直接访问而不通过getAttribute访问，例如button.disabled, input.value等）
    if (shouldSetAsProps(el, propKey, nextValue)) {
      const type = typeof el[propKey];
      // 如果用户设置的是boolean类型但传值穿了一个空字符串，这个时候手动矫正为true
      if (type === "boolean" && nextValue === "") {
        el[propKey] = true;
      } else {
        el[propKey] = nextValue;
      }
    }
    // 如果不是DOM Properties设置Attribute Properties
    else {
      el.setAttribute(propKey, nextValue);
    }
  },
});

renderer.render(vnode, document.querySelector("#app"));
