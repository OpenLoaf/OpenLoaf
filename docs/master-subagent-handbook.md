# MasterAgent / SubAgent 手册（Teatime AI）

本手册描述当前项目的 MasterAgent + SubAgent 架构、数据表定义、流式输出协议、持久化规则，以及如何新增/配置子 Agent。

> 约定：本项目使用 AI SDK v6（`ToolLoopAgent`、`createAgentUIStream`、`createUIMessageStream`）实现流式对话与工具调用。

---

## 1. 总览：为什么要 MasterAgent / SubAgent

- **MasterAgent（主 Agent）**：负责理解用户意图、选择工具、委派子 Agent、输出最终答案。
- **SubAgent（子 Agent）**：专注某一领域（如 browser），工具更少、更专，输出可单独展示并可持久化。
- **subAgent（工具）**：委派入口。MasterAgent / SubAgent 都可以调用它，实现多重 subAgent（嵌套委派）。

核心目标：

- 子 Agent 的流式输出要能被前端区分并单独渲染。
- 子 Agent 结束后要保存到 DB，历史回放仍能区分。
- `sessionId === ChatSession.id`、`messageId === ChatMessage.id`（应用侧提供主键，不由 DB 生成）。

---

## 2. 关键链路（从请求到落库）

### 2.1 SSE 流（主链路）

入口：`apps/server/src/chat/routes/sseCreate.ts`

- 创建 UI Stream：`createUIMessageStream({ execute({ writer }) { ... } })`
- 将 `writer` 写入请求上下文：`requestContextManager.setUIWriter(writer)`
- 创建 MasterAgent 并运行：`createAgentUIStream({ agent, messages, generateMessageId })`
- 合并到 SSE：`writer.merge(agentStream)`
- onFinish 保存主消息：`saveAndAppendMessage({ sessionId, incomingMessage: responseMessage })`

### 2.2 子 Agent 流（通过 tool 委派）

入口：`apps/server/src/chat/tools/subAgent/tool.ts`

- 由模型调用工具：`subAgent({ name, task })`
- tool 内部运行子 agent：`createAgentUIStream({ agent: sub.createAgent(...), generateMessageId })`
- 合并到同一个 SSE：`writer.merge(subStream)`
- 子 agent 结束后保存：`saveAndAppendMessage(...)`

---

## 3. 请求上下文（AsyncLocalStorage）

文件：`apps/server/src/context/requestContext.ts`

用途：

- 保存 `sessionId/workspaceId/activeTab` 等信息，供 tools/agents 使用。
- 保存 `uiWriter`，让 tools 可向前端写 data parts（例如 `data-ui-event`）。
- 保存 `agentStack`（`AgentFrame[]`），用于：
  - subAgent 递归/深度限制
  - 生成 `message.metadata.agent`（前端区分）

`agentStack` 每个元素（`AgentFrame`）关键字段：

- `kind`: `"master" | "sub"`
- `name`: agent 名称（`master` 或 subAgent name）
- `allowedSubAgents`: 允许继续委派的 subAgent 名称数组（空数组表示不限制）
- `maxDepth`: 最大嵌套深度
- `path`: 调用链（例如 `["master","browser"]`）

---

## 4. 前端如何区分子 Agent 消息

### 4.1 统一标识：`message.metadata.agent`

约定：每条由 Master/SubAgent 生成的 assistant message，都带上：

```json
{
  "agent": {
    "kind": "master | sub",
    "name": "master | browser | ...",
    "depth": 0,
    "path": ["master", "browser"]
  }
}
```

生成位置：

- Master：`apps/server/src/chat/routes/sseCreate.ts` 的 `messageMetadata` 回调。
- Sub：`apps/server/src/chat/tools/subAgent/tool.ts` 的 `messageMetadata` + 保存时写入 metadata。

### 4.2 Web UI 渲染

文件：`apps/web/src/components/chat/message/MessageAi.tsx`

- `message.metadata.agent.kind === "sub"` 时显示 subAgent 标签（MVP）。
- 你可以在这里扩展更复杂的 UI（折叠、缩进、调用树等），但不需要解析 chunk。

---

## 5. subAgent 工具：多重 subAgent 的规则

文件：`apps/server/src/chat/tools/subAgent/tool.ts`

### 5.1 递归/深度控制

在 tool 内通过 `agentStack` 做防护：

- **环检测**：stack 中已出现目标 `name` -> 拒绝（防递归/环）。
- **最大深度**：`stack.length >= maxDepth` -> 拒绝（防爆栈/成本失控）。
- **允许列表**：若当前 frame 的 `allowedSubAgents` 非空且不包含目标 -> 拒绝（权限边界）。

### 5.2 多重 subAgent（嵌套）

