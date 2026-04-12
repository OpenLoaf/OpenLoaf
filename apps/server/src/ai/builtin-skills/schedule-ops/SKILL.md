---
name: schedule-ops
description: >
  持久化看板任务——cron/interval/once 定时调度、委派给项目 Agent 异步执行。
  当用户明确要求"每天/每周/定时做 X"、"自动化"、"周期性执行"、"让 XX Agent 跑这个"、
  "看板任务"、"审批流"时激活。
  **不用于**：纯对话请求（倒计时、闲聊、角色扮演→直接回答）、
  一次性即时操作（查天气、算数学→直接用工具）、
  日程安排（会议、约会→calendar-ops）、
  一次性计划审批（→SubmitPlan）。
---

# 任务操作技能

本技能通过三个工具完成所有任务操作：

- **`ScheduledTaskManage`** — 创建与管理（create / cancel / delete / resolve / archive / ...）
- **`ScheduledTaskStatus`** — 查询任务快照（状态 / executionSummary / lastError）
- **`ScheduledTaskWait`** — 阻塞等待指定任务到达终态或超时返回（立即任务的必配搭档）

## 什么时候用哪个工具

- **用户在问任务情况**（"有什么任务"、"进度怎么样"、"哪些待审批"）→ `ScheduledTaskStatus`
- **用户要创建、取消、删除任务** → `ScheduledTaskManage`（create / cancel / delete / archive 等）
- **用户要审批或打回某个任务** → `ScheduledTaskManage` 的 `resolve` 动作（approve / reject / rework）
- **用户要"立刻做某事"且希望看到结果**（"跑这个脚本"、"现在生成报告"）→ `ScheduledTaskManage(create, skipPlanConfirm:true)` + **紧接着** `ScheduledTaskWait`
- **用户既问又改**（"看看有什么任务，把过期的都取消掉"）→ 先 `ScheduledTaskStatus` 拿列表，再逐一 `ScheduledTaskManage`

---

## 立即任务 vs 定时任务：什么时候用 ScheduledTaskWait

这是**本技能最关键的决策点**。任务完成**不会**自动出现在对话里——Agent 不会收到任何异步通知。
要想知道任务结果，**只能主动调工具去取**（类似 Claude Code 的 Sleep 工具语义）。

### 立即任务：create + ScheduledTaskWait

用户描述**当下就要做的事**（"跑一下这个脚本"、"检查系统状态"、"生成一份报告"、"现在帮我 X"）：

1. `ScheduledTaskManage(action:'create', skipPlanConfirm:true, ...)` 启动
2. **紧接着**调 `ScheduledTaskWait({taskId, timeoutSec:60})` 阻塞等待完成
3. 根据 `ScheduledTaskWait` 返回的 tool_result 告知用户最终结果，然后 end_turn

`ScheduledTaskWait` 返回字段：

- `status: done` — 任务成功，读 `summary`（executionSummary）
- `status: cancelled` — 任务被取消或连续失败过阈值，读 `error`（lastError）
- `status: timeout` — 60 秒没完成，读 `currentStatus`（通常仍是 running）

### 定时任务：create + 直接回复，禁止 ScheduledTaskWait

用户描述**未来/周期性**的事（"每天 8 点"、"5 分钟后"、"每周一"、"明天早上"）：

1. `ScheduledTaskManage(action:'create', schedule:{...})` 创建定时任务
2. **直接**回复用户"已安排，将在 X 执行"
3. end_turn

**严禁对定时任务调 ScheduledTaskWait**——定时任务要等到未来某个时间点才跑，调 `ScheduledTaskWait` 只会白白卡住当前 turn 直到超时（最多 300 秒），浪费模型 token 和用户等待时间。

### ScheduledTaskWait 超时后怎么办

`ScheduledTaskWait` 60 秒超时返回时，task 仍在后台运行。决策：

- **方案 A**：如果预计再等一会就能完成 → 再调一次 `ScheduledTaskWait({taskId, timeoutSec:120})` 继续等
- **方案 B**：如果任务明显耗时更长 → 告诉用户"任务在后台继续执行，完成后可在任务中心查看"并 end_turn
- **不要**无限连续调 ScheduledTaskWait，最多两次，之后应当移交后台

