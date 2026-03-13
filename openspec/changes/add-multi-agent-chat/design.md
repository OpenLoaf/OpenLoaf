## Context

OpenLoaf 当前的 AI 系统采用 Master + Sub-Agent 架构（`agentFactory.ts`, `agentManager.ts`）。Sub-Agent 是 Master 的工具调用，消息存储在 `chat-history/{sessionId}/agents/{agentId}/`，用户不可见。

目标：升级为多 Agent 协作对话，支持异步任务委派和 Agent 主动汇报。

### 约束

- 必须向后兼容现有 ChatSession 和消息存储
- 复用现有 agentManager 的 Agent 执行逻辑
- 不引入消息队列等外部依赖（保持 SQLite + 文件存储）
- 桌面端和 Web 端行为一致

## Goals / Non-Goals

**Goals:**
- Task 作为独立工作单元，有完整生命周期
- Agent 完成后主动往来源对话追加汇报消息
- 用户可 @mention Agent 继续交互
- Task Agent 内部可继续 spawn 子 Agent（复用现有逻辑）

**Non-Goals:**
- 不做外部 Channel 接入（Telegram/Discord 等）
- 不做跨 session 的 Agent 协作
- 不做 Agent 市场或自定义 Agent 编辑器（第一期）
- 不做实时协作编辑式的多 Agent 共同工作

## Decisions

### 1. 数据模型：Task 表 + 文件存储

**决定**：Task 元数据存 SQLite，Agent 工作消息存文件系统。

**理由**：
- 与现有 ChatSession（SQLite 元数据）+ messages.jsonl（文件）的模式一致
- Task 状态查询需要索引（status, projectId），适合 SQLite
- Agent 工作过程是 append-only 流式消息，适合 JSONL

**替代方案**：
- 全存 SQLite：消息量大时 blob 查询慢，且丧失现有 JSONL 工具链
- 全存文件：状态查询需扫描目录，性能差

### 2. 存储路径：`~/.openloaf/tasks/{taskId}/`

**决定**：Task 的 Agent 工作独立于 chat-history，有自己的顶层目录。

**理由**：
- Task 的生命周期独立于对话（对话删除不应删除任务执行记录）
- 多个对话可以引用同一个 Task 的结果
- 目录结构清晰，不会和现有 chat-history 互相干扰

```
~/.openloaf/tasks/{taskId}/
├── task.json                    # 任务配置和 Agent 信息
├── messages.jsonl               # 负责 Agent 的工作消息
└── agents/                      # 该 Agent spawn 的子 Agent
    └── {subAgentId}/
        ├── session.json
        └── messages.jsonl
```

**替代方案**：
- 放在 `chat-history/{sessionId}/tasks/`：耦合对话，删除对话会丢失任务
- 放在 `projects/{projectId}/tasks/`：有些任务可能不属于特定项目

### 3. 汇报机制：追加消息 + tRPC subscription

**决定**：Task 完成后直接往来源 ChatSession 的 messages.jsonl 追加汇报消息，通过 tRPC subscription 推送到前端。

**理由**：
- 复用现有的消息渲染和 SSE 推送机制
- 前端不需要轮询，subscription 是现有基础设施

**消息格式**：
```jsonl
{
  "id": "msg_xxx",
  "role": "task-report",
  "parentMessageId": "msg_latest_leaf",
  "parts": [
    {"type": "text", "text": "审查完成，发现 3 个问题..."},
    {"type": "task-ref", "taskId": "task_001", "status": "completed"}
  ],
  "metadata": {
    "taskId": "task_001",
    "agentType": "code-reviewer",
    "displayName": "代码审查员"
  }
}
```

### 4. @mention 路由

**决定**：前端解析用户输入中的 @mention → metadata.mentions 数组 → 服务端路由。

**路由规则**：
- 无 @mention → 发给 Secretary（现有逻辑）
- @某个活跃 Task 的 Agent → 往该 Task 的 Agent 追加用户消息，触发继续执行
- @Secretary → 显式发给秘书（等同无 @）

### 5. Secretary prompt 升级

**决定**：不修改 agentFactory 代码逻辑，仅在 Master prompt 中增加任务委派指引。

**理由**：
- Secretary 就是现有 Master Agent，只是 prompt 升级
- `task-create` 作为新工具加入 Master 的 deferredToolIds
- 由 LLM 自然语言理解判断何时创建 Task vs 使用子 Agent

## Risks / Trade-offs

### Risk 1：汇报消息的 parentMessageId 指向

- **问题**：Agent 异步完成时，用户可能已经发了新消息，消息树的"最新叶子"已变化
- **缓解**：汇报消息的 parentMessageId 指向当前消息树的最右叶子（`resolveRightmostLeaf`），确保在时间线末尾出现
- **前端**：汇报消息带特殊样式标记，即使出现在对话中间也能识别

### Risk 2：Task Agent 的模型和上下文

- **问题**：Task Agent 启动时脱离了对话上下文，可能缺少必要信息
- **缓解**：task.json 记录完整的任务描述 + 项目上下文 + 用户偏好设置；Task Agent 的 system prompt 包含这些信息

### Risk 3：并发 Task 数量

- **缓解**：复用现有 `MAX_CONCURRENT = 4` 限制，Task 和 Sub-Agent 共享并发池

## Migration Plan

1. **P0 — 数据模型**：新增 Task 表，新增 tasks/ 存储目录，不影响现有功能
2. **P1 — 后端**：taskManager 服务 + task-create 工具 + 汇报机制
3. **P2 — 前端**：task-report 消息渲染 + @mention + 任务面板
4. **P3 — Secretary prompt**：升级 Master prompt 加入任务委派能力

每个阶段可独立合并，不破坏现有功能。

## Open Questions

- Task 的保留策略？是否需要自动清理过期任务文件？
- Task 失败时的重试策略？用户手动触发 vs 自动重试？
- 是否需要 Task 优先级？多个 Task 排队时的调度顺序？
