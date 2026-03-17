---
name: multi-agent-routing
description: >
  多 Agent 对话路由与协作架构。包含页面上下文驱动的路由决策、Agent 自动切换规则、
  Task 异步执行集成、异步群组聊天机制、跨项目 @mention 路由、task-report 回报、
  以及对话与 Task 的双向流转。当涉及消息路由、Agent 切换、任务调度、
  异步协作等业务逻辑时使用此 skill。
version: 3.0.0
---

# 多 Agent 对话路由与协作架构

> OpenLoaf AI 团队体系：页面上下文驱动路由 → 主 Agent 调度 → 子 Agent 并行协作 → Task 异步执行 → 结果回报。

---

## 一、交互模式总览

```
┌─────────────────────────────────────────────────────┐
│                   用户与 AI 的交互模式               │
├─────────────┬───────────────────────────────────────┤
│  同步对话    │  用户发消息 → Agent 实时回复           │
│             │  （Chat 的核心模式）                   │
├─────────────┼───────────────────────────────────────┤
│  异步任务    │  用户创建 Task → Agent 后台执行        │
│             │  → 完成后回报到源 Chat Session          │
│             │  （Task 系统的核心模式）               │
├─────────────┼───────────────────────────────────────┤
│  异步群组    │  主 Agent 拆解任务 → spawn 多个子 Agent │
│             │  → 各自并行执行 → 汇总回报              │
│             │  （多 Agent 协作模式）                  │
└─────────────┴───────────────────────────────────────┘
```

---

## 二、路由决策流程

### 2.1 完整路由链

```
用户消息到达服务端
    ↓
Step 1: 解析 pageContext（scope + page + projectId + boardId）
    ↓
Step 2: 自动加载 skill（pageContext → skill 映射表 → 注入到消息）
    ↓
Step 3: 选择主 Agent
    ├─ 有 projectId → PM Agent
    ├─ 有 targetAgent（跨项目 @mention）→ 任务路由（见 §四）
    └─ 其他 → Master Agent
    ↓
Step 4: 主 Agent 处理
    ├─ 简单任务 → 直接回答
    ├─ 需要文件但无项目 → 创建临时项目 → 继续处理
    ├─ 复杂任务 → 委派子 Agent（见 §三）
    └─ 重复性任务 → 建议创建 Task（见 §五）
```

### 2.2 主 Agent 判定规则

**直接做 = 不产生持久产物的事情**
- 回答问题、翻译、解释、计算
- 读文件、查数据、搜索信息
- 简单的一步操作（创建日历事件、发邮件）
- 闲聊、建议、决策辅助

**委派子 Agent = 产生文件/成果物、或需要多步规划的事情**
- 写文档、写代码、生成报告
- 审查代码、重构模块
- 涉及「创建/修改文件」的工作
- 复杂的多步骤任务

**灰色地带原则**：
> 主 Agent 可以「看」（读取、分析），但不应该「做」（创建、修改文件）。一旦涉及到「做」，就应该进入项目 → PM 接手或委派专业子 Agent。

### 2.3 Skill 自动加载映射

服务端在 `AiExecuteService` 中根据 `pageContext.page` 查表，自动追加 skill：

| pageContext.page | 自动加载的 skill |
|-----------------|-----------------|
| `canvas-list`, `temp-canvas`, `project-canvas` | `openloaf-basics` + `canvas-ops` |
| `project-list`, `project-*` | `openloaf-basics` + `project-ops` |
| `calendar` | `openloaf-basics` + `calendar-ops` |
| `email` | `openloaf-basics` + `email-ops` |
| `tasks`, `project-tasks` | `openloaf-basics` + `task-ops` |
| `settings`, `project-settings` | `openloaf-basics` + `settings-guide` |
| `project-files` | `openloaf-basics` + `project-ops` + `file-ops` |
| `workbench` | `openloaf-basics` + `workbench-ops` |
| 其他 / `ai-chat` | `openloaf-basics` |

`openloaf-basics` **始终加载**，确保 Agent 对 OpenLoaf 有基本认知。

---

## 三、异步群组聊天

### 3.1 协作工具集

| 工具 | 用途 | 约束 |
|------|------|------|
| `spawn-agent` | 创建子 Agent | 最大深度 2、并发上限 4 |
| `send-input` | 向子 Agent 发消息 | 子 Agent 必须已 spawn |
| `wait-agent` | 等待子 Agent 完成 | ANY 语义，任一完成即返回 |
| `abort-agent` | 中止子 Agent | 立即终止 |

