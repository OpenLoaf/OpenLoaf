---
name: runtime-task-ops
description: >
  Runtime Task 运行时任务追踪——session 级别的进度可视化。当用户要求的任务预计超过 3 个步骤、
  执行时间 > 2 分钟、需要并行委派给多个子代理、或明确想看到"AI 正在做什么"的进度时激活。
  触发词：分多个步骤、分成几步、step 1 / step 2、并行处理、同时做、批量处理、跟踪进度、
  显示进度、多步骤、复杂任务、大任务、让我看到进度、实时展示、并发执行。
  注意：与 SubmitPlan（一次性审批计划）和 TaskManage（持久化定时任务）是三个不同系统，
  Runtime Task 是 session 内的轻量级进度追踪，不入库、不审批。
---

# Runtime Task — 运行时任务追踪

Runtime Task 是 **session 级** 的任务追踪系统，用于向用户实时展示**大型多步骤任务的进度**。任务会显示在输入框上方的进度条中，session 结束自然消失。

## 三个系统的区别（非常重要）

| 系统 | 工具 | 生命周期 | 审批 | 用途 |
|------|------|---------|------|------|
| **SubmitPlan** | `SubmitPlan` | 单次对话 | 需要用户批准 | 代码/系统修改前的"先看计划再动手" |
| **Runtime Task**（本 skill） | `TaskCreate` / `TaskUpdate` / `TaskRead` | session 内 | 不审批 | 多步骤/并行任务的实时进度可视化 |
| **Persistent Task**（task-ops skill） | `TaskManage` / `TaskStatus` | 持久化入库 | 可配置审批 | 定时/周期性任务（cron、每天 9 点跑） |

**永远不要混用。** 同一个会话中如果用了 SubmitPlan，就不要再 TaskCreate 重复追踪同一件事。

## 何时使用 Runtime Task

用（✅）：
- 用户说"分成 N 步"、"分 X 个步骤"、"step 1 / step 2 / step 3"
- 预计需要 > 3 次工具调用或 > 2 分钟的任务
- 需要并行委派给多个子代理（如同时爬 3 个网站、并行分析多个文件）
- 用户明确说"显示进度"、"让我看到你在做什么"、"实时更新"
- 大型研究/分析类任务（"帮我全面分析 X 项目"、"扫描整个代码库"）

不用（❌）：
- 简单问答、单步操作、纯读文件
- 已经调用了 `SubmitPlan` 的任务——计划就是进度载体，不要重复
- 用户只想要答案而不关心过程

## 工作流

### 1. 创建任务

在开始工作前（不是开始后）批量创建任务：

```
TaskCreate { subject: "扫描目录结构" }
TaskCreate { subject: "分析核心模块" }
TaskCreate { subject: "生成架构总结", blockedBy: ["1", "2"] }
```

返回的 task id 是自增数字字符串（"1"、"2"、"3"）。`blockedBy` 表示依赖：该任务会保持 `pending` 直到依赖全部 `completed`。

### 2. 开始执行 — 切到 in_progress

真正开始做某个任务前调用：

```
TaskUpdate { taskId: "1", status: "in_progress", activeForm: "扫描 sjsm_tools 目录" }
```

`activeForm` 是"现在正在做什么"的实时文本（<= 200 字），仅内存 + SSE，频繁更新不会写盘。

### 3. 完成 — 切到 completed

```
TaskUpdate { taskId: "1", status: "completed" }
```

返回值中如果有 `unlockedTasks: ["3"]`，**必须立刻在下一步处理这些任务**（改为 in_progress 或说明为什么推迟），不可遗漏。

### 4. 失败 — 切到 failed

```
TaskUpdate { taskId: "2", status: "failed" }
```

系统会自动级联：所有依赖该任务的下游任务标记为 failed + `failReason='depFailed'`。

## 并行委派模式（多 Agent）

```
1. TaskCreate { subject: "爬取 A 网站" }    → task 1
2. TaskCreate { subject: "爬取 B 网站" }    → task 2
3. TaskCreate { subject: "爬取 C 网站" }    → task 3
4. TaskCreate { subject: "汇总对比", blockedBy: ["1","2","3"] }  → task 4

5. Agent { subagent_type: "explore", task: "...", task_id: "1" }  // 异步
6. Agent { subagent_type: "explore", task: "...", task_id: "2" }
7. Agent { subagent_type: "explore", task: "...", task_id: "3" }
```

Agent 工具的 `task_id` 参数会自动管理生命周期：
- spawn 时：task 自动 `status='in_progress'` + 写 owner
- 子代理成功：自动 `completed`
- 子代理失败：自动 `failed` + `failReason`（agentFailed / timeout / abortedByUser）
- 解锁下游任务时自动通知 Master

## 状态机（严格单向）

```
pending     → in_progress, failed
in_progress → completed, failed
completed   → (终态，不可变)
failed      → (终态，不可变)
```

**完成或失败的任务不能改回 in_progress，也不能重试**。如需重做一个失败的步骤，创建**新任务**。

## 查询

```
TaskRead {}                               // 默认：只返回 pending + in_progress
TaskRead { taskId: "2" }                  // 单任务详情
TaskRead { statusFilter: ["completed"] }  // 已完成列表
```

`TaskRead` 是只读的，在下列场景调用：
- 创建新任务前检查是否已有同名任务（避免重复）
- `unlockedTasks` 回调后查询具体哪些任务就绪
- 向用户汇报阶段性进度前

## 常见错误

- **状态跳步**：`pending → completed`（跳过 in_progress）— 会被拒绝，必须先 in_progress
- **重试已完成任务**：`completed → in_progress` — 被拒绝，请 TaskCreate 新任务
- **伪造 owner**：TaskCreate 的参数里不能传 owner / createdAt / agentId，这些由服务端强制注入
- **子代理调用 Task 工具**：仅 Master 有权限，子代理调用会返回权限错误
- **只创建不更新**：TaskCreate 后任务停留在 pending，UI 里一直灰着。**必须**在真正开始执行那一刻 TaskUpdate 到 in_progress

## 关键原则

1. **先创建再干活**：拿到多步骤请求 → 先 TaskCreate 批量建任务 → 再逐个 TaskUpdate + 执行
2. **状态诚实**：不要一次性把所有任务标记为 completed，每步实际完成时才切
3. **优先 activeForm**：细粒度进度（"第 3/20 个文件"）用 activeForm，不要频繁 TaskCreate 小任务
4. **终态不后悔**：切 completed/failed 前想清楚，无法回滚
