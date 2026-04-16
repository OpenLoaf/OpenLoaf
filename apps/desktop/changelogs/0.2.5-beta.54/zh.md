## 更新内容

### ✨ 新功能

- **中文 PDF 创建**：PDF 引擎检测到中日韩字符时自动嵌入 Noto Sans SC 字体，不再需要 docx 转 PDF 的绕行方案
- **画布窗口缩放锁定**：禁用画布专用窗口的页面缩放（Ctrl/Cmd +/-、触控板捏合），防止与画布缩放手势冲突

### 🚀 改进

- **云端媒体技能**：改进图片/视频/音频生成的输入规范化和工作流引导
- **PixiJS 初始化安全**：用局部取消令牌重写 Pixi 画布初始化，修复 Strict Mode 双重挂载竞态条件

### 🐛 修复

- **PDF 文本渲染**：`PdfMutate create` 和 `DocConvert text→PDF` 中的中日韩文本现在正确渲染，不再空白

### 🔧 重构

- **浏览器测试框架**：更新 ChatProbeHarness，改进服务端 URL 处理和 probe 辅助函数（默认超时 120s）
- 新增 9 个浏览器测试用例（docx 转 PDF、xlsx 转 docx、PDF 转 pptx、云端图片/视频/TTS、浏览发现）