### 3.2 群组协作 UI 展示

当主 Agent 委派多个子 Agent 时，前端展示类似群组讨论：

```
[PM] 好的，我来安排团队协作：

┌─ 群组协作 ────────────────────────────┐
│                                        │
│  📊 数据分析师  ✅ 已完成              │
│  ├ 分析了 sales.csv (1.2万行)         │
│  └ 发现3个关键趋势                    │
│                                        │
│  📝 文档编辑师  ✅ 已完成              │
│  └ 生成 trend-report.md (2.4KB)       │
│                                        │
│  🎨 画布设计师  🔄 进行中...           │
│  └ 创建数据仪表板画布...              │
│                                        │
└────────────────────────────────────────┘

[PM] 分析报告和画布已完成，关键发现：...
```

### 3.3 子 Agent 上下文继承

主 Agent spawn 子 Agent 时，子 Agent 自动继承：
- `projectId` → 子 Agent 在同一项目沙箱中工作
- 对应 pageContext 的 skill → 子 Agent 拥有相同的能力认知
- 临时项目路径 → 如果主 Agent 已创建临时项目

### 3.4 子 Agent 消息流

子 Agent 输出通过 `data-sub-agent-start/delta/chunk/end` 事件推送到前端：
- 前端通过 `useSubAgentStreams` 为每个 toolCallId 创建独立 ReadableStream
- 支持多个并发子 Agent 流
- 状态流转：`output-streaming` → `output-available` / `output-error`

---

## 四、跨项目 @mention 路由

### 4.1 数据流

```
用户在主对话输入 "@agents/项目X/pm 做个需求分析"
    ↓
前端 ChatAgentMention 解析出 selectedAgent: {projectId, projectTitle, agentType:'pm'}
    ↓
ChatInput.handleSubmit() 判断 isCrossProject
    ↓
注入 metadata.targetAgent: {kind:'pm', projectId, projectTitle}
    ↓
服务端 chatStreamService 检测 targetAgent
    ├─ findActivePmTask(projectId)
    │   ├─ 有活跃任务 → appendUserMessage（追加消息）
    │   └─ 无活跃任务 → createTaskConfig（创建新 PM 任务）
    ↓
返回 createAgentRouteAckResponse：
  "已将指令发送给「项目X」的管理员，稍后会在此回报结果。"
    ↓
PM 在独立 session 中执行 → 完成后 task-report 写入源会话
```

### 4.2 路由决策矩阵

| 场景 | agentType | targetAgent | 走哪条路 | 响应方式 |
|------|-----------|-------------|---------|---------|
| 项目内直接对话 | `'pm'` | 无 | PM Agent 直聊 | 流式 |
| 同项目 @mention PM | `'pm'` | 被忽略 | PM Agent 直聊 | 流式 |
| 主对话 @mention 项目 PM | 无 | `{kind:'pm', projectId}` | 任务创建/追加 | ACK + task-report |
| 项目 A @mention 项目 B PM | `'pm'` | `{kind:'pm', projectId:B}` | 任务创建/追加 | ACK + task-report |
| 主对话无 mention | 无 | 无 | Master Agent | 流式 |

### 4.3 类型定义

```typescript
// packages/api/src/types/message.ts
export type TargetAgent = {
  kind: 'pm'
  projectId: string
  projectTitle?: string
}
```

---

## 五、Task 与对话的双向流转

### 5.1 对话 → Task（从对话中创建任务）

```
用户："以后每周五下午帮我整理本周的邮件摘要"
    ↓
Agent 识别意图：重复性任务 → 调用 task-manage.create
    {
      name: "每周邮件摘要",
      triggerMode: "scheduled",
      schedule: { type: "cron", cronExpr: "0 17 * * 5" },
      agentName: "master",
      pageContext: { scope: 'global', page: 'email' },   ← 自动注入
      sourceSessionId: 当前会话,
      selectedSkills: ["email-ops"],                       ← 自动关联
      requiresReview: true,
      skipPlanConfirm: true
    }
    ↓
Agent 回复："已创建定时任务，每周五 17:00 执行。
            执行结果会发送到这个对话中。"
```

### 5.2 Task → 对话（任务结果回报）

