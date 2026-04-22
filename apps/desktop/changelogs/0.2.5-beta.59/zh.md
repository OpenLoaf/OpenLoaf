## 本次更新

### 🐛 修复

- **Windows 启动 Server 崩溃**：beta.58 虽然把 `skia-canvas` / `node-pptx-png-v2` 标记为 webpack/esbuild external，但打包产物 `resources/node_modules/` 里并没有这两个包，导致 `server.mjs` 启动时抛 `ERR_MODULE_NOT_FOUND: skia-canvas`。已在 `forge.config.ts` 的 `postPackage` 依赖清单里补上这两个原生包（及其传递依赖）。
