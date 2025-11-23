# Web Error Tracker

轻量级前端错误监控 SDK，支持原生 JavaScript、React 和 Vue 应用。

## 功能特性

### 核心功能

- ✅ 全局 JavaScript 异常捕获
- ✅ Promise 未处理异常捕获
- ✅ 资源加载错误捕获（图片、脚本、样式等）
- ✅ 用户操作记录（点击行为追踪）
- ✅ 错误批量上报，支持防抖

### 企业级特性 🚀

- 🔄 **持久化队列**：错误存储在 localStorage，页面刷新/崩溃不丢失
- 🔁 **智能重试**：网络失败时自动重试，支持指数退避策略（最多 5 次）
- 🛡️ **安全隔离**：绑定原生 `fetch`，不受业务代码 monkey patch 影响
- 📦 **队列管理**：支持队列大小限制，防止内存溢出
- 🎯 **字段裁剪**：超长错误信息自动截断，避免上报失败
- 🔧 **生命周期管理**：支持 `init` / `destroy`，可完全卸载 SDK
- 🐛 **Debug 模式**：开发环境可开启详细日志
- 🔑 **自定义请求头**：支持配置上报请求的 HTTP Headers

## 安装

```bash
npm install @angelaboy/web-error-tracker
```

或使用 yarn：

```bash
yarn add @angelaboy/web-error-tracker
```

或使用 pnpm：

```bash
pnpm add @angelaboy/web-error-tracker
```

## 配置参数

| 参数                | 类型    | 必填 | 默认值                                 | 说明                                   |
| ------------------- | ------- | ---- | -------------------------------------- | -------------------------------------- |
| `reportUrl`         | string  | ✅   | -                                      | 错误上报接口地址                       |
| `project`           | string  | ❌   | `"default"`                            | 项目名称                               |
| `version`           | string  | ❌   | `"1.0.0"`                              | 应用版本号                             |
| `environment`       | string  | ❌   | `"prod"`                               | 环境标识（如 dev/test/prod）           |
| `debounce`          | number  | ❌   | `200`                                  | 上报防抖时间（毫秒）                   |
| `maxQueue`          | number  | ❌   | `50`                                   | 队列最大长度                           |
| `maxRetries`        | number  | ❌   | `5`                                    | 失败重试次数                           |
| `baseRetryDelay`    | number  | ❌   | `1000`                                 | 重试基础延迟（毫秒）                   |
| `debug`             | boolean | ❌   | `false`                                | 是否开启调试日志                       |
| `fetchHeaders`      | object  | ❌   | `{"Content-Type": "application/json"}` | 上报请求头                             |
| `fetchHeadersMerge` | boolean | ❌   | `true`                                 | 是否合并默认请求头（false 则完全替换） |
| `deduplicate`       | boolean | ❌   | `true`                                 | 是否开启错误去重功能                   |

## 上报数据格式

每次上报的数据结构如下：

```json
{
  "type": "js | promise | resource",
  "message": "错误信息",
  "stack": "错误堆栈",
  "file": "错误文件URL",
  "line": 10,
  "column": 5,
  "project": "项目名称",
  "version": "1.0.0",
  "environment": "prod",
  "url": "发生错误的页面URL",
  "ua": "用户浏览器UA",
  "time": 1699999999999,
  "userAction": {
    "tag": "BUTTON",
    "id": "submit-btn",
    "class": "btn primary",
    "text": "提交"
  }
}
```

---

## 原生 JavaScript 使用

### 方式一：ES Module

```html
<!DOCTYPE html>
<html>
  <head>
    <title>原生JS示例</title>
  </head>
  <body>
    <button id="test-btn">触发错误</button>

    <script type="module">
      import WebErrorTracker from "@angelaboy/web-error-tracker";

      // 初始化 SDK
      WebErrorTracker.init({
        reportUrl: "https://your-api.com/api/errors",
        project: "my-website",
        version: "1.0.0",
        environment: "production",
        debug: false,
        maxQueue: 50,
        maxRetries: 5,
      });

      // 测试：手动触发一个错误
      document.getElementById("test-btn").addEventListener("click", () => {
        throw new Error("测试错误");
      });

      // 页面卸载时可选销毁（通常不需要）
      // window.addEventListener('beforeunload', () => {
      //   WebErrorTracker.destroy();
      // });
    </script>
  </body>
</html>
```

### 方式二：UMD（CDN 引入）

