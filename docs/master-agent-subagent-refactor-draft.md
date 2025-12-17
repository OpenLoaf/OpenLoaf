# MasterAgent / SubAgent 改造方案草案（Teatime AI）

> 目标：把当前函数式 `createMainAgent()` 改造成面向对象的 `MasterAgent` + `SubAgent` 体系，并实现可视化的多重 sub-agent（以 tool 形式委派）、流式输出可区分、结束后可持久化；同时将 `messageId === ChatMessage.id` 与 `sessionId === ChatSession.id` 固化为强约束。

## 0. 范围与约束

### 0.1 范围（本草案覆盖）

- 面向对象 Agent 架构：`MasterAgent`、`SubAgent`、`BrowserSubAgent`（先手写一个）
- `subAgent` tool：允许 Master/SubAgent 相互委派，支持多重（嵌套）subAgent
- Streaming：子 agent 的 streaming 输出需要被前端区分（按 subAgent name）
- Persistence：子 agent 结束后也要保存；并确保 messageId 与 DB 主键一致
- DB 配置：为未来从 DB 读取 SubAgent 的 prompt + tool 集合提供 schema 草案与装配机制

### 0.2 非目标（本草案不做）

- 不实现具体代码、不落地 UI 视觉稿
- 不引入新的外部依赖或网络访问逻辑
- 不解决无关的历史数据迁移细节（只给迁移策略与风险）

---

## 1. 现状概述（当前项目基线）

### 1.1 SSE / Streaming 主链路

- 路由：`apps/server/src/chat/routes/sseCreate.ts`
- 核心机制：
  - 使用 `createUIMessageStream({ execute({ writer }) { ... } })`
  - 在 `execute` 中把 `requestContextManager.setUIWriter(writer)` 写入 AsyncLocalStorage，允许 tools `writer.write(...)` 推自定义 data part
  - 运行主 agent：`createAgentUIStream({ agent, messages, ... })`，并 `writer.merge(agentStream)`

### 1.2 UI 自定义事件（tool -> 前端）

- 发送端：`apps/server/src/chat/ui/emit.ts` 用 `writer.write({ type: 'data-ui-event', transient: true, data: ... })`
- 接收端：`apps/web/src/lib/chat/dataPart.ts` 在 `useChat({ onData })` 里处理 `data-ui-event`、以及 tool 相关 data part

### 1.3 历史持久化

- 持久化逻辑：`apps/server/src/chat/history.ts`
- 当前行为：
  - 主链路 onFinish 时仅保存主 agent 的 `responseMessage`
  - DB schema 里 `ChatMessage.id` 是 `@default(cuid())`，**并非 UIMessage.id**

### 1.4 DB schema（相关表）

文件：`packages/db/prisma/schema/chat.prisma`

- `ChatSession.id String @id @default(cuid())`
- `ChatMessage.id String @id @default(cuid())`
- `ChatMessagePart.messageId -> ChatMessage.id`

> 本方案将把 `ChatSession.id` 与 `ChatMessage.id` 改为“必须由应用侧设置”，以保证与前端 `sessionId/messageId` 对齐。

---

## 2. 设计目标

### 2.1 架构目标

- 用 OOP 的方式封装 agent：把“配置/组装/执行/观测/持久化”从路由层抽离
- SubAgent 可复用、可注册、可由 DB 驱动（prompt + toolKeys）
- 支持多重 subAgent（subAgent 也能调用 subAgent）

### 2.2 体验目标（Streaming + UI）

- 子 agent 的流式输出要和主 agent 区分开来，前端能按 subAgent name 做独立 UI
- 子 agent 结束后要保存到 DB，历史回放同样能保持区分效果

### 2.3 一致性目标（ID）

- `sessionId === ChatSession.id`：应用侧生成并传递（当前已基本如此）
- `messageId === ChatMessage.id`：应用侧生成/固定，写入 DB 时必须使用该 id 作为主键
- 需要幂等：避免断线重连/重试导致重复消息

