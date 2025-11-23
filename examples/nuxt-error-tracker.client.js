// plugins/error-tracker.client.js
import WebErrorTracker from "@angelaboy/web-error-tracker";

export default defineNuxtPlugin((nuxtApp) => {
  // 初始化 SDK
  WebErrorTracker.init({
    reportUrl: "http://localhost:3300/users/errors", // ⚠️ 改成你的真实 API 地址
    project: "my-nuxt-app",
    version: "1.0.0",
    environment: process.env.NODE_ENV,
    debug: true, // 🔥 开启 debug 查看日志
    deduplicate: true,
    debounce: 500
  });

  // 🔥 关键：捕获 Vue 错误后，手动触发 window.onerror
  const originalErrorHandler = nuxtApp.vueApp.config.errorHandler;

  nuxtApp.vueApp.config.errorHandler = (err, instance, info) => {
    console.error("Nuxt Error:", err);
    console.error("Component:", instance);
    console.error("Info:", info);

    // 调用原始的 errorHandler（如果存在）
    if (originalErrorHandler) {
      originalErrorHandler(err, instance, info);
    }

    // 🔥 手动触发全局错误，让 SDK 捕获
    // 方式1：使用 setTimeout 让错误逃逸到全局
    setTimeout(() => {
      throw err;
    }, 0);

    // 方式2：或者直接调用 window.onerror（如果 SDK 已经绑定）
    // if (window.onerror && err instanceof Error) {
    //   window.onerror(err.message, null, null, null, err);
    // }
  };
});
