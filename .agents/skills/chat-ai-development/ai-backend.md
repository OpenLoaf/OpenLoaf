

## ToolLoopAgent

MasterAgent 使用 Vercel AI SDK 的 `ToolLoopAgent`，配置模型、system prompt 和工具集：

工具循环：模型生成 → tool_call → 工具执行 → 结果返回模型 → 继续生成（直到无 tool_call）

## Tool Registry

`toolRegistry.ts` 使用静态映射 `TOOL_REGISTRY`，按 `ToolDef.id` 索引：

**现有工具**: timeNow, jsonRender, openUrl, browserSnapshot/Observe/Extract/Act/Wait, shell, shellCommand, execCommand, writeStdin, readFile, writeFile, listDir, updatePlan, subAgent, testApproval, imageGenerate, videoGenerate, chartRender (chart-render), officeExecute (office-execute)

工具是否可用由能力组控制：`apps/server/src/ai/tools/capabilityGroups.ts` 定义能力组 → 工具 ID 映射，系统 Agent 的默认能力在 `apps/server/src/ai/shared/systemAgentDefinitions.ts`。

## ToolSearch Pull 模式

Master Agent、PM Agent、通用子 Agent 使用 **ToolSearch Pull 模式**：模型初始只能看到 `tool-search` 和 `load-skill` 两个核心工具的 JSON Schema，其余工具需要先通过 `tool-search` 加载后才可调用。

### 架构概览

```
┌─────────────────────────────────────────────────────┐
│  buildToolset(allToolIds)                           │
│  → 所有工具注册到 tools 对象（含完整 schema）        │
│  → 每个工具经过 4 层包装：                           │
│     autoApproval → inputValidation → timeout         │
│     → errorEnhancer                                  │
├─────────────────────────────────────────────────────┤
│  applyActivationGuard(tools, activatedSet, core)    │
│  → 非核心工具额外包装 execute 和 needsApproval       │
│  → 未激活工具调用时直接抛 "请先 tool-search" 错误    │
├─────────────────────────────────────────────────────┤
│  prepareStep → { activeTools }                      │
│  → 只返回已激活工具的 ID 列表                        │
│  → AI SDK 只将这些工具的 schema 发送给模型           │
├─────────────────────────────────────────────────────┤
│  ActivatedToolSet                                   │
│  → 跟踪哪些工具已通过 tool-search 激活              │
│  → tool-search 调用 activate() 添加工具             │
└─────────────────────────────────────────────────────┘
```

### 关键文件

| 文件 | 用途 |
|------|------|
| `services/agentFactory.ts` | `CORE_TOOL_IDS`、`createToolSearchPrepareStep()`、`applyActivationGuard()` |
| `tools/toolSearchTool.ts` | `tool-search` 实现（搜索/激活工具） |
| `tools/toolSearchState.ts` | `ActivatedToolSet`（per-session 激活状态） |
| `tools/toolInputValidation.ts` | 将 schema 验证错误延迟到 execute 抛出 |
| `tools/toolErrorEnhancer.ts` | 错误增强（结构化恢复提示 + 熔断器） |
| `shared/repairToolCall.ts` | `experimental_repairToolCall`（JSON 修复 + 熔断） |

### AI SDK `activeTools` 与 `tools` 的关键区别

**`activeTools` 只控制"发给模型的 schema"，不阻止"服务端执行"：**

- `tools` 对象：所有注册工具，含完整 schema 和 execute（服务端用于验证+执行）
- `activeTools`（via `prepareStep`）：工具名列表，AI SDK 只将这些工具的 JSON Schema 发给模型
- AI SDK 的 `NoSuchToolError` 仅在 `tools[toolName] == null` 时抛出
- 模型如果幻觉调用一个在 `tools` 中注册但不在 `activeTools` 中的工具，SDK **仍会正常处理**（验证输入 → 执行）

**这意味着 `prepareStep` 无法在执行层面阻止未激活工具的调用。** 这是 AI SDK v6 的设计——`activeTools` 是可见性控制，不是权限控制。

### 激活门卫（Activation Guard）

`applyActivationGuard()` 填补了 AI SDK 的这个 gap：

- **未激活工具**：`execute()` 立即抛错 `"Tool 'xxx' has not been loaded. You must call tool-search(query: 'select:xxx') ..."`
- **needsApproval 旁路**：未激活工具的 `needsApproval` 强制返回 `false`，避免向用户展示空白/错误的审批 UI
- **已激活工具**：正常通过，后续包装链照常执行

三个使用 pull 模式的 agent 创建函数都必须调用 `applyActivationGuard(tools, activatedSet, coreToolIds)`：
- `createMasterAgent()` — 主 Agent
- `createPMAgent()` — 项目管理 Agent
- `createGeneralSubAgent()` — 通用子 Agent

### 工具包装链（由外到内）

```
applyActivationGuard.execute        ← 最外层，激活检查
  └→ wrapToolWithErrorEnhancer.execute  ← 错误增强 + 熔断
    └→ wrapToolWithTimeout.execute      ← 超时保护
      └→ wrapToolWithInputValidation.execute  ← 验证错误延迟
        └→ wrapToolWithAutoApproval.execute   ← 自动审批
          └→ original tool.execute              ← 原始工具
```

