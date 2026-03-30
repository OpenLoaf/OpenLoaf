## 更新内容

### ✨ 新功能
- 统一 AI 聊天中的文件引用和媒体输入工作流
- 音频/视频 AI 面板支持按版本恢复参数（编辑模式下支持快照/取消恢复）

### 🚀 改进
- 统一聊天文件路径为 `[sessionId]/asset/filename` 格式
- 人类消息中的文件引用改为内联芯片渲染
- 新增 `resolveMediaTypeFromPath` 工具函数

### 🐛 修复
- 修复工具作用域路径解析器中 `[sessionId]` 路径解析问题
- 修复聊天历史文件通过预览端点打开（替代 VFS）
- 规范化历史 `../chat-history/` 路径处理
- 修复 `uploadGenericFile` 防止 `../` 路径遍历
- 修复 URL 下载路由的 MIME 类型解析类型错误

### 🔧 重构
- 简化 GenerateActionBar，移除多余的重新生成确认弹窗
- 更新系统提示词使用 `[sessionId]` 路径格式并添加格式示例