```
周五 17:00 TaskScheduler 触发
    ↓
TaskExecutor 启动 Agent：
  - 读取 task.pageContext → 加载 email-ops skill
  - 执行邮件摘要生成
    ↓
Agent 完成后，追加 task-report 到 sourceSessionId：
  {
    role: "task-report",
    parts: [
      { type: "text", text: "本周邮件摘要：..." },
      { type: "data-task", data: { taskId, status: "done" } }
    ],
    agent: { name: "AI秘书", kind: "master" }
  }
    ↓
用户下次打开会话 → 看到 task-report 消息
通知栏 → 🔔 "每周邮件摘要已生成"
```

### 5.3 Task 上下文继承规则

- **Task 配置新增 `pageContext` 字段**：创建时从当前对话的 pageContext 快照存入
- **执行时自动加载 skill**：TaskExecutor 读取 `task.pageContext`，查表注入对应 skill
- **Agent 选择**：有指定 `agentName` 用指定的，没指定按 pageContext 自动匹配（项目 → PM，全局 → Master）
- **pageContext 是创建时快照**：执行时使用快照值（执行时用户可能不在原页面）

### 5.4 Task 中的群组协作

复杂 Task 执行时，Agent 可以 spawn 子 Agent 协作：

```
Task："整理项目 A 的技术文档"（后台执行）
    ↓
PM Agent 启动：
  1. spawn Coder → 扫描代码结构、提取 API 定义
  2. spawn Extractor → 从 README 和注释中提取信息
  3. wait-agent → 等待两者完成
  4. 自己整合结果
  5. spawn Doc Editor → 生成结构化文档
  6. wait-agent → 文档完成
  7. 回报到源会话
    ↓
task-report 中包含协作过程摘要 + 最终产物链接
```

### 5.5 Task 完成通知体验

当后台 Task 完成，用户不一定在原页面：

```
通知方式（分层）：
1. 系统通知栏：🔔 小红点 + "项目 A 的代码检查任务已完成"
2. 源会话中：追加 task-report 消息（下次打开可见）
3. 任务看板：状态卡片从 running → review/done
4. 可选：桌面通知（Electron 原生通知）
```

---

## 六、Task 系统核心规则

### 6.1 执行模式

- **单阶段**（`skipPlanConfirm=true && !requiresReview`）：`todo → running → done`
- **两阶段**（需确认/审查）：`todo → running(plan) → review(plan) → running(execute) → review(completion) → done`

### 6.2 触发模式

| 模式 | 说明 | 示例 |
|------|------|------|
| `manual` | 手动启动 | 用户点击运行 |
| `scheduled` | 定时/周期 | cron: `0 9 * * *`、once、interval |
| `condition` | 条件触发 | 邮件到达、文件变更、聊天关键词 |

### 6.3 会话隔离

- `isolated`：每次执行独立会话（适合重复任务）
- `shared`：复用同一会话（适合渐进式任务）

### 6.4 错误恢复

- `cooldownMs`：两次执行最小间隔
- `consecutiveErrors`：连续失败 3 次自动禁用
- `planConfirmTimeoutMs`：确认超时时间

---

## 七、完整用户旅程示例

### 示例 1：全局模式 → 项目列表 → 对话

```
[用户点击 Sidebar "项目空间"]
  → pageContext = {scope: 'global', page: 'project-list'}
  → 自动加载 openloaf-basics + project-ops
  → Master Agent 就绪

[用户]："帮我创建一个新项目，叫做 Q2-Marketing"
  → Master 调用 create-project
  → 返回："已创建，要打开它吗？"

[用户]："打开它"
  → 导航到项目页面
  → pageContext 更新为 {scope: 'project', page: 'project-index', projectId: 'xxx'}
  → 主 Agent 切换为 PM
  → skill 切换为 project-ops
```

### 示例 2：全局对话 → 自动临时项目

```
[用户在 AI 助手页面]
  → pageContext = {scope: 'global', page: 'ai-chat'}

[用户]："帮我用 Python 写一个爬虫脚本"
  → Master 分析意图：需要创建文件
  → 委派 Coder 子 Agent
  → Coder 检测无项目上下文 → 创建临时项目
  → 在临时项目中创建 scraper.py
  → 返回代码 + 轻提示

[用户]："不错，保存为正式项目"
  → Agent 调用 promote-temp-project
  → 临时项目转为正式项目
```

### 示例 3：项目模式 → 多 Agent 协作

```
[用户在项目文件页]
  → PM Agent 就绪 + file-ops 已加载

[用户]："分析 reports/ 下的 CSV，生成趋势报告，做成画布"
  → PM 分析：数据分析 + 文档生成 + 画布设计
  → spawn Data Analyst → 分析 CSV
  → Data Analyst 完成 → PM 整合
  → spawn Doc Editor → 生成报告
  → spawn Canvas Designer → 创建画布
  → PM 汇总回复 + 文件链接 + 画布链接
```