**`wrapToolWithInputValidation` 机制**：
- 重写 `validate()`：原始验证失败时不抛错，而是将错误信息挂载到 input 上（`VALIDATION_ERROR` Symbol）
- 重写 `execute()`：检查 input 上是否有 `VALIDATION_ERROR`，有则抛出为 tool-error（模型可见）
- 重写 `needsApproval`：有 `VALIDATION_ERROR` 时返回 `false`，避免空白审批 UI

**为什么需要这个机制**：AI SDK 的 schema 验证抛 `InvalidToolInputError` 时，默认走 `repairToolCall` → 如果修复失败，错误被吞掉或只出现在日志中，模型看不到具体错误信息。延迟到 execute 抛出后，SDK 将其转为 `tool-error` content part，模型可以学习并自我纠正。

### 调试要点

1. **debug 目录**：每次 AI 调用的原始请求/响应保存在 `~/.openloaf/chat-history/<sessionId>/debug/<messageId>/step{N}_{request|response}.json`
2. **`step*_request.json` 中的 `activeTools`**：检查实际发给模型的工具列表
3. **模型幻觉调用未激活工具**：看 response 中的 toolName 是否在 request 的 activeTools 中
4. **搜索日志关键字**：
   - `[tool-input-validation]` — schema 验证失败，已延迟到 execute
   - `[tool-repair]` — JSON 修复尝试
   - `[tool-error-enhancer]` — 错误增强
5. **弱模型（如 MiniMax M2.5）常见问题**：看到 system prompt 中的工具名后直接调用，不走 tool-search → 激活门卫会拦截并提示

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

## Provider Adapters & Responses API

`providerAdapters.ts` 根据 `providerId` 路由到对应的 AI SDK 适配器：

| providerId | 适配器 | API 类型 |
|-----------|--------|---------|
| `openai` | `@ai-sdk/openai` | Responses API（默认）或 Chat Completions |
| `custom` | `@ai-sdk/openai` | 由 `enableResponsesApi` 选项决定 |
| `anthropic` | `@ai-sdk/anthropic` | Messages API |
| `moonshot` | `@ai-sdk/moonshotai` | Chat Completions |
| `dashscope`/`qwen` | `qwenAdapter` | Chat Completions |
| `openloaf-saas` | SaaS 适配器 | 按模型原始 provider 路由 |

### OpenAI Responses API vs Chat Completions

- `provider(modelId)` → Responses API（`/responses` 端点）
- `provider.chat(modelId)` → Chat Completions（`/chat/completions` 端点）
- Custom provider 默认走 Chat Completions，除非 `enableResponsesApi: true`
- Custom provider 不自动拼接 `/v1`（直接使用用户配置的 URL）

### Responses API 的 providerOptions

`agentFactory.ts` 中 `buildResponsesApiProviderOptions()` 为 Responses API 模型注入：

```typescript
providerOptions: {
  openai: {
    store: false,          // 禁用服务端 item 持久化
    promptCacheKey: sessionId,  // 启用 prompt 缓存
  }
}
```

**store: false**：第三方 Responses API 端点（如 Codex 转发）不支持服务端 item 持久化。如果 `store` 为 `true`（SDK 默认），多轮对话时 SDK 会用 `item_reference` 引用不存在的 item 导致 404。设为 `false` 后 SDK 每轮发送完整历史。

**promptCacheKey**：使用 `chatSessionId` 作为缓存键，同一会话内多轮对话可复用服务端 prompt prefix 缓存，减少重复 token 计费。不支持该字段的第三方 API 会自动忽略。通过 `@ai-sdk/openai` 的 `providerOptions.openai.promptCacheKey` 传递，映射为请求体中的 `prompt_cache_key`。

### extractReasoningMiddleware 注意事项

`wrapModelWithExamples()` 对模型施加中间件时，**原生支持 reasoning 的 provider 必须跳过 `extractReasoningMiddleware`**：

- OpenAI Responses API（`openai.responses`）、Chat Completions（`openai.chat`）、Anthropic（`anthropic.`）有自己的 reasoning 输出机制
- 对它们施加 `extractReasoningMiddleware({ startWithReasoning: true })` 会导致所有 text 内容被错误归入 reasoning 通道，前端显示为空
- 仅适用于 DeepSeek R1、Qwen QwQ、Kimi 等使用 `<think>` 标签的模型

判断逻辑通过 `model.provider` 字段前缀匹配：`hasNativeReasoning(model)`

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

**技能摘要输出**: `promptBuilder.buildSkillsSummarySection()` 使用 `summary.originalName` 输出技能名称给 AI 模型，确保 AI 调用 `load-skill` 时传入的是可匹配的原始名，而非翻译后的显示名。`prefaceBuilder` 和 `subAgentPrefaceBuilder` 过滤技能时同时匹配 `name` 和 `originalName`。

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
