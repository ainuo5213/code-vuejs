import { ref } from "../reactivity/reactivity.js";
import { onUnmounted, Text } from "./renderer.js";

/**
 * 定义异步组件：options可以是个函数：() => import('path/to/component')
 * options也可以是个对象： {
 *      loader: () => import('path/to/component'), // 加载loader所代表的组件
 *      timeout: 3000, // 加载loader所代表组件的超时时间
 *      errorComponent: ErrorComponent, // 加载loader所代表组件加载超时或出错时显示的组件
 *      loadingComponent: LoadingComponent, // 加载loader所代表的组件时在加载时的加载组件
 *      delay: 300 // 加载loadingComponent的延迟，在delay这段时间后才显示loadingComponent
 *  }
 */
export function defineAsyncComponent(options) {
  if (typeof options === "function") {
    options = {
      loader: options,
    };
  }
  const { loader } = options;
  let InnerComp = null;
  let retries = 0; // 重试次数
  function load() {
    return loader().catch((err) => {
      if (options.onError) {
        return new Promise((resolve, reject) => {
          // retry函数可以形成无限递归，前提用户加载组件一直出错，且不做控制地调用
          const retry = () => {
            resolve(load());
            retries++;
          };
          const fail = () => reject(err);
          options.onError(retry, fail, retries);
        });
      } else {
        throw err;
      }
    });
  }
  return {
    name: "AsyncComponentWrapper",
    setup() {
      const loaded = ref(false);
      const timeout = ref(false);
      const error = ref(null); // 记录错误信息
      const loading = ref(false); // 组件是否正在加载中
      let loadingTimer = null;
      // 设置了delay的话，则要loading.value为true时才展示loadingComponent
      if (options.delay) {
        loadingTimer = setTimeout(() => {
          loading.value = true;
        }, options.delay);
      }
      // 异步加载组件
      load()
        .then((c) => {
          InnerComp = c;
          loaded.value = true;
        })
        .catch((err) => {
          error.value = err;
        })
        .finally(() => {
          loading.value = false;
          clearTimeout(loadingTimer); // 在加载完成或出错时清除loadingTimer定时器
        });
      let timer = null;
      // 如果设置了超时时间，则在超时时设置timeout.value
      if (options.timeout) {
        timer = setTimeout(() => {
          timeout.value = true;
          error.value = new Error("异步组件加载超时");
        }, options.timeout);
      }

      // 在组件被卸载时，清除定时器
      onUnmounted(() => {
        clearTimeout(timer);
      });

      const placeHolder = { type: Text, children: "" };

      return () => {
        if (loaded.value) {
          // 组件已经加载好了
          return { type: InnerComp };
        } else if (error.value && options.errorComponent) {
          // 组件加载出错（超时/报错），将错误丢给errorComponent
          return {
            type: options.errorComponent,
            props: { error: error.value },
          };
        } else if (loading.value && options.loadingComponent) {
          // 加载中展示loadingComponent
          return {
            type: options.loadingComponent,
          };
        }
        return placeHolder;
      };
    },
  };
}
