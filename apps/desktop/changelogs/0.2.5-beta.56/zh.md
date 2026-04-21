## 更新内容

### ✨ 新功能

- **PPTX 幻灯片原生视觉识图**: 当模型支持原生图片输入时，渲染后的 PPTX 页面会通过 attachment tag 自动嵌入模型上下文，无需额外调用 CloudImageUnderstand

### 🐛 修复

- **Server 构建失败**: 将 `skia-canvas` 加入 esbuild external 列表——原生模块不能被内联打包，修复了 beta.55 的 CI 构建失败