```html
<!DOCTYPE html>
<html>
  <head>
    <title>原生JS示例 - CDN</title>
    <!-- 引入 SDK -->
    <script src="https://unpkg.com/@angelaboy/web-error-tracker/dist/web-error-tracker.umd.js"></script>
  </head>
  <body>
    <button onclick="testError()">触发错误</button>
    <button onclick="testPromise()">触发Promise错误</button>
    <img src="https://not-exist-domain.com/image.png" alt="测试资源加载错误" />

    <script>
      // 初始化 SDK（使用全局变量）
      WebErrorTracker.init({
        reportUrl: "https://your-api.com/api/errors",
        project: "my-website",
        version: "1.0.0",
        environment: "production",
        debug: false,
      });

      // 测试 JS 错误
      function testError() {
        undefinedFunction(); // 调用未定义的函数
      }

      // 测试 Promise 错误
      function testPromise() {
        Promise.reject(new Error("Promise 异常测试"));
      }
    </script>
  </body>
</html>
```

### 方式三：CommonJS

```javascript
const WebErrorTracker = require("@angelaboy/web-error-tracker").default;

WebErrorTracker.init({
  reportUrl: "https://your-api.com/api/errors",
  project: "my-app",
  version: "1.0.0",
  environment: "production",
});
```

---

## React 使用

### 基础配置

在应用入口文件（通常是 `index.js` 或 `main.jsx`）中初始化：

```jsx
// src/index.js 或 src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import WebErrorTracker from "@angelaboy/web-error-tracker";

// 在应用启动前初始化错误监控
WebErrorTracker.init({
  reportUrl: "https://your-api.com/api/errors",
  project: "my-react-app",
  version: process.env.REACT_APP_VERSION || "1.0.0",
  environment: process.env.NODE_ENV,
  debug: process.env.NODE_ENV === "development",
  maxQueue: 50,
  maxRetries: 5,
});

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### 配合 Error Boundary 使用

创建一个 Error Boundary 组件来捕获 React 组件树中的错误：

```jsx
// src/components/ErrorBoundary.jsx
import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // React 组件错误会被 window.onerror 捕获
    // 这里可以添加额外的错误处理逻辑
    console.error("React Error Boundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", textAlign: "center" }}>
          <h2>页面出现错误</h2>
          <p>我们已记录此问题，请稍后重试</p>
          <button onClick={() => window.location.reload()}>刷新页面</button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

在应用中使用 Error Boundary：

```jsx
// src/App.jsx
import React from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import HomePage from "./pages/HomePage";

function App() {
  return (
    <ErrorBoundary>
      <HomePage />
    </ErrorBoundary>
  );
}

export default App;
```

### React 完整示例

```jsx
// src/pages/HomePage.jsx
import React, { useState } from "react";

function HomePage() {
  const [count, setCount] = useState(0);

  // 测试 JS 错误
  const triggerError = () => {
    throw new Error("React 组件中的测试错误");
  };

  // 测试 Promise 错误
  const triggerPromiseError = async () => {
    const response = await fetch("https://not-exist-api.com/data");
    return response.json();
  };

  // 测试异步错误
  const triggerAsyncError = () => {
    setTimeout(() => {
      throw new Error("异步代码中的错误");
    }, 100);
  };

  return (
    <div>
      <h1>React 错误监控测试</h1>
      <p>点击次数: {count}</p>

      <button onClick={() => setCount(count + 1)}>
        正常点击（记录用户行为）
      </button>

      <button onClick={triggerError}>触发 JS 错误</button>

      <button onClick={triggerPromiseError}>触发 Promise 错误</button>

      <button onClick={triggerAsyncError}>触发异步错误</button>
    </div>
  );
}

export default HomePage;
```

### Next.js 使用

```jsx
// pages/_app.js
import WebErrorTracker from "@angelaboy/web-error-tracker";
import { useEffect } from "react";

function MyApp({ Component, pageProps }) {
  useEffect(() => {
    // 仅在客户端初始化
    WebErrorTracker.init({
      reportUrl: "https://your-api.com/api/errors",
      project: "my-nextjs-app",
      version: "1.0.0",
      environment: process.env.NODE_ENV,
      debug: process.env.NODE_ENV === "development",
    });
  }, []);

  return <Component {...pageProps} />;
}

export default MyApp;
```

---

## Vue 使用

### Vue 3 配置

在应用入口文件中初始化：