### 示例 4：对话 → Task → 异步回报

```
[用户在邮箱页]
  → calendar-ops 已加载

[用户]："以后每天早上帮我检查重要邮件并提醒"
  → Master 识别：重复任务
  → 创建 Task（cron: 0 9 * * *，email-ops skill，sourceSession）
  → "已创建定时任务"

[次日 9:00] TaskScheduler 触发
  → Agent 加载 email-ops → 检查邮件 → 生成摘要
  → task-report 回报到源会话
  → 用户打开该会话 → 看到邮件摘要
```

---

## 八、关键文件索引

### 路由与调度

| 文件 | 用途 |
|------|------|
| `apps/server/src/ai/services/chat/chatStreamService.ts` | 消息路由入口（targetAgent/agentType 检测） |
| `apps/server/src/ai/services/chat/AiExecuteService.ts` | skill 自动加载 + 动态展开 |
| `apps/server/src/ai/services/chat/streamOrchestrator.ts` | createAgentRouteAckResponse |

### Task 系统

| 文件 | 用途 |
|------|------|
| `apps/server/src/services/taskConfigService.ts` | 任务 CRUD + findActivePmTask |
| `apps/server/src/services/taskScheduler.ts` | 定时调度（cron/interval/once） |
| `apps/server/src/services/taskOrchestrator.ts` | 任务生命周期、冲突检测、审批 |
| `apps/server/src/services/taskExecutor.ts` | 执行引擎、两阶段审批、结果回报 |
| `apps/server/src/services/taskEventBus.ts` | 事件发布（statusChange） |

### Agent 协作

| 文件 | 用途 |
|------|------|
| `apps/server/src/ai/tools/agentTools.ts` | spawn-agent / send-input / wait-agent / abort-agent |
| `apps/server/src/ai/services/agentManager.ts` | 并发管理（MAX_DEPTH=2, MAX_CONCURRENT=4） |
| `apps/server/src/ai/services/agentFactory.ts` | 数据驱动的子 Agent 创建 |
| `apps/server/src/ai/tools/AgentSelector.ts` | resolveAgentByName() 按优先级查找 |

### 前端

| 文件 | 用途 |
|------|------|
| `apps/web/src/components/ai/input/ChatAgentMention.tsx` | @mention 项目选择菜单 |
| `apps/web/src/components/ai/input/ChatInput.tsx` | 跨项目 metadata 注入 |
| `apps/web/src/components/ai/hooks/use-sub-agent-streams.ts` | 子 Agent 消息流 |
| `apps/web/src/components/ai/message/MessageTaskReport.tsx` | task-report 渲染 |
| `apps/web/src/components/tasks/TaskBoardPage.tsx` | 任务看板 Kanban |

### 类型定义

| 文件 | 用途 |
|------|------|
| `packages/api/src/types/message.ts` | ChatRequestBody, TargetAgent, OpenLoafAgentInfo |
| `packages/api/src/types/tools/task.ts` | task-manage Tool 定义 |
| `packages/api/src/types/tools/agent.ts` | spawn-agent Tool 定义 |

---

## Skill Sync Policy（强制）

> 修改以下文件后，必须同步更新本 skill 文件。

| 变更范围 | 需更新的章节 |
|----------|-------------|
| `chatStreamService.ts` 路由逻辑 | 二、路由决策流程 + 四、跨项目 @mention |
| `AiExecuteService.ts` skill 加载逻辑 | 二、Skill 自动加载映射 |
| `ChatAgentMention.tsx` 触发/选择逻辑 | 四、跨项目 @mention 路由 |
| `ChatInput.tsx` handleSubmit / metadata 注入 | 四、跨项目 @mention 路由 |
| `taskConfigService.ts` / `taskExecutor.ts` 任务逻辑 | 五、Task 与对话的双向流转 + 六、Task 系统核心规则 |
| `agentTools.ts` 协作工具变更 | 三、异步群组聊天 |
| `agentManager.ts` 并发/深度限制变更 | 三、异步群组聊天 |
| `message.ts` TargetAgent / ChatRequestBody 变更 | 一、交互模式 + 四、类型定义 |
| `MessageTaskReport.tsx` task-report 渲染变更 | 五、Task 完成通知体验 |
| 新增 Agent 类型或触发模式 | 对应章节 |
| 架构层级变更（新增/删除角色层） | 全文档 |
