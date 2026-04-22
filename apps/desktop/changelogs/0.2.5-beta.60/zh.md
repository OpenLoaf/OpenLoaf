## 本次更新

### 🐛 修复

- **beta.59 macOS 代码签名失败**：新复制的 `skia-canvas` / `node-pptx-png-v2` 带了 `node_modules/.bin/*` 符号链接（`cargo-cp-artifact`、`node-pre-gyp`、`nopt` 等），指向未打包的构建期依赖，macOS codesign 以 _"invalid destination for symbolic link in bundle"_ 拒绝。`postPackage` 现在过滤掉所有 `.bin/` 条目 —— 它们是构建期 CLI shim，运行时用不到。
