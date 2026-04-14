### ✨ 新功能
- **第三方集成市场**：新增「连接」市场页，可浏览、安装、管理第三方集成；设置页相关 i18n 文案已覆盖所有语言。
- **会话自动测试评估**：AI 对话会话现在可以直接在调试视图里跑回归基线评估。
- **云端工具接入聊天**：图像、视频、网页搜索、登录等内置云端工具已对接到聊天 Agent，带进度 UI 与审批流。

### 🚀 改进
- **AI Prompt / Memory / 工具链重构**：聊天 prompt 组装、memory 加载、工具 scope 解析、Agent 模型解析统一为单条流水线，冷启更快，技能注入更一致，memory / skill 内容不再重复。
- **Token 管理集中到 Server**：SaaS 访问 token 仅保存在 Server 端；Web 端不再抽取或透传 bearer token，浏览器所有入口都走 strict-client-guard。
- **CI 并行 macOS 构建**：Desktop 发布 workflow 现在 arm64 和 x64 并行构建；`apps/desktop/changelogs/{版本}/` 下的 changelog 文件成为 GitHub Release 正文的唯一事实来源。
- **编辑器聊天友好错误**：编辑器聊天区在聊天模型未就绪时会展示本地化的错误卡片，不再静默失败。

### 🐛 修复
- **画布节点删除后锚点残留**：删除画布节点时，锚点不再单独慢慢淡出半秒。AnchorOverlay 会过滤掉所属元素已不存在的延迟锚点，节点和锚点同步消失。
- **画布图片 / 视频生成 — 取消按钮无效**：生成进度遮罩里的取消按钮现在正确纳入 SelectTool 的 pointerdown 白名单（`data-board-controls` + `stopPropagation`），点击真的会触发取消，不再被画布拖拽逻辑吞掉。
- **CLI rewind 上下文丢失**：CLI rewind 后继续 assistant turn 不再丢失保留的上下文。
- **CLI 直连模式模型来源**：`chatModelSource` 现在和 `chatModelId` 一起传递，直连模式请求会路由到正确的 provider。

### 🔧 重构
- 删除废弃的 `modelDefaultChatModelId` 字段。
- 删除 Agent 设置里过时的图像 / 视频模型 UI 面板（现在完全由云端能力驱动）。
- `basicConfig.chatSource` 重新归类为活动 UI 状态。
- 把零散的 `body → resolveChatModel` 样板代码收敛到单个 helper；统一了 `resolveAgentModelIdsFromConfig` 里的 5 处 descriptor 形态解析。

### 📦 内部
- 新增 temp-storage 引导迁移，首次启动时将遗留的全局 AI 数据迁移到按会话划分的临时存储。
