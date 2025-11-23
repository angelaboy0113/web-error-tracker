import terser from "@rollup/plugin-terser";

export default {
  input: "src/index.js",
  output: [
    // CommonJS - 不压缩，供 Node.js 和 webpack 使用
    { file: "dist/web-error-tracker.cjs.js", format: "cjs", exports: "named" },
    // ESM - 不压缩，供现代打包工具使用
    { file: "dist/web-error-tracker.esm.js", format: "esm" },
    // UMD - 压缩，供浏览器直接使用
    {
      file: "dist/web-error-tracker.umd.js",
      format: "umd",
      name: "WebErrorTracker",
      exports: "named",
      plugins: [terser()]
    },
  ],
};
