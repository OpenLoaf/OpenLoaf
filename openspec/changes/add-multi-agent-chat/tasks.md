## 1. 数据模型与存储（P0）

- [ ] 1.1 新增 `Task` Prisma 模型（`packages/db/prisma/schema/chat.prisma`）
- [ ] 1.2 运行 `db:migrate` 创建表
- [ ] 1.3 创建 `~/.openloaf/tasks/` 目录管理逻辑（taskFileStore.ts）
- [ ] 1.4 扩展 `packages/api/src/types/message.ts`：新增 `task-report` role、`task-ref` part 类型

## 2. 后端服务（P1）

- [ ] 2.1 新增 `apps/server/src/ai/services/taskManager.ts`（Task 生命周期管理）
- [ ] 2.2 新增 `task-create` 工具（Secretary 调用，创建并启动 Task）
- [ ] 2.3 新增 `task-query` 工具（查询 Task 状态）
- [ ] 2.4 Task Agent 执行逻辑：复用 agentFactory + agentManager，根目录改为 `tasks/{taskId}/`
- [ ] 2.5 汇报机制：Task 完成后往来源 ChatSession 追加 `task-report` 消息
- [ ] 2.6 tRPC subscription 推送：task 状态变更通知前端
- [ ] 2.7 新增 `packages/api/src/routers/task.ts` tRPC 路由（list, get, cancel）

## 3. @mention 与消息路由（P2）

- [ ] 3.1 前端 ChatInput @mention 解析和自动补全
- [ ] 3.2 消息 metadata.mentions 字段，标记被 @的 Agent
- [ ] 3.3 服务端消息路由：根据 mentions 决定发给 Secretary 还是 Task Agent
- [ ] 3.4 Task Agent 接收 @mention 消息后继续执行

## 4. 前端渲染（P2）

- [ ] 4.1 MessageTaskReport 组件：渲染 `task-report` 消息（Agent 身份 + 汇报内容）
- [ ] 4.2 TaskRefPart 组件：渲染 `task-ref`（任务卡片，状态指示器）
- [ ] 4.3 TaskDetailPanel：查看 Task Agent 工作详情（复用 SubAgentChatPanel 逻辑）
- [ ] 4.4 ChatParticipantList：当前对话中的活跃 Agent 列表（供 @mention 补全）

## 5. Secretary Prompt 升级（P3）

- [ ] 5.1 Master prompt 增加任务委派指引（何时用子 Agent vs 创建 Task）
- [ ] 5.2 将 `task-create`、`task-query` 加入 Master 的 deferredToolIds
- [ ] 5.3 测试端到端流程：用户委派任务 → 秘书创建 Task → Agent 执行 → 汇报
