# OpenLoaf Desktop 0.2.5-beta.62

## ✨ 新功能

- **macOS 原生控制：按窗口枚举与截图。** Swift helper 新增 `list_windows` / `capture_window` 操作，模型可以看到目标 app 的全部可渲染窗口（不再只有 frontmost），并按 `windowID` 拿到任意单窗口的像素级截图。`observe` 默认带 `windows[]` 返回，`axRichness` / `windowChildRoles` 让模型在动手前先判断 UI 密度。
- **微信通道 Agent 全链路打通。** `qwen:OL-TX-008`（SaaS Fast Chat Model）作为 channel agent 默认模型，达成 ack-first 3s SLO；按语言落地全新 harness + identity + approval prompt；新增 `SendWeChatMedia` 工具用于发送图/视频/文件气泡。微信通道现在可调用 `MacosObserve` / `MacosAct`，支持"用微信远程遥控 Mac"。
- **macOS Intent 层。** 新增 `macosIntentRegistry` + `macosIntentRouter`，把高层用户意图（`MacosAct type="intent"`）解析成具体动作；新增 `MacosSurvey` 工具用于"先看后做"。
- **Notion MCP 接入 → deferred-load bundle 模式。** Notion 在 preface 里只暴露 `notion-mcp` 一个 bundle 入口，模型按需通过 `ToolSearch` 拉整捆工具。Probe 从 `notion-get-self`（并非所有套餐可用）切换到 `notion-get-users { user_id: "self" }`。新增 integration-identity 模块持久化各账号身份。
- **MCP Mock 基础设施。** 新增 `mcpMockStore` + `mcpMockRoutes` + `mcpBundle` registry，支持浏览器测试和开发期探索时不依赖真实 MCP server。

## 🚀 改进

- **会话中途新注册的 MCP 工具立即可用。** `agentFactory` 每一步动态合并最新 MCP 工具 ID 到 `activeTools`，避免会话中通过 `ToolSearch` 接入 Notion 等动态工具后被静态快照永远过滤掉。
- **`macosControlTools.ts` 拆分。** 按职责拆到 `macosCommon`（i18n + 权限）、`macosIntentRegistry`、`macosIntentRouter`、`macosSurveyTool`、`macosChromeGuard`，便于扩展。
- **Channel agent prompt 重构。** 抽出共享 `harness.{en,zh}.md`；重写 `identity` / `approval`；工具描述按 channel 覆盖，保证 IM 语气统一。
- **Cloud model mapper + provider adapters 收紧。** `cloudModelMapper`、`providerAdapters`、`qwenAdapter`、`resolveChatModel` 适配 Fast 模型类；`modelRegistry` 清理。
- **`ToolSearch` 更聪明。** Bundle 匹配 + 排序优化（~156 行 diff），MCP bundle 排在通用工具前面。
- **微信 AI bridge 加固**（~900 行 diff）：debounce、abort-on-new、冷启动批处理、ack-first 行为全面优化。

## 💄 界面优化

- **`ConnectionAccountRow`** 抽离为可复用的状态行组件，给微信连接弹窗用。
- **Provider / Agent 设置面板** 调整：弹窗尺寸更合理、模型勾选交互优化、agent 详情布局调整。

## 🌐 国际化

- `ai` / `connections` / `project` / `settings` 命名空间在 en-US / zh-CN / zh-TW / ja-JP 同步。

## 🐛 修复

- `Chat.tsx` 不再传递已废弃的 `canAttachAll` prop。
- 删除过期的 `requiredModelTags` 测试；agent template `types.ts` 清理。

## 🔧 重构

- `tokenStore`、`authCallbackPage`、integration OAuth routes/service 统一身份流程。
- `auxiliaryInferenceService` + `auxiliaryMessageUtils` 简化。
- 设置侧 `auxiliaryModelConfStore`、`openloafConfStore`、`settingConfigTypes`、`settingsService` 适配新模型类。

## 📦 依赖

- `pnpm-lock.yaml` 刷新。
