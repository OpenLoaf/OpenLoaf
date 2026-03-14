

## ToolLoopAgent

MasterAgent 使用 Vercel AI SDK 的 `ToolLoopAgent`，配置模型、system prompt 和工具集：

工具循环：模型生成 → tool_call → 工具执行 → 结果返回模型 → 继续生成（直到无 tool_call）

## Tool Registry

`toolRegistry.ts` 使用静态映射 `TOOL_REGISTRY`，按 `ToolDef.id` 索引：

**现有工具**: timeNow, jsonRender, openUrl, browserSnapshot/Observe/Extract/Act/Wait, shell, shellCommand, execCommand, writeStdin, readFile, writeFile, listDir, updatePlan, subAgent, testApproval, imageGenerate, videoGenerate, chartRender (chart-render), officeExecute (office-execute)

工具是否可用由能力组控制：`apps/server/src/ai/tools/capabilityGroups.ts` 定义能力组 → 工具 ID 映射，系统 Agent 的默认能力在 `apps/server/src/ai/shared/systemAgentDefinitions.ts`。

## Tool 参数约定（ActionName 例外）

- 默认所有工具需要 `actionName` 字段。
- 例外：当 ToolDef 的 `parameters` 为 **string**（例如 `jsx-create`、`js-repl`）时，工具调用应直接传入纯字符串，不要封装为对象，也不要附加 `actionName`。

## RequestContext (AsyncLocalStorage)

每次 SSE 请求调用 `setRequestContext()` 创建隔离上下文，工具通过 getter 访问：

| Getter | 内容 |
|--------|------|
| `getSessionId()` | 会话 ID |
| `getProjectId()` | 项目作用域 |
| `getClientId()` / `getTabId()` | 客户端标识 |
| `getUiWriter()` | UI 流式写入器（工具推送 chunk） |
| `getAbortSignal()` | 中止信号 |
| `getChatModel()` | 当前聊天模型实例 |
| `getAssistantMessageId()` | 当前 AI 消息 ID |
| `consumeToolApprovalPayload(toolCallId)` | 消费审批数据 |
| `pushAgentFrame()` / `popAgentFrame()` | Agent 栈管理 |
| `getSaasAccessToken()` | SaaS 云端访问令牌（媒体生成等） |
| `getMediaModelId(kind)` | 媒体模型 ID（`'image'` / `'video'`） |

## Tool Approval

1. 工具定义 `needsApproval` 返回 `true`
2. Agent 暂停，前端收到 `tool-invocation` part（`approval.approved === null`）
3. 前端渲染 `ToolApprovalActions`（批准/拒绝按钮）
4. 用户点击 → `addToolApprovalResponse()` → SSE 恢复
5. `consumeToolApprovalPayload()` 获取审批数据，工具继续执行

关键文件: `commandApproval.ts`（命令审批逻辑：只读白名单 vs 危险命令拒绝）、`pendingRegistry.ts`（前端 pending 注册/解析）

### Tool Part 状态机

工具调用在 AI SDK v6 中有多种状态，`normalizeParts()` 负责持久化前的过滤和规范化：

| 状态 | 含义 | 持久化处理 |
|------|------|-----------|
| `input-streaming` + 无 `input` | 模型流中断，无有效数据 | 过滤掉 |
| `input-streaming` + 有 `input` | 模型流不完整（没发 `tool-call` 事件），但 `parsePartialJson` 已填入完整 input | 保留，状态提升为 `input-available` |
| `input-available` | 工具输入就绪，等待执行 | 原样保留 |
| `approval-requested` | 需要用户审批 | 原样保留 |
| `output-streaming` | 工具执行中，输出流式返回 | 过滤掉（仅用于 UI 瞬态） |
| `output-available` | 工具执行完成 | 原样保留 |
| `output-error` | 工具执行失败 | 原样保留 |

**关键函数**: `messageStore.ts:normalizeParts()`

## JSX Preview 工具（文件化）

- ToolId：`jsx-create`
- 输入：JSX 字符串（string）
- 写入：`.openloaf/chat-history/<sessionId>/jsx/<messageId>.jsx`
- 输出：`{ ok: true, path, messageId }`
- 服务端校验：解析 JSX，禁止 `{}` 表达式与 `{...}` 展开，违规直接 tool error
- 校验失败仍写入文件：错误信息中包含 path，后续用 apply-patch 修正
- 依赖：`getSessionId()` / `getAssistantMessageId()` + `resolveMessagesJsonlPath()`

## Sub-Agent System

子代理通过 `subAgentTool` 分发，由 `agentFactory.ts` 数据驱动创建，每个子代理是独立的 `ToolLoopAgent` 实例。

### Agent 模板

系统 Agent 的提示词和配置存放在 `agent-templates/templates/<agentId>/`：

### 子代理存储（统一化）

每个子代理复用主对话的完整存储逻辑，存储在 session 子目录中：

关键函数：
- `registerAgentDir(parentSessionId, agentId)` — 注册 agent 子目录到 sessionDirCache，后续所有 chatFileStore 函数透明使用
- `saveAgentMessage(...)` — 文件级持久化（无 DB 操作），自动计算 parentMessageId 链
- `writeAgentSessionJson(...)` — 写入 agent 元数据
- `listAgentIds(sessionId)` — 列出 session 下所有子代理 ID

子代理输出通过 `data-sub-agent-start/delta/chunk/end` 事件推送到前端。

### 关键文件