### 反模式：禁止 Bash sleep + ScheduledTaskStatus 轮询

**错误做法**（浪费 token、低效、和 ScheduledTaskWait 功能重复）：

```
Bash(sleep 5)
ScheduledTaskStatus(taskId)   → 还在 running
Bash(sleep 5)
ScheduledTaskStatus(taskId)   → 还在 running
...
```

**正确做法**：

```
ScheduledTaskWait({taskId, timeoutSec: 60})   → 一次调用，事件驱动，零无效往返
```

`ScheduledTaskWait` 内部订阅任务完成事件，一到达终态立即返回；没必要用 Bash 睡眠+轮询模拟同样的行为。

## 歧义消解

用户说"我有什么要处理的"、"what's on my plate"、"今天有什么事"——可能指任务、日历日程或未读邮件。优先用 `ScheduledTaskStatus` 检查任务，但**同时告知用户**你只查了任务维度。如果上下文暗示日程或邮件（如"今天有什么会"），应建议调用对应技能而非猜测。

---

## 为什么需要两阶段执行

任务默认采用「计划 → 审批 → 执行」两阶段模式。原因很简单：有些操作一旦执行就无法撤回——文件被修改、邮件被发送、数据被删除。两阶段让用户在不可逆操作发生前看到 Agent 的执行计划，决定是否继续。

流程如下：Agent 接到任务后先生成执行计划，任务进入 `review` 状态等待用户审阅。用户看到计划后可以批准（approve）、拒绝（reject）、或要求修改（rework 并附上修改意见）。批准后 Agent 才真正执行，执行结果再次进入 review 供用户确认，最终标记为 done。

状态流转全貌：`todo → running(plan) → review(plan) → approve → running(execute) → review(result) → done`

### 什么时候跳过审批

设置 `skipPlanConfirm: true`，任务直接执行，状态流转简化为：`todo → running → done`。

适用于只读、无副作用的操作——检查服务器状态、获取天气、汇总信息、生成报告摘要。这类任务即使出错也不会造成损失，额外的审批环节反而拖慢效率。

**判断标准：如果执行结果不满意，用户能否简单地忽略它？** 能忽略的用 `skipPlanConfirm: true`，不能忽略的保持默认两阶段。

具体示例：
- 「每小时检查服务器状态」→ skipPlanConfirm: true（只读查询，无副作用）
- 「每天自动整理收件箱并归档」→ skipPlanConfirm: false（移动邮件是不可逆操作）
- 「定时发送日报」→ skipPlanConfirm: false（发送邮件无法撤回）
- 「每天早上生成待办摘要」→ skipPlanConfirm: true（只是读取和汇总信息）

注意：定时任务（带 schedule）默认 `skipPlanConfirm: true`，因为定时触发时用户通常不在线审批。如果定时任务包含不可逆操作，需显式设置 `skipPlanConfirm: false`。

---

## 调度类型决策

创建任务时先判断调度需求。不带 schedule 的任务立即执行，不进入调度系统。

**用户只需要做一次？→ `once`**
提供 `scheduleAt`（ISO 8601 时间字符串，必须是未来时间）。适合「周五下午五点发周报」「明天上午提醒我开会」这类一次性定时需求。

**用户需要固定间隔重复？→ `interval`**
提供 `intervalMs`（毫秒），最小值 60000（1 分钟）。适合「每 30 分钟检查一次服务器」（intervalMs: 1800000）、「每 2 小时同步数据」（intervalMs: 7200000）。

**用户需要复杂时间规则？→ `cron`**
提供 `cronExpr`（5 段格式：分 时 日 月 周）加 `timezone`。适合「工作日早上 9 点检查邮件」（cronExpr: "0 9 * * 1-5"）、「每月 1 号生成报告」（cronExpr: "0 10 1 * *"）。

常用 cron 示例：`0 9 * * *`（每天 9 点）· `0 9 * * 1-5`（工作日 9 点）· `0 * * * *`（每小时整点）· `0 10 1 * *`（每月 1 号 10 点）· `0 8 * * 1`（每周一 8 点）

---

## 审批操作