```javascript
// src/main.js
import { createApp } from "vue";
import App from "./App.vue";
import WebErrorTracker from "@angelaboy/web-error-tracker";

WebErrorTracker.init({
  reportUrl: "http://localhost:3300/users/errors", // 错误上报地址
  project: "h5-demo",
  version: "2.0.0",
  environment: "dev",
  debounce: 3000,
  debug: true, // 开启调试模式（可选）
  maxQueue: 20,
  deduplicate: true, // 开启去重功能（可选）
  maxRetries: 3,
  fetchOptions: {
    credentials: "omit", // 不带 cookie
  },
  fetchHeaders: {
    "Content-Type": "application/json",
  },
  fetchHeadersMerge: true,
});
const app = createApp(App);

// 捕获 Vue 组件内的错误
app.config.errorHandler = (err, instance, info) => {
  console.error("Vue Error:", err);
  console.error("Component:", instance);
  console.error("Info:", info);
  // Vue 错误会自动被 window.onerror 捕获并上报
};

// 捕获 Vue 警告（开发环境）
if (import.meta.env.DEV) {
  app.config.warnHandler = (msg, instance, trace) => {
    console.warn("Vue Warning:", msg);
  };
}

app.mount("#app");
```

### Vue 3 完整示例

```vue
<!-- src/App.vue -->
<template>
  <div id="app">
    <h1>Vue 3 错误监控测试</h1>
    <p>点击次数: {{ count }}</p>

    <button @click="count++">正常点击（记录用户行为）</button>

    <button @click="triggerError">触发 JS 错误</button>

    <button @click="triggerPromiseError">触发 Promise 错误</button>

    <button @click="triggerAsyncError">触发异步错误</button>

    <!-- 测试资源加载错误 -->
    <img src="https://not-exist.com/image.png" alt="测试图片" />
  </div>
</template>

<script setup>
import { ref } from "vue";

const count = ref(0);

// 测试 JS 错误
const triggerError = () => {
  throw new Error("Vue 组件中的测试错误");
};

// 测试 Promise 错误
const triggerPromiseError = async () => {
  const response = await fetch("https://not-exist-api.com/data");
  return response.json();
};

// 测试异步错误
const triggerAsyncError = () => {
  setTimeout(() => {
    throw new Error("异步代码中的错误");
  }, 100);
};
</script>
```

### Vue 2 配置

```javascript
// src/main.js
import Vue from "vue";
import App from "./App.vue";
import WebErrorTracker from "@angelaboy/web-error-tracker";

// 初始化错误监控
WebErrorTracker.init({
  reportUrl: "https://your-api.com/api/errors",
  project: "my-vue2-app",
  version: process.env.VUE_APP_VERSION || "1.0.0",
  environment: process.env.NODE_ENV,
  debug: process.env.NODE_ENV === "development",
});

// 捕获 Vue 组件内的错误
Vue.config.errorHandler = (err, vm, info) => {
  console.error("Vue Error:", err);
  console.error("Component:", vm);
  console.error("Info:", info);
};

new Vue({
  render: (h) => h(App),
}).$mount("#app");
```

### Vue 2 完整示例

```vue
<!-- src/App.vue -->
<template>
  <div id="app">
    <h1>Vue 2 错误监控测试</h1>
    <p>点击次数: {{ count }}</p>

    <button @click="count++">正常点击</button>
    <button @click="triggerError">触发错误</button>
    <button @click="triggerPromiseError">触发Promise错误</button>
  </div>
</template>

<script>
export default {
  name: "App",
  data() {
    return {
      count: 0,
    };
  },
  methods: {
    triggerError() {
      throw new Error("Vue 2 测试错误");
    },
    async triggerPromiseError() {
      await fetch("https://not-exist-api.com/data");
    },
  },
};
</script>
```

### Nuxt.js 使用

创建插件文件：

```javascript
// plugins/error-tracker.client.js
import WebErrorTracker from "@angelaboy/web-error-tracker";

export default defineNuxtPlugin((nuxtApp) => {
  WebErrorTracker.init({
    reportUrl: "https://your-api.com/api/errors",
    project: "my-nuxt-app",
    version: "1.0.0",
    environment: process.env.NODE_ENV,
    debug: process.env.NODE_ENV === "development",
  });

  // 全局捕获 Vue 组件错误
  nuxtApp.vueApp.config.errorHandler = (err, instance, info) => {
    console.error("Nuxt Error:", err);
    WebErrorTracker.captureError(err, { type: "vue", extra: { info } });
  };
});
```