---

## 3. 总体方案：Orchestrator/Worker（Master/SubAgent）

AI SDK v6 的推荐模式是 Orchestrator-Worker / Routing（编排器 + 专家），本项目用以下落地方式：

- `MasterAgent`：编排器（orchestrator），负责对话主流程与工具编排
- `SubAgent`：专家（worker/sub-agent），专注单一领域（browser/db/...）
- `subAgent` tool：委派机制（由 agent 调用），负责运行子 agent，并将其输出合并到同一 SSE

### 3.1 目录结构建议

- `apps/server/src/chat/agents/master/`（或 `apps/server/src/chat/agents/` 下新文件）
  - `MasterAgent.ts`（类）
  - `MasterAgentFactory.ts`（把 requestContext/mode 注入）
- `apps/server/src/chat/agents/sub/`
  - `SubAgent.ts`（抽象基类）
  - `BrowserSubAgent.ts`（第一个手写 subAgent）
  - `SubAgentRegistry.ts`（注册表：name -> instance/definition）
- `apps/server/src/chat/tools/subAgent/`
  - `subAgentTool.ts`（tool 实现）
  - `recursionGuard.ts`（递归/深度/允许列表防护）

> 命名可以按你偏好调整；核心是把“agent 定义”与“tool 执行/stream merge/persist”分开。

---

## 4. 面向对象设计（类草图）

### 4.1 `SubAgent`（抽象基类）

**责任：描述一个子 agent 的“可配置能力面”**

建议接口（概念，不是代码）：

- `name: string`（唯一标识，如 `browser`）
- `systemPrompt(ctx): string`（可基于 workspaceId/tab 注入）
- `getTools(ctx): ToolSet`（返回该 subAgent 的 tool 集合）
- `allowedSubAgents: string[]`（允许委派的子 agent 名称）
- `maxDepth?: number`（可覆盖默认）
- `buildAgent(ctx): ToolLoopAgent`（把 model + instructions + tools 组装成可运行 agent）

### 4.2 `BrowserSubAgent`（首个手写 subAgent）

**责任：聚焦“网页/浏览器相关”任务**

MVP 建议：

- tools：优先使用现有 browser/system read-only 工具，例如
  - `web_fetch` / `web_search`（系统只读）
  - `open-url`（会触发 UI 打开网页，按 mode 限制）
  - `getCurrentTab/getTabs`（读取上下文）
- systemPrompt：强调“总结、引用来源、避免贴 raw HTML”
- loop control：比如 `stopWhen: stepCountIs(10)`（避免过长）

### 4.3 `MasterAgent`

**责任：对话编排器（主 agent），对外提供“可运行的 Agent”**

建议职责拆分：

- 负责 mode 决策（现有 `decideAgentMode(activeTab)` 可内聚进类或保留工具函数）
- 负责“Master 的 tools 合集”：
  - 现有 system/db/browser tools
  - **新增 `subAgent` tool**（核心委派入口）
- 负责 Master instructions（当前 `mainAgent.ts` 的字符串模板可迁入）

### 4.4 `SubAgentRegistry`

**责任：解析 `name -> SubAgent`**

两阶段：

1) 现在：静态注册（`browser -> new BrowserSubAgent(...)`）
2) 未来：从 DB 读取 `AgentDefinition(kind=SUB)`，再构建一个“DbBackedSubAgent”

### 4.5 `ToolFactoryRegistry`（未来 DB 驱动的关键）

**责任：把 DB 中的 `toolKey` 映射到代码中的 Tool 实例**

- DB 只存 `toolKeys: string[]`（例如 `web_fetch`、`open-url`）
- 代码中维护 `toolKey -> Tool` 的 allowlist（防止 DB 注入任意执行逻辑）
- 可按 `AgentMode` / 权限再过滤一次

---