当任务处于 `review` 状态时，用 resolve 动作处理：

- **approve** — 批准计划或确认结果，任务继续推进到下一阶段
- **reject** — 拒绝，任务直接标记为 cancelled，不会执行任何操作
- **rework** — 打回修改，**必须**附 `reason` 说明需要改什么，Agent 会根据意见重新制定计划

```
ScheduledTaskManage { action: "resolve", taskId: "xxx", resolveAction: "rework", reason: "请增加错误处理逻辑" }
```

---

## 典型工作流

### 创建定时任务
1. 分析用户需求，确定调度类型（once / interval / cron）
2. 用 `Bash` 执行 `date` 确认当前时间和时区
3. 调用 `ScheduledTaskManage` 的 create 动作，带上 schedule 配置
4. 告知用户任务已创建、调度方式及下次执行时间

**title 和 description 的写法**：`title` 是简短摘要（5-15 字，提炼用户意图而非照搬原话）；`description` 是 Agent 的执行手册，必须明确**目标**（做什么）、**交付物**（产物格式，如"保存 `report.md` 到项目根目录"）、**完成标准**（可客观判断的条件，不要写"效果好"这类模糊表述）。`skipPlanConfirm: false` 的任务 description 必须详尽（加上约束和硬红线），`skipPlanConfirm: true` 的任务 description 可精简但目标和交付物不能省。

### 处理待审批任务
1. 调用 `ScheduledTaskStatus {}` 获取所有活跃任务
2. 找到 status 为 `review` 的任务
3. 向用户展示 Agent 生成的计划或执行结果
4. 根据用户指示调用 resolve（approve / reject / rework）

### 批量清理
1. **先查后删**：调用 `ScheduledTaskStatus {}` 展示当前所有任务，确认影响范围
2. 选择合适的批量操作：cancelAll（取消活跃任务）、deleteAll（删除已终结任务）、archiveAll（归档已完成任务）
3. 向用户报告操作结果

---

## 常见错误与防范

**interval 设太小** — `intervalMs` 低于 60000 会被拒绝。原因：1 分钟是硬下限，大多数监控场景 5-30 分钟已足够，过短间隔会耗尽系统资源。

**cron 不带时区** — 不指定 `timezone` 会按 UTC 执行，用户说「早上 9 点」结果凌晨 1 点就跑了。原因：服务端默认 UTC，与用户本地时间有时差。始终询问或根据上下文推断用户时区，然后显式传入。

**deleteAll 前不检查** — `deleteAll` 只删除已终结任务（done / cancelled），不会误删活跃任务。但仍应先用 `ScheduledTaskStatus` 让用户确认列表。原因：用户可能忘了某个已完成的任务里有重要的执行日志。

**不该创建任务却创建了** — 如果用户说「帮我查一下天气」「现在几点了」，直接做就行，不要创建任务。原因：任务系统有调度和状态管理开销，只有需要定时、重复、延后执行或审批流程时才值得创建。

**scheduleAt 已过期** — once 类型的 `scheduleAt` 必须是未来时间。原因：已过期的时间无法调度，会被系统拒绝。创建前务必用 `Bash` 执行 `date` 核实当前时间。

**delete 活跃任务** — 只有 done 和 cancelled 状态的任务才能删除。原因：运行中的任务需要先 cancel 终止 Agent 执行，再 delete 清理记录。

**立即任务 create 后不调 ScheduledTaskWait** — 用户要"立刻跑个脚本"时，只调 `ScheduledTaskManage(create)` 然后就回复"已启动"会让用户在黑盒里等——任务完成结果不会自动出现，除非下次用户主动问。正确做法：`create` 紧接 `ScheduledTaskWait`，一次性把结果报给用户。

**对定时任务调 ScheduledTaskWait** — 定时任务在未来某时刻才跑，`ScheduledTaskWait` 会卡住当前 turn 直到超时。正确做法：定时任务 `create` 后直接回复"已安排"并 end_turn。

**Bash sleep + ScheduledTaskStatus 轮询** — 这是 `ScheduledTaskWait` 出现之前的临时做法，现在已过时。`ScheduledTaskWait` 事件驱动，零无效往返，直接用它。