| 文件 | 用途 |
|------|------|
| `services/agentFactory.ts` | 数据驱动的子 Agent 创建 |
| `services/agentManager.ts` | Agent 生命周期管理、spawn 调度、消息持久化 |
| `services/masterAgentRunner.ts` | 主 Agent Runner 创建 |
| `agent-templates/registry.ts` | Agent 模板注册表 |
| `tools/subAgentTool.ts` | spawn-agent 工具定义 |
| `chat/repositories/chatFileStore.ts` | registerAgentDir / listAgentIds |
| `chat/repositories/messageStore.ts` | saveAgentMessage / writeAgentSessionJson |

## Model Registry

模型定义存放在 `apps/web/src/lib/model-registry/providers/*.json`，当前仅保留聊天模型（无图像/视频），服务端通过 `modelRegistry.ts` 加载：

内置 provider（默认 JSON 定义）：anthropic / moonshot / vercel / qwen / google / deepseek / xai / codex-cli / custom。

云端模型通过 SaaS SDK `providerTemplates()` 获取供应商模板，转换时使用 `template.adapter ?? template.id` 作为 `adapterId`（`adapter` 字段决定使用哪个 AI SDK 适配器，与供应商 `id` 解耦）。

`familyId` 用于前端模型图标识别，需填 @lobehub/icons 可识别的名称（如 OpenAI/Grok/DeepSeek/Gemini/LobeHub），UI 优先使用 `familyId` 渲染图标。

**解析链**: 请求中的 `chatModelId + chatModelSource` → `resolveChatModel()` → `LanguageModelV3` 实例

**能力字段**: `ModelDefinition.capabilities` 为结构化能力元数据（`common/params/input/output`）。chat 模型的筛选与标签展示仍以 `tags` 为准；`capabilities` 仅用于可调参数或媒体能力补充（例如 codex 的参数面板），云端模型的 `capabilities` 直接透传不做本地推断。

## Media (Image/Video) via SaaS

媒体生成统一走 SaaS SDK，有两条路径：

### 路径 1：聊天 Agent Tool（推荐）

Master Agent 通过 `image-generate` / `video-generate` 工具调用 SaaS API：

错误处理：tool 在抛异常前通过 `uiWriter` 推送 `data-media-generate-error` 事件（含 `errorCode`），前端渲染对应 UI（登录按钮、积分不足提示等）。

`errorCode` 枚举：`login_required` | `insufficient_credits` | `no_model` | `generation_failed`

关键文件：`apps/server/src/ai/tools/mediaGenerateTools.ts`

### 路径 2：Board 画布节点（保留）

Board 节点通过 `intent: "image"` + `responseMode: "json"` 走独立流程：

- 入口：`apps/server/src/ai/services/chat/chatStreamService.ts`
- 调用：`getSaasClient(accessToken).ai.image(payload)` → `ai.task(taskId)` 轮询
- 落盘：`saveChatImageAttachment()`（聊天附件）+ `saveImageUrlsToDirectory()`（imageSaveDir）

媒体 API 统一从 `apps/server/src/ai/interface/routes/saasMediaRoutes.ts` 暴露：

- `POST /ai/image` / `POST /ai/vedio`
- `GET /ai/task/:taskId`
- `GET /ai/image/models` / `GET /ai/vedio/models`

**注意**：tRPC 的 `ai` 路由已弃用（`apps/server/src/routers/ai.ts`），仅保留错误提示。

## Prompt Building

| 层级 | 文件 | 内容 |
|------|------|------|
| Base prompt | `agent-templates/templates/master/prompt-v3.zh.md` | 角色、思维框架、意图理解与工具选择 |
| Session preface | `prefaceBuilder.ts` | 运行时上下文（环境/项目/技能摘要） |
| Skill 注入 | `messageConverter.ts` | `data-skill` part → 模型文本块 |

修改优先级: `instructions`（base）→ preface（运行时）→ skill（用户选择）

## SSE Streaming Output

工具执行中推送自定义 data：

关键文件: `streamOrchestrator.ts`（创建流式响应）、`requestContext.ts`（`getUiWriter()/setUiWriter()`）

- `data-step-thinking`：按 step 生命周期推送思考态开关，`transient: true`，只用于前端 UI，不应持久化
- `data-branch-snapshot`：`streamOrchestrator.ts` 在 `toUIMessageStream({ onFinish })` 中，assistant 落库并清理 session error 后，调用 `getChatViewFromFile(...)` 生成 canonical branch snapshot，再通过 `writer.write(..., transient: true)` 下发给前端
- 前端收到 `data-branch-snapshot` 后应直接覆盖本地 branch/messages；不要在 retry/resend 完成后再额外拼消息或默认补拉一次 `getChatView`

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 工具中忘记用 `getSessionId()` 获取上下文 | 所有请求数据通过 `requestContext` getter 获取 |
| 新工具只加到 `toolRegistry`，没加到能力组或系统 Agent 能力 | 更新 `capabilityGroups.ts` 与 `systemAgentDefinitions.ts` |
| ToolDef 的 `id` 与 `toolRegistry` 的 key 不一致 | 始终用 `toolDef.id` 作为 key |
| 子代理工具集过大 | 子代理只暴露必要工具，在 agent-templates 中配置 toolIds |
| 工具 execute 中抛出未捕获异常 | 返回 `{ ok: false, error: "..." }`，Agent 可据此重试 |
| AsyncLocalStorage 上下文丢失 | 确保异步操作在 `setRequestContext()` 之后 |
| 子代理提示词过长 | 控制在 2000 token 以内 |
