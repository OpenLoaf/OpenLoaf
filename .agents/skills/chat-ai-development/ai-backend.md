# AI Agent 后端开发

## 请求管线

```
HTTP SSE → AiExecuteController.execute()
  → AiExecuteService.execute()
    ├── CommandParser (指令解析: /summary-title 等)
    ├── SkillSelector (/skill/name → 注入 data-skill part)
    → ChatStreamUseCase → chatStreamService.runChatStream()
      ├── initRequestContext()         — AsyncLocalStorage 设置
      ├── resolveChatModel()           — 解析模型实例
      ├── loadAndPrepareMessageChain() — 消息链构建
      ├── buildSessionPrefaceText()    — system prompt 构建
      ├── createMasterAgentRunner()    — ToolLoopAgent + Frame
      → streamOrchestrator
        ├── UIMessageStreamWriter  → SSE chunk 输出
        ├── agent.stream(messages) → 工具循环执行
        └── saveMessage()          → 消息持久化
```

## ToolLoopAgent

MasterAgent 使用 Vercel AI SDK 的 `ToolLoopAgent`，配置模型、system prompt 和工具集：

```typescript
// agents/masterAgent/masterAgent.ts
new ToolLoopAgent({
  model: input.model,
  instructions: readMasterAgentBasePrompt(),
  tools: buildToolset(MASTER_AGENT_TOOL_IDS),
  experimental_repairToolCall: createToolCallRepair(),
});
```

工具循环：模型生成 → tool_call → 工具执行 → 结果返回模型 → 继续生成（直到无 tool_call）

## Tool Registry

`toolRegistry.ts` 使用静态映射 `TOOL_REGISTRY`，按 `ToolDef.id` 索引：

```typescript
const TOOL_REGISTRY: Record<string, ToolEntry> = {
  [timeNowToolDef.id]: { tool: timeNowTool },
  [shellToolDef.id]:   { tool: shellTool },
  [readFileToolDef.id]: { tool: readFileTool },
  // ...
};

export function buildToolset(toolIds: string[]) → Record<string, tool>
```

**现有工具**: timeNow, jsonRender, openUrl, browserSnapshot/Observe/Extract/Act/Wait, shell, shellCommand, execCommand, writeStdin, readFile, writeFile, listDir, updatePlan, subAgent, testApproval

## RequestContext (AsyncLocalStorage)

每次 SSE 请求调用 `setRequestContext()` 创建隔离上下文，工具通过 getter 访问：

| Getter | 内容 |
|--------|------|
| `getSessionId()` | 会话 ID |
| `getWorkspaceId()` / `getProjectId()` | 作用域 |
| `getClientId()` / `getTabId()` | 客户端标识 |
| `getUiWriter()` | UI 流式写入器（工具推送 chunk） |
| `getAbortSignal()` | 中止信号 |
| `getChatModel()` | 当前聊天模型实例 |
| `getAssistantMessageId()` | 当前 AI 消息 ID |
| `consumeToolApprovalPayload(toolCallId)` | 消费审批数据 |
| `pushAgentFrame()` / `popAgentFrame()` | Agent 栈管理 |

## Tool Approval

1. 工具定义 `needsApproval` 返回 `true`
2. Agent 暂停，前端收到 `tool-invocation` part（`approval.approved === null`）
3. 前端渲染 `ToolApprovalActions`（批准/拒绝按钮）
4. 用户点击 → `addToolApprovalResponse()` → SSE 恢复
5. `consumeToolApprovalPayload()` 获取审批数据，工具继续执行

关键文件: `commandApproval.ts`（命令审批逻辑：只读白名单 vs 危险命令拒绝）、`pendingRegistry.ts`（前端 pending 注册/解析）

## Sub-Agent System

子代理通过 `subAgentTool` 分发，每个子代理是独立的 `ToolLoopAgent` 实例：

| 子代理 | 文件 | 工具集 |
|--------|------|--------|
| BrowserSubAgent | `subagent/browserSubAgent.ts` | openUrl, browserSnapshot/Observe/Extract/Act/Wait |
| DocumentAnalysisSubAgent | `subagent/documentAnalysisSubAgent.ts` | readFile, listDir, shell, shellCommand |
| TestApprovalSubAgent | `subagent/testApprovalSubAgent.ts` | testApproval, timeNow |

子代理输出通过 `data-sub-agent-start/delta/chunk/end` 事件推送到前端。

## Model Registry

模型定义存放在 `apps/web/src/lib/model-registry/providers/*.json`，当前仅保留聊天模型（无图像/视频），服务端通过 `modelRegistry.ts` 加载：

```typescript
getModelDefinition("deepseek", "deepseek-chat")   → ModelDefinition
getProviderDefinition("deepseek")                → ProviderDefinition
```

内置 provider（默认 JSON 定义）：anthropic / moonshot / vercel / qwen / google / deepseek / xai / codex-cli / custom。
`familyId` 用于前端模型图标识别，需填 @lobehub/icons 可识别的名称（如 OpenAI/Grok/DeepSeek/Gemini/LobeHub），UI 优先使用 `familyId` 渲染图标。

**解析链**: 请求中的 `chatModelId + chatModelSource` → `resolveChatModel()` → `LanguageModelV3` 实例

**能力字段**: `ModelDefinition.capabilities` 为结构化能力元数据（`common/params/input/output`）。chat 模型的筛选与标签展示仍以 `tags` 为准；`capabilities` 仅用于可调参数或媒体能力补充（例如 codex 的参数面板），云端模型的 `capabilities` 直接透传不做本地推断。

## Media (Image/Video) via SaaS

聊天侧的图片生成不再构建本地 image 模型，统一走 SaaS SDK：

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
| Base prompt | `masterAgentPrompt.zh.md` | 角色、行为规则 |
| Session preface | `prefaceBuilder.ts` | 运行时上下文（环境/项目/技能摘要） |
| Skill 注入 | `messageConverter.ts` | `data-skill` part → 模型文本块 |

修改优先级: `instructions`（base）→ preface（运行时）→ skill（用户选择）

## SSE Streaming Output

工具执行中推送自定义 data：

```typescript
const writer = getUiWriter();
if (writer) {
  writer.writeData({ type: "my-data", data: { ... } });
}
```

关键文件: `streamOrchestrator.ts`（创建流式响应）、`requestContext.ts`（`getUiWriter()/setUiWriter()`）

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 工具中忘记用 `getSessionId()` 获取上下文 | 所有请求数据通过 `requestContext` getter 获取 |
| 新工具只加到 `toolRegistry` 没加到 `MASTER_AGENT_TOOL_IDS` | 两处都要注册 |
| ToolDef 的 `id` 与 `toolRegistry` 的 key 不一致 | 始终用 `toolDef.id` 作为 key |
| 子代理工具集过大 | 子代理只暴露必要工具 |
| 工具 execute 中抛出未捕获异常 | 返回 `{ ok: false, error: "..." }`，Agent 可据此重试 |
| AsyncLocalStorage 上下文丢失 | 确保异步操作在 `setRequestContext()` 之后 |
| 子代理提示词过长 | 控制在 2000 token 以内 |