在 `nuxt.config.ts` 中注册：

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  plugins: ["~/plugins/error-tracker.client.js"],
});
```

---

## 高级用法

### 自定义请求头

```javascript
WebErrorTracker.init({
  reportUrl: "https://your-api.com/api/errors",
  project: "my-app",

  // 自定义请求头
  fetchHeaders: {
    "Content-Type": "application/json",
    Authorization: "Bearer your-token",
    "X-Custom-Header": "custom-value",
  },

  // fetchHeadersMerge: true (默认)  合并默认请求头
  // fetchHeadersMerge: false         完全替换默认请求头
  fetchHeadersMerge: true,
});
```

### 生命周期管理

```javascript
// 初始化
WebErrorTracker.init({ reportUrl: "..." });

// 销毁 SDK（移除所有事件监听器，清空队列）
WebErrorTracker.destroy();

// 重新初始化
WebErrorTracker.init({ reportUrl: "..." });
```

### Debug 模式

开发环境启用 debug 模式查看详细日志：

```javascript
WebErrorTracker.init({
  reportUrl: "https://your-api.com/api/errors",
  project: "my-app",
  debug: true, // 会在控制台输出 SDK 运行日志
});
```

---

## 后端接口示例

### Node.js + Express

```javascript
const express = require("express");
const app = express();

app.use(express.json());

// CORS 配置
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

app.post("/api/errors", (req, res) => {
  const errors = req.body;

  // 存储到数据库或日志系统
  errors.forEach((error) => {
    console.log("收到错误上报:", {
      type: error.type,
      message: error.message,
      project: error.project,
      url: error.url,
      time: new Date(error.time).toISOString(),
      userAction: error.userAction,
    });

    // TODO: 存储到 MongoDB/MySQL/Elasticsearch 等
  });

  res.json({ success: true });
});

app.listen(3000, () => {
  console.log("错误收集服务运行在 http://localhost:3000");
});
```

### 数据库表结构参考（MySQL）

```sql
CREATE TABLE error_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(20) NOT NULL COMMENT '错误类型: js/promise/resource',
  message TEXT COMMENT '错误信息',
  stack TEXT COMMENT '错误堆栈',
  file VARCHAR(500) COMMENT '错误文件',
  line INT COMMENT '错误行号',
  column INT COMMENT '错误列号',
  project VARCHAR(100) COMMENT '项目名称',
  version VARCHAR(50) COMMENT '版本号',
  environment VARCHAR(20) COMMENT '环境',
  url VARCHAR(500) COMMENT '页面URL',
  ua TEXT COMMENT '浏览器UA',
  user_action JSON COMMENT '用户最后操作',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_project (project),
  INDEX idx_type (type),
  INDEX idx_created (created_at),
  INDEX idx_env (environment)
);
```

---

## 常见问题

### 1. 跨域问题

确保后端接口配置了 CORS：

```javascript
// Express 示例
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});
```

### 2. 错误未被捕获

- 确保 SDK 在应用代码之前初始化
- 检查 `reportUrl` 是否正确配置
- 查看浏览器控制台是否有警告信息
- 开启 `debug: true` 查看详细日志

### 3. 网络失败时错误会丢失吗？

不会。SDK 内置持久化队列和重试机制：

- 错误会保存到 `localStorage`
- 网络失败时自动重试（最多 5 次，指数退避）
- 页面刷新后会自动加载并上报未发送的错误

### 4. 生产环境 Source Map

建议在生产环境上传 Source Map 到错误监控平台，以便还原压缩后的错误堆栈。

### 5. 性能影响

SDK 非常轻量（压缩后约 2KB），使用事件委托和防抖机制，对页面性能影响极小。

### 6. 如何避免敏感信息上报？

- 错误信息和堆栈会自动裁剪到合理长度
- 不会捕获用户输入内容
- 可以在后端接口层面过滤敏感字段

---

## 版本更新

### v3.0.2 (Latest)

- 🔧 修复 webpack 兼容性问题
- 📦 优化打包策略：CommonJS/ESM 不压缩，UMD 压缩

### v3.0.0

- 🚀 重大升级：企业级错误监控方案
- ✨ 新增持久化队列（localStorage）
- ✨ 新增智能重试机制（指数退避）
- ✨ 新增队列管理（maxQueue）
- ✨ 新增 debug 模式
- ✨ 新增自定义请求头支持
- ✨ 新增生命周期管理（destroy）
- 🛡️ 安全增强：绑定原生 fetch，防止被 monkey patch
- 🎯 性能优化：字段自动裁剪，避免超大数据

---

## Author

**angelaboy0113**

## License

MIT