## 5. `subAgent` tool 设计（核心：运行 + merge + 持久化 + 标识）

`subAgent` tool 是“多重 subAgent”的唯一入口，Master/SubAgent 的 tools 都包含它。

### 5.1 输入输出（建议）

输入：

- `name: string`（目标 subAgent 名称，如 `browser`）
- `task: string`（对子 agent 的任务描述）
- `context?: object`（可选结构化上下文，比如 URLs、用户偏好）
- `options?: { mode?: AgentMode }`（可选，通常从 requestContext 取）

输出（返回给模型的 tool result）建议为“简短摘要”：

- `ok: true`
- `messageId: string`（该 subAgent 消息的 id，便于 master 引用）
- `summary: string`（简短总结，让 master 能继续推理）

> 重点：前端看到的是流式消息；tool 输出只是让 master 在语义上“拿到结果并继续”。

### 5.2 递归/深度防护（允许多重但不失控）

在 tool 内部维护一个“调用栈”（建议放 requestContext 的 AsyncLocalStorage 里）：

- `stack: string[]`（subAgent name 链）
- `depth = stack.length`

规则：

- **环检测**：若 `stack.includes(name)` -> 拒绝（避免死循环/环）
- **最大深度**：`depth >= maxDepth` -> 拒绝
- **允许列表**：检查 `caller.allowedSubAgents` 包含 `name`（防权限逃逸）

### 5.3 流式输出合并（merge）

tool 执行时：

1) 从 `requestContextManager.getUIWriter()` 获取当前 UI stream writer
2) `createAgentUIStream({ agent: subAgent.buildAgent(ctx), messages: subMessages, messageMetadata: ... })`
3) `writer.merge(subStream)`

其中 `messageMetadata`/`responseMessage.metadata` 需要带上可区分字段（见下一节）。

### 5.4 子 agent 消息标识（前端区分）

统一约定 message metadata（需持久化）：

```json
{
  "agent": {
    "kind": "sub",
    "name": "browser",
    "displayName": "Browser SubAgent",
    "depth": 1,
    "path": ["master", "browser"]
  }
}
```

前端渲染时只需判断 `message.metadata.agent.kind/name`。

### 5.5 子 agent 结束后保存（持久化）

在 subAgent stream 的 `onFinish` 中：

- `saveAndAppendMessage({ sessionId, incomingMessage: responseMessageWithMetadata })`
- 幂等策略详见第 6 节

> 这样子 agent 的消息会进入历史，断线重连或切换会话加载时仍能看到完整内容。

---

## 6. 持久化与 ID 一致性（强约束）

### 6.1 目标

- `ChatSession.id` 由应用设置（= 前端 `sessionId`）
- `ChatMessage.id` 由应用设置（= UIMessage.id / messageId）

### 6.2 DB schema 变更（草案）

在 `packages/db/prisma/schema/chat.prisma` 中建议改为：

- `ChatSession.id String @id`（移除 `@default(cuid())`）
- `ChatMessage.id String @id`（移除 `@default(cuid())`）

### 6.3 写入幂等（必须）

原因：

- SSE 可能重试
- 断线重连可能造成 onFinish 重入
- subAgent 嵌套时更容易发生“同一消息重复保存”

策略（概念）：

- 以 `incomingMessage.id` 作为主键 upsert：
  - 若已存在：更新 meta/parts（或忽略重复）
  - 若不存在：创建 message 与 parts
- parts 建议先 deleteMany 再 createMany 或按 (messageId,index) upsert（取决于你是否需要 partial 更新）

### 6.4 消息 ID 的来源与控制

- 用户消息：由 `useChat` 生成（客户端 id），服务端收到后直接用该 id 入库
- assistant（master/sub）消息：建议由服务端生成（AI SDK v6 的建议），并在 stream 的 start 阶段固定 messageId
  - 方案 A：使用 `generateMessageId`（如果你的 stream helper 支持）
  - 方案 B：使用 `createUIMessageStream` 手写 `writer.write({ type:'start', messageId })` 再 merge 并关闭 sendStart（AI SDK v6 文档推荐的“精细控制”方式）

