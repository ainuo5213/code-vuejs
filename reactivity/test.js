import { effect, proxyRefs, reactive, ref, toRef, toRefs } from "./reactivity.js";

const obj = reactive({ foo: 1, bar: 2 });

const val = proxyRefs({...toRefs(obj)})

effect(() => {
  console.log(val);
})

window.val = val;

// const s = new Set([1, 2, 3]);
// const p = reactive(s);
// effect(() => {
//   for (const [key, value] of p) {
//     console.log(key, value);
//   }
// });
// window.p = p;
// const arr = reactive([]);
// effect(() => {
//   arr.push(1);
// });
// effect(() => {
//   arr.push(1);
// });
// const arr = reactive(["foo", "bar"]);
// effect(() => {
//   console.log(arr.fill(","));
// });
// window.arr = arr;

// const obj = {
//   foo: {
//     bar: 2,
//   },
// };
// const data = readonly(obj);

// effect(() => {
//   console.log(data.foo);
// });

// setTimeout(() => {
//   data.foo.bar = 222;
//   delete data.foo.bar;
// }, 2000);

// const obj = {};
// const proto = { bar: 1 };
// const child = reactive(obj);
// const parent = reactive(proto);
// Object.setPrototypeOf(child, parent);

// effect(() => {
//   console.log(child.bar);
// });

// function sleep() {
//   return new Promise((resolve) => {
//     setTimeout(resolve, 3000);
//   });
// }

// let finalData;
// watch(
//   () => obj.foo,
//   async (newValue, oldValue, onInvalidate) => {
//     let expired = false;
//     onInvalidate(() => {
//       expired = true;
//     });
//     await sleep();

//     // 如果当前副作用周期已过期则舍弃其结果，只要未过期时的值
//     if (!expired) {
//       finalData = newValue;
//     }
//     console.log(`数据发生了变化：${oldValue} => ${newValue}`);
//   },
//   {
//     immediate: false,
//     // 回调函数会在watch创建时立即执行一次
//     flush: "sync", // 还可指定 pre | sync
//   }
// );

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
