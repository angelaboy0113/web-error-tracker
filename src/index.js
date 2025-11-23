// web-error-tracker.js
// 企业内部前端错误上报 SDK v2.0
// 特性：安全的错误捕获、持久化队列、sendBeacon/fetch 回退、原生 fetch 绑定、生命周期可控

const WebErrorTracker = (function () {
  const defaultConfig = {
    reportUrl: "",
    project: "default",
    version: "1.0.0",
    environment: "prod",
    debounce: 200,
    maxQueue: 50,
    debug: false,
    deduplicate: false, // 是否启用错误去重

    // 可控 header 机制
    fetchHeaders: { "Content-Type": "application/json" },
    fetchHeadersMerge: true, // true=merge false=replace

    // 重试策略
    maxRetries: 5,
    baseRetryDelay: 1000, // ms
  };

  // 私有状态（闭包内）
  let isInitialized = false;
  let rawOnError = null;
  let config = {};
  let lastUserAction = null;
  let errorQueue = [];
  let timer = null;
  const listeners = [];
  const eventFlags = new Set();
  let nativeFetch = null;
  let retryCount = 0;

  const PERSIST_KEY = "__web_error_tracker_queue_v5__";

  // ---------- 工具函数 ----------
  function byteLength(str) {
    try {
      return new Blob([str]).size;
    } catch (e) {
      // fallback rough estimate
      return new TextEncoder()
        ? new TextEncoder().encode(str).length
        : str.length;
    }
  }

  function isObject(val) {
    return val && typeof val === "object" && !Array.isArray(val);
  }

  function deepClone(obj) {
    if (!isObject(obj)) return obj;
    const out = {};
    for (const k in obj) {
      const v = obj[k];
      out[k] = isObject(v) ? deepClone(v) : v;
    }
    return out;
  }

  function trimField(str, max = 2000) {
    if (typeof str !== "string") return str;
    if (str.length <= max) return str;
    return str.slice(0, max) + "...[trimmed]";
  }

  function normalizeHeadersObj(h) {
    const res = {};
    if (!h || typeof h !== "object") return res;
    for (const key in h) {
      if (!Object.prototype.hasOwnProperty.call(h, key)) continue;
      const lower = String(key).toLowerCase();
      res[lower] = h[key];
    }
    return res;
  }

  // merge user headers with defaults but keep normalization
  function buildHeaders(userHeadersOpt) {
    const defaultHeaders = normalizeHeadersObj(config.fetchHeaders || {});
    const userHeaders = normalizeHeadersObj(userHeadersOpt || {});
    const result = {};

    if (config.fetchHeadersMerge) {
      // merge: user overrides defaults if same key
      Object.assign(result, defaultHeaders, userHeaders);
    } else {
      Object.assign(result, userHeaders);
    }

    // back to normal-case keys - prefer original key forms from default if present
    // But fetch accepts object with lowercase keys too. We'll return proper header object.
    const out = {};
    for (const k in result) {
      // use canonical capitalization for common headers
      const cap =
        k === "content-type"
          ? "Content-Type"
          : k === "authorization"
          ? "Authorization"
          : k
              .split("-")
              .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
              .join("-");
      out[cap] = result[k];
    }
    return out;
  }

  // ---------- 持久化队列 ----------
  function persistQueue() {
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify(errorQueue));
    } catch (e) {
      // ignore
    }
  }

  function loadPersistedQueue() {
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          errorQueue = arr.concat(errorQueue).slice(-config.maxQueue);
        }
        localStorage.removeItem(PERSIST_KEY); // we'll persist again as needed
      }
    } catch (e) {
      // ignore
    }
  }

  // ---------- 队列管理 ----------
  // 生成错误指纹（用于去重）
  function getErrorFingerprint(payload) {
    // 使用 type + message + file + line 生成唯一标识
    const parts = [
      payload.type || "",
      payload.message || "",
      payload.file || "",
      String(payload.line || ""),
    ];
    return parts.join("|");
  }

  function safePushError(payload) {
    try {
      if (!isInitialized) return;

      // 如果启用去重，检查队列中是否已存在相同错误
      if (config.deduplicate) {
        const fingerprint = getErrorFingerprint(payload);
        const isDuplicate = errorQueue.some((err) => {
          return getErrorFingerprint(err) === fingerprint;
        });

        if (isDuplicate) {
          if (config.debug) {
            console.log(
              "[WebErrorTracker] duplicate error ignored:",
              payload.message
            );
          }
          return; // 跳过重复错误
        }
      }

      if (errorQueue.length >= config.maxQueue) {
        // 丢弃最旧
        errorQueue.shift();
      }
      errorQueue.push(payload);
      persistQueue();
    } catch (e) {
      // swallow
    }
  }

  // ---------- 事件监听管理（避免重复绑定） ----------
  function addSafeEventListener(type, handler, options) {
    try {
      const key =
        type +
        "|" +
        (handler._trackerId ||
          (handler._trackerId = Math.random().toString(36).slice(2)));
      if (eventFlags.has(key)) return;
      window.addEventListener(type, handler, options);
      eventFlags.add(key);
      listeners.push({ type, handler, options, key });
    } catch (e) {
      // swallow
    }
  }

  // ---------- 错误处理逻辑 ----------
  function handleError(err) {
    try {
      const payload = {
        type: err.type || "unknown",
        message: trimField(err.message || String(err || "")),
        stack: trimField(err.stack || ""),
        extra: err.extra || null,
        file: err.url || err.file || null,
        line: err.line || null,
        column: err.col || null,
        project: config.project,
        version: config.version,
        environment: config.environment,
        url: window.location.href,
        ua: navigator.userAgent,
        time: Date.now(),
        userAction: lastUserAction,
      };

      safePushError(payload);

      // debounce send
      clearTimeout(timer);
      timer = setTimeout(() => {
        retryCount = 0; // reset retry count when scheduling new send
        sendErrors();
      }, Math.max(50, config.debounce));
    } catch (e) {
      // never let SDK throw
      if (config.debug)
        console.warn("[WebErrorTracker] handleError internal", e);
    }
  }

  // ---------- 发送逻辑（sendBeacon 优先，失败 fallback 到 nativeFetch） ----------
  function scheduleRetry() {
    retryCount++;
    if (retryCount > (config.maxRetries || 5)) {
      // 达到最大重试，保留队列到持久化（下一次 init 时会加载）
      persistQueue();
      if (config.debug)
        console.warn(
          "[WebErrorTracker] max retries reached, will persist queue."
        );
      return;
    }
    const delay = Math.min(
      30000,
      config.baseRetryDelay * Math.pow(2, retryCount - 1)
    ); // 指数退避，最多 30s
    if (config.debug)
      console.log(`[WebErrorTracker] scheduling retry in ${delay}ms`);
    setTimeout(sendErrors, delay);
  }

  function sendErrors() {
    if (!isInitialized) return;
    if (!errorQueue.length) return;

    // 复制队列，乐观清空
    const queueCopy = errorQueue.slice();
    errorQueue = [];
    persistQueue();

    const body = JSON.stringify(queueCopy);

    // 构建 headers
    const headersObj = buildHeaders();
    const fetchFunc =
      nativeFetch || (window.fetch && window.fetch.bind(window));

    if (!fetchFunc) {
      // no fetch available -> persist queue and abort
      errorQueue = queueCopy.concat(errorQueue).slice(-config.maxQueue);
      persistQueue();
      if (config.debug)
        console.warn("[WebErrorTracker] no fetch available to send logs");
      return;
    }

    // 直接用 fetch，忽略 sendBeacon
    try {
      fetchFunc(config.reportUrl, {
        method: "POST",
        headers: headersObj,
        body,
      })
        .then((res) => {
          if (!res || res.status < 200 || res.status >= 300) {
            // 失败，恢复队列
            errorQueue = queueCopy.concat(errorQueue).slice(-config.maxQueue);
            persistQueue();
            scheduleRetry();
            if (config.debug)
              console.warn(
                "[WebErrorTracker] fetch response not ok",
                res && res.status
              );
          } else {
            // 成功
            retryCount = 0;
            try {
              localStorage.removeItem(PERSIST_KEY);
            } catch (e) {}
            if (config.debug)
              console.log("[WebErrorTracker] logs sent successfully");
          }
        })
        .catch((err) => {
          // 出错，恢复队列并重试
          errorQueue = queueCopy.concat(errorQueue).slice(-config.maxQueue);
          persistQueue();
          scheduleRetry();
          if (config.debug)
            console.warn("[WebErrorTracker] fetch error sending logs", err);
        });
    } catch (e) {
      errorQueue = queueCopy.concat(errorQueue).slice(-config.maxQueue);
      persistQueue();
      scheduleRetry();
      if (config.debug)
        console.warn("[WebErrorTracker] unexpected error sending logs", e);
    }
  }

  // ---------- 初始化 patch / 监听（安全模式，不覆盖业务 onerror） ----------
  function init(userConfig = {}) {
    if (isInitialized) {
      if (config.debug) console.warn("[WebErrorTracker] already initialized");
      return;
    }

    config = Object.assign({}, defaultConfig, deepClone(userConfig || {}));

    // normalize nested fetchHeaders
    config.fetchHeaders = Object.assign(
      {},
      defaultConfig.fetchHeaders || {},
      userConfig.fetchHeaders || {}
    );

    // bind nativeFetch now to avoid user patch affecting us later
    nativeFetch = window.fetch ? window.fetch.bind(window) : null;

    if (!config.reportUrl) {
      console.warn("[WebErrorTracker] reportUrl is not configured");
      return;
    }

    // load persisted queue if any
    loadPersistedQueue();

    // set flag
    isInitialized = true;

    // 1) preserve existing window.onerror reference (if any) but prefer event-based capture
    try {
      rawOnError = window.onerror;
    } catch (e) {
      rawOnError = null;
    }

    // Use event-based capture for runtime errors (won't overwrite onerror)
    addSafeEventListener(
      "error",
      function (event) {
        try {
          // resource errors have target.src/href, runtime errors have event.error
          const target = event && event.target;
          if (target && (target.src || target.href)) {
            handleError({
              type: "resource",
              message: "resource error",
              url: target.src || target.href,
              extra: { tag: target.tagName },
            });
            return;
          }

          if (event && event.error) {
            handleError({
              type: "js",
              message: event.message,
              url: event.filename || event.fileName,
              line: event.lineno,
              col: event.colno,
              stack: event.error && event.error.stack,
            });
            return;
          }
        } catch (e) {
          if (config.debug)
            console.warn("[WebErrorTracker] error event handler failed", e);
        }
      },
      true
    );

    // 2) legacy window.onerror chaining (call original if exists)
    try {
      window.onerror = function (...args) {
        try {
          rawOnError && rawOnError.apply(this, args);
        } catch (e) {
          // ignore original onerror failure
        }
        // we already capture via 'error' event; keep this as minimal fallback
      };
    } catch (e) {
      // ignore
    }

    // 3) unhandledrejection
    addSafeEventListener("unhandledrejection", function (event) {
      try {
        handleError({
          type: "promise",
          message:
            (event && event.reason && event.reason.message) ||
            String((event && event.reason) || "unhandledrejection"),
          stack: event && event.reason && event.reason.stack,
        });
      } catch (e) {
        if (config.debug)
          console.warn(
            "[WebErrorTracker] unhandledrejection handler failed",
            e
          );
      }
    });

    // 4) click capture (user action) - use textContent to avoid layout thrash
    addSafeEventListener("click", function (e) {
      try {
        const t = e && e.target;
        if (!t) return;
        lastUserAction = {
          tag: (t.tagName || "").toUpperCase(),
          id: t.id || null,
          class: t.className || null,
          // textContent may be long - trim
          text: trimField(t.textContent || "", 100),
        };
      } catch (e) {
        if (config.debug)
          console.warn("[WebErrorTracker] click handler failed", e);
      }
    });

    if (config.debug) {
      console.log("[WebErrorTracker] initialized", {
        config,
        nativeFetchBound: !!nativeFetch,
      });
    }
  }

  // ---------- 销毁（恢复） ----------
  function destroy() {
    if (!isInitialized) return;

    // restore window.onerror only if we modified it - attempt safe restore
    try {
      if (rawOnError !== undefined) {
        window.onerror = rawOnError;
      }
    } catch (e) {
      // ignore
    }

    // remove event listeners
    try {
      listeners.forEach(({ type, handler, options, key }) => {
        try {
          window.removeEventListener(type, handler, options);
        } catch (e) {}
        eventFlags.delete(key);
      });
      listeners.length = 0;
    } catch (e) {
      // ignore
    }

    // reset states
    lastUserAction = null;
    errorQueue = [];
    try {
      localStorage.removeItem(PERSIST_KEY);
    } catch (e) {}
    clearTimeout(timer);
    timer = null;
    isInitialized = false;
    retryCount = 0;
    nativeFetch = null;

    if (config.debug) console.log("[WebErrorTracker] destroyed");
  }

  // ---------- 对外 API ----------
  return {
    init,
    destroy,
    // 手动上报错误
    captureError: function (error, extraInfo = {}) {
      try {
        if (!isInitialized) {
          if (config.debug)
            console.warn(
              "[WebErrorTracker] captureError called before init"
            );
          return;
        }

        const errorData = {
          type: extraInfo.type || "manual",
          message: error.message || String(error),
          stack: error.stack || "",
          file: extraInfo.file || null,
          line: extraInfo.line || null,
          col: extraInfo.col || null,
          extra: extraInfo.extra || null,
        };

        handleError(errorData);
      } catch (e) {
        if (config.debug)
          console.warn("[WebErrorTracker] captureError failed", e);
      }
    },
    // for testing/debug: expose a safe method to flush queue immediately
    _flushNow: function () {
      try {
        if (!isInitialized) return;
        // immediate send without debounce
        clearTimeout(timer);
        timer = null;
        retryCount = 0;
        sendErrors();
      } catch (e) {}
    },
    _getQueue: function () {
      return errorQueue.slice();
    },
  };
})();

// 兼容模块 / 浏览器全局
if (typeof window !== "undefined") {
  window.WebErrorTracker = WebErrorTracker;
}

export default WebErrorTracker;
export const { init, destroy, captureError, _flushNow, _getQueue } =
  WebErrorTracker;