> 你当前是 `createAgentUIStream` 直接 merge；落地时需要确保“subAgent 的 responseMessage.id”是你期望的可控 id。

---

## 7. 未来：从 DB 读取 systemPrompt + tools（但仍然安全）

### 7.1 为什么不能把 tools 的执行逻辑放 DB

DB 不应承载可执行代码。DB 只能承载：

- systemPrompt
- toolKeys（从 allowlist 选择）
- 参数（例如模型名、步数上限、某些工具的开关）

执行逻辑必须仍在代码层（ToolFactoryRegistry）。

### 7.2 SubAgentDefinition 表（建议新增，草案）

新增 `SubAgentDefinition`（可加 workspace 维度）：

- `id: String @id`（应用侧生成）
- `workspaceId?: String`（可选，若要多租户）
- `name: String @unique`（或 `(workspaceId,name)` unique）
- `enabled: Boolean`
- `systemPrompt: String`（可模板化）
- `model: Json`（provider/modelId/params）
- `toolKeys: Json`（string[]）
- `allowedSubAgents: Json`（string[]）
- `maxDepth?: Int`
- `maxSteps?: Int`
- `version: Int` / `updatedAt`
- `pageIds: Json`（string[]）

### 7.3 运行时装配流程（DB -> SubAgent）

1) SubAgentTool 收到 `name`
2) Registry 查询：若本地硬编码存在（BrowserSubAgent），优先用代码版（MVP）
3) 否则从 DB 读取 SubAgentDefinition
4) ToolFactoryRegistry 用 `toolKeys` 构建 ToolSet
5) 构造 DbBackedSubAgent（临时对象），跑起来

---

## 8. 前端 UI 适配（最小改动）

目标：不解析 chunk，不改 transport 协议，只按 `message.metadata.agent` 区分消息 UI。

建议：

- 在 `MessageAi`/`MessageItem` 渲染处：
  - `agent.kind === 'sub'` 时展示 badge（`Browser`）、缩进、分组线等
  - 可扩展成“调用树/折叠面板”（利用 `metadata.agent.path/depth`）

---

## 9. 分阶段迁移计划（可回滚）

### Phase 0：准备（不改行为）

- 添加 docs 与类型约定：`metadata.agent` 结构（前后端共享）

### Phase 1：OOP 架构（Master/SubAgent + BrowserSubAgent）

- 引入 MasterAgent / SubAgent / Registry / SubAgentTool
- 先只注册 `BrowserSubAgent`
- 子 agent 可 stream merge，并能持久化（暂时不改 DB 主键也能跑）

### Phase 2：ID 强一致（DB migration）

- Prisma schema：移除 `ChatSession.id` / `ChatMessage.id` 默认值
- 持久化层改成以 messageId 主键 upsert（幂等）
- 确保 master/sub 的 response message id 都由服务端可控生成

### Phase 3：DB 驱动 SubAgent（可选）

- 新增 SubAgentDefinition
- ToolFactoryRegistry allowlist 化
- Registry 支持从 DB 加载定义

---

## 10. 风险与待确认项

- **AI SDK v6 messageId 控制点**：Master/sub 都需要稳定 messageId 才能做主键；落地时需统一“服务端生成 id”的策略（推荐）。
- **幂等更新 parts 的策略**：若要实时写入部分 chunk（未来可能想做），需要更细粒度 part upsert；当前可先 onFinish 一次性写入完整 parts。
- **subAgent 的 tool 输出 vs message 输出**：工具返回给模型的是 `summary`，展示给用户的是 subAgent message（两者需避免重复/冲突）。
- **权限边界**：DB 驱动 tools 只能选择 allowlist，且仍需按 mode 过滤（settings 模式禁 `open-url`）。
