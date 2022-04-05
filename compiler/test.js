import {
  createRenderer,
  shouldSetAsProps,
  normalizeClass,
  Fragment,
} from "./compiler.js";

const renderer = createRenderer({
  createElement(tag) {
    return document.createElement(tag);
  },

  setElementText(el, text) {
    el.textContent = text;
  },

  insert(el, parent, anchor = null) {
    parent.insertBefore(el, anchor);
  },

  patchProps(el, propKey, prevValue, nextValue) {
    // 以on开头则判定为事件绑定
    if (/^on/.test(propKey)) {
      let invokers = el._v_inv || (el._v_inv = {});
      const eventName = propKey.slice(2).toLowerCase();
      let invoker = invokers[eventName];
      // 如果有绑定的事件处理函数则要挂载，否则需要卸载
      if (nextValue) {
        // 如果没有invoker就需要单独封装一次
        if (!invoker) {
          // 赋值invoker
          invoker = el._v_inv[eventName] = (e) => {
            // 如果事件的发生事件小于事件绑定的时间，则不执行回调
            if (e.timeStamp < invoker.attached) return;
            // 如果该类型的invoker的value是一个数组则依次执行
            if (Array.isArray(invoker.value)) {
              invoker.forEach((cb) => cb(e));
            } else {
              invoker.value(e);
            }
          };

          // 设置invoke的value为新的事件处理函数
          invoker.value = nextValue;

          // 添加事件的绑定时间
          invoker.attached = performance.now();

          // 绑定监听事件
          el.addEventListener(eventName, invoker);
        } else {
          invoker.value = nextValue;
        }
      } else if (invoker) {
        el.removeEventListener(eventName, invoker);
      }
      console.log(el._v_inv);
    }
    if (propKey === "class") {
      el.className = nextValue;
    }
    // 如果是DOM Properties（DOM Properties为DOM本身的属性，可直接访问而不通过getAttribute访问，例如button.disabled, input.value等）
    else if (shouldSetAsProps(el, propKey, nextValue)) {
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

  setText(el, text) {
    el.nodeValue = text;
  },

  createText(text) {
    return document.createTextNode(text);
  },

  createComment(comment) {
    return document.createComment(comment);
  },

  setComment(el, comment) {
    el.nodeValue = comment;
  },

  createFragment() {
    return document.createDocumentFragment();
  },
});

const newVNode = {
  type: "ul",
  props: {
    class: normalizeClass({
      div: true,
      active: true,
    }),
  },
  children: [
    { type: "li", children: "1" },
    { type: "li", children: "2" },
    { type: "li", children: "3" },
  ],
};
renderer.render(newVNode, document.querySelector("#app"));

const newVNode1 = {
  type: "ul",
  props: {
    class: normalizeClass({
      div: true,
      active: true,
    }),
  },
  children: [
    { type: "li", children: "1" },
    { type: "li", children: "2" },
    { type: "li", children: "3" },
    { type: "li", children: "4" },
  ],
};
renderer.render(newVNode1, document.querySelector("#app"));
