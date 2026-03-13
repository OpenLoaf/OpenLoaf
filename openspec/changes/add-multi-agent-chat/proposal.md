## Why

当前 AI 助手采用单 Master + 隐藏子 Agent 模式，用户只能和"一个助手"对话，子 Agent 的工作过程不可见。用户无法委派长时间任务后继续做别的事，也无法直接与特定 Agent 交互。

需要将 AI 聊天升级为**多 Agent 协作对话**：秘书（Secretary）作为入口协调者，可将任务派发给专业 Agent，Agent 异步执行并主动汇报，用户可通过 @mention 直接与 Agent 对话。

## What Changes

### 核心概念

- **Secretary（秘书）**：现有 Master Agent 的角色升级，负责理解用户意图、创建任务、调度 Agent
- **Task（任务）**：独立的工作单元，关联项目和 Agent，有独立的执行空间和生命周期
- **Agent 可见化**：Agent 作为对话中的一等参与者，有身份、头像、独立发言

### 子 Agent vs Task 的边界

- **子 Agent**（保持现有机制）：秘书内部辅助，快速、同步、用户不可见。用于回答问题、查资料等即时操作
- **Task**（新增）：用户委派的独立工作，异步、可追踪、Agent 完成后主动汇报。用于代码审查、写文档、重构等耗时操作

### 数据存储变更

- 新增 `Task` 数据模型（SQLite）
- 新增 `~/.openloaf/tasks/{taskId}/` 文件存储（复用现有 agentManager 消息存储逻辑）
- 对话 messages.jsonl 扩展：新增 `task-ref` part 类型和 `task-report` role
- Task Agent 内部的子 Agent 存储在 `tasks/{taskId}/agents/{subId}/`，与现有 `chat-history/{sid}/agents/` 逻辑完全一致

### 消息流变更

- 用户消息 → 秘书判断（即时回答 or 创建任务）
- 创建任务 → Task 独立执行空间启动 → Agent 异步工作
- 完成 → Agent 往来源 ChatSession 追加汇报消息 → tRPC subscription 推送前端
- 用户 @mention → 消息路由到对应 Task Agent 继续交互

### 前端变更

- ChatInput 支持 @mention 自动补全
- MessageList 渲染 Agent 汇报消息（带身份、头像）
- 任务状态指示器（working/done/failed）
- "查看工作详情"面板（复用现有 SubAgentChatPanel）

## Impact

- Affected specs: ai-chat（新增）, ai-agent（新增）
- Affected code:
  - `packages/db/prisma/schema/chat.prisma` — 新增 Task 模型
  - `apps/server/src/ai/services/` — 新增 taskManager, 改造 agentManager
  - `apps/server/src/ai/tools/` — 新增 task-create/task-status 工具
  - `apps/server/src/ai/agent-templates/master/` — Secretary prompt 升级
  - `apps/web/src/components/ai/` — 消息渲染、@mention、任务面板
  - `packages/api/src/types/message.ts` — 消息类型扩展
  - `packages/api/src/routers/` — 新增 task 路由