SubAgent 的 tools 集合里也包含 `subAgent`，因此子 agent 可以继续委派。

### 5.3 关键约束：subAgent 的输入只传 `task`

MVP 约定：subAgent 只接受 `task` 字符串（主 agent 负责把上下文写进 task）。

---

## 6. DB：会话/消息主键一致性

### 6.1 主键规则

- `ChatSession.id` 必须由应用设置（等于前端 `sessionId`）。
- `ChatMessage.id` 必须由应用设置（等于 `UIMessage.id` / 服务端生成的 `messageId`）。

Schema：`packages/db/prisma/schema/chat.prisma`

- `ChatSession.id` / `ChatMessage.id` 已移除 `@default(cuid())`。

### 6.2 保存函数：`saveAndAppendMessage`

文件：`apps/server/src/chat/history.ts`

规则：

- `incomingMessage.id` 必须存在，否则抛错。
- 按 `incomingMessage.id` 写入 `ChatMessage.id`。
- 当前实现对同 id 重复保存做跳过（MVP 幂等）。

### 6.3 服务端 messageId 生成

Master/SubAgent 运行 `createAgentUIStream` 时使用 `generateMessageId: generateId`，确保 assistant message 的 id 由服务端稳定生成，可用于 DB 主键。

---

## 7. SubAgentDefinition（Phase C：从 DB 加载子 Agent）

### 7.1 表结构（Prisma）

文件：`packages/db/prisma/schema/chat.prisma`

表：`SubAgentDefinition`

字段要点：

- `workspaceId`：工作区隔离
- `name`：subAgent 名称（前端展示也用它）
- `enabled`：开关
- `systemPrompt`：子 agent 的系统提示词（对应 AI SDK v6 的 `instructions`）
- `toolKeys`：工具白名单（字符串数组，JSON）
- `allowedSubAgents`：可委派子 agent 名称数组（JSON，可选）
- `maxDepth`：最大嵌套深度（可选）
- `maxSteps`：最大循环步数（可选）
- `pageIds`：绑定的 pageId 数组（JSON，可选）

唯一键：

- `@@unique([workspaceId, name])`

### 7.2 运行时装配（DB -> SubAgent）

文件：`apps/server/src/chat/agents/sub/registry.ts`

- 优先使用内置 subAgent（目前只有 `browser`）。
- 否则从 DB 读取 `SubAgentDefinition`（按 `workspaceId + name`）。
- 根据 `toolKeys` 从 allowlist 里挑选工具组装 `ToolSet`。
- 使用 `maxSteps` 转换成 `stopWhen: stepCountIs(maxSteps)`。

> 注意：因为你尚未运行 `db:generate`，这里对 Prisma Client 使用了 `any`（MVP），等你迁移并生成后可收敛类型。

---

## 8. 工具 allowlist（安全边界）

Phase C 的 DB subAgent 只能通过 `toolKeys` 选择**已有工具**，不能从 DB 注入执行逻辑。

当前实现使用一个按 mode 组装的工具 map（MVP）：

- system tools：`apps/server/src/chat/tools/system/*`
- browser tools：`apps/server/src/chat/tools/browser/*`
- db tools：`apps/server/src/chat/tools/db/*`（settings 模式不包含）
- `subAgent`：通过全局 `subAgentToolRef` 注入（避免循环依赖）

---

## 9. 如何新增一个 SubAgent（手写）

示例：`BrowserSubAgent`

1) 新建类继承 `SubAgent`，实现：
   - `createTools(mode)`
   - `createSystemPrompt(mode)`
   - `createAgent(mode)`
2) 注册到内置表（MVP fallback）：
   - `apps/server/src/chat/agents/sub/registry.ts` 的 `BUILTIN_SUB_AGENTS`

---

## 10. 如何新增一个 SubAgent（DB 配置）

1) 在 DB 表 `SubAgentDefinition` 插入一条记录（同 workspace）：
   - `name`: `"xxx"`
   - `enabled`: `true`
   - `systemPrompt`: 子 agent 的系统提示词
   - `toolKeys`: `["web-fetch","web-search","sub-agent"]`（示例）
   - 可选：`allowedSubAgents/maxDepth/maxSteps/pageIds`
2) 由 Master 或其它 SubAgent 调用：
   - `sub-agent({ name: "xxx", task: "..." })`

---

## 11. 迁移/运行提示（你手动执行）

本仓库不自动运行 DB 命令。修改 schema 后请你手动执行（示例）：

- `pnpm db:migrate` 或 `pnpm db:push`
- `pnpm db:generate`

迁移前注意：

- `ChatSession.id`、`ChatMessage.id` 现在必须由应用提供；旧数据/旧写入路径如果没有 id，会直接失败。
