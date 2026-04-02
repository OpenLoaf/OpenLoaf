---
name: multi-agent-routing
description: >
  【必读】当你需要做以下任何事情时，立即加载此 skill：
  ① 调用 Agent 工具创建子 Agent 执行子任务；
  ② 决定是否将当前请求委派给子 Agent（coder/email/calendar/shell/document/vision）；
  ③ 创建跨项目 Task 或在其他项目中执行异步任务；
  ④ 用户消息中 @mention 了另一个项目的 Agent（如 @项目A）；
  ⑤ 规划需要多个 Agent 并行执行的多步骤任务；
  ⑥ 理解页面上下文如何驱动 Agent 自动选择与切换；
  ⑦ 处理 task-report 回报流程（子 Agent 完成后如何回传结果到源会话）；
  ⑧ 理解同步对话、异步任务、异步群组三种交互模式的区别与选择；
  ⑨ 实现或修改消息路由逻辑（哪条消息该发给哪个 Agent）；
  ⑩ 处理对话与 Task 的双向流转（Chat→Task 或 Task→Chat）。
  涵盖：路由决策树、Agent 切换规则、Agent 协作协议、@mention 路由、
  跨项目任务创建、异步群组聊天机制、task-report 生命周期。
version: 3.1.0
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
│  异步群组    │  主 Agent 拆解任务 → 创建多个子 Agent   │
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

### 2.3 Skill 自动加载

Skill 自动加载映射的完整表格见 `system-agent-architecture` skill 第二章。`openloaf-basics` **始终加载**，确保 Agent 对 OpenLoaf 有基本认知。

---

## 三、异步群组聊天

### 3.1 协作工具集

| 工具 ID | 用途 | 约束 |
|---------|------|------|
| `Agent` | 创建子 Agent 并同步等待结果 | 最大深度 2、并发上限 4 |
| `SendMessage` | 向已有子 Agent 发消息（自动恢复已停止的 agent） | 子 Agent 必须已创建 |

**深度与并发限制的设计理由**：最大深度 2（主 → 子，子不可继续创建子 Agent）是为了控制 token 预算——每级创建都会复制上下文，层级越深 token 消耗指数增长；同时避免级联失败（子 Agent 出错时，调用链越深越难定位和恢复）。并发上限 4 是在响应速度与系统资源（内存、API 并发连接）之间的权衡点。

### 3.2 Agent 工具使用策略

Agent 工具**默认同步等待**子代理完成并返回结果，无需额外的等待步骤。调用 Agent 后直接获取子代理的输出。

#### subagent_type 选择

| subagent_type | 适用场景 | 能力 |
|---------------|---------|------|
| `general-purpose` | 通用任务（默认） | 完整工具集 |
| `explore` | 代码/文档探索 | 只读工具 |
| `plan` | 架构/方案设计 | 只读工具 |
| 自定义 Agent 名称 | 调用已注册的专业 Agent | Agent 定义的工具集 |

#### 并行调用模式

当任务可并行拆解时，同时调用多个 Agent（各自同步等待）：

```
// 主 Agent 拆解任务后并行调用（各自同步等待结果）
Agent { description: "分析 CSV", prompt: "...", subagent_type: "general-purpose" }
→ 同步返回分析结果

Agent { description: "生成报告模板", prompt: "...", subagent_type: "general-purpose" }
→ 同步返回报告模板
```

#### 扇出-汇总模式

```
主 Agent
  ├─ Agent-A（子任务 1）→ 同步返回结果 A
  ├─ Agent-B（子任务 2）→ 同步返回结果 B
  ├─ Agent-C（子任务 3）→ 同步返回结果 C
  ↓
主 Agent 汇总所有子 Agent 结果 → 输出最终回复
```

#### 追加指令与修正

当子 Agent 已创建但需要追加指令或修正时，使用 `SendMessage` 向其发送消息。SendMessage 会自动恢复已停止的 agent，无需重新创建。

### 3.3 群组协作 UI 展示

当主 Agent 通过 Agent 工具委派多个子 Agent 时，前端展示类似群组讨论：

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

### 3.4 子 Agent 上下文继承

主 Agent 通过 Agent 工具创建子 Agent 时，子 Agent 自动继承：
- `projectId` → 子 Agent 在同一项目沙箱中工作
- 对应 pageContext 的 skill → 子 Agent 拥有相同的能力认知
- 临时项目路径 → 如果主 Agent 已创建临时项目

### 3.5 子 Agent 消息流

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

Agent 识别到重复性/定时性需求时，调用 `TaskManage.create` 创建 Task。创建时自动从当前对话快照 `pageContext`，并关联相关 skill（如 `email-ops`）。Agent 回复确认信息，告知用户执行计划和回报位置。

### 5.2 Task → 对话（任务结果回报）

TaskScheduler 按触发条件（cron/interval/condition）启动 TaskExecutor：
1. 读取 `task.pageContext` → 加载对应 skill
2. Agent 执行任务逻辑
3. 完成后追加 `task-report`（role: `"task-report"`）到 `sourceSessionId`
4. 用户下次打开该会话即可看到结果；通知栏同步显示提醒

### 5.3 Task 上下文继承规则

- **`pageContext` 字段**：创建时从当前对话快照存入，执行时使用快照值（用户可能不在原页面）
- **skill 自动加载**：TaskExecutor 读取 `task.pageContext`，查表注入对应 skill
- **Agent 选择**：有指定 `agentName` 用指定的，没指定按 pageContext 自动匹配（项目 → PM，全局 → Master）

### 5.4 Task 中的群组协作

复杂 Task 执行时，Agent 可以创建子 Agent 协作。例如「整理项目技术文档」任务中，PM 可依次通过 Agent 工具创建 Coder（扫描代码结构）、Extractor（提取文档信息）、Doc Editor（生成最终文档），各自同步等待完成后汇总，最终 task-report 包含协作摘要和产物链接。

### 5.5 Task 完成通知体验

当后台 Task 完成，用户不一定在原页面，通知分层：
1. **系统通知栏**：小红点 + 任务完成提示
2. **源会话**：追加 task-report 消息（下次打开可见）
3. **任务看板**：状态卡片从 running → review/done
4. **桌面通知**（可选）：Electron 原生通知

---

## 六、Task 系统核心规则

Task 系统的详细规则（执行模式、触发模式、会话隔离、错误恢复）见 `task-ops` skill。

---

## 七、完整用户旅程示例

### 示例 1：项目模式 → 多 Agent 协作

```
[用户在项目文件页]
  → PM Agent 就绪 + file-ops 已加载

[用户]："分析 reports/ 下的 CSV，生成趋势报告，做成画布"
  → PM 分析：数据分析 + 文档生成 + 画布设计
  → Agent(Data Analyst) → 同步返回分析结果 → PM 整合
  → Agent(Doc Editor) → 同步返回报告
  → Agent(Canvas Designer) → 同步返回画布
  → PM 汇总回复 + 文件链接 + 画布链接
```

### 示例 2：对话 → Task → 异步回报

```
[用户在邮箱页]
  → email-ops 已加载

[用户]："以后每天早上帮我检查重要邮件并提醒"
  → Master 识别：重复任务
  → 创建 Task（cron: 0 9 * * *，email-ops skill，sourceSession）
  → "已创建定时任务"

[次日 9:00] TaskScheduler 触发
  → Agent 加载 email-ops → 检查邮件 → 生成摘要
  → task-report 回报到源会话
  → 用户打开该会话 → 看到邮件摘要
```

