---
name: schedule-ops-skill
description: >
  Trigger when the user wants to hand a task to background async execution, run it on a cron/recurring schedule, delegate it to a project Agent for a long run, or inspect/approve/cancel tasks on the board. Typical phrasings: "every day at 9am help me X", "let the coder agent run this", "what's pending approval". **Not for**: one-shot immediate answers (→ just use tools directly), real calendar meetings/appointments (→ calendar-ops-skill), one-off plan approvals (→ `SubmitPlan`).
---

# Task Operations Skill

## Tool Inventory

| Tool | Responsibility | Read-only |
|------|----------------|-----------|
| `ScheduledTaskManage` | Task creation and management (action: `create` / `cancel` / `delete` / `resolve` / `archive`, etc.) | No |
| `ScheduledTaskStatus` | Query task snapshots (status / executionSummary / lastError) | Yes |
| `ScheduledTaskWait` | Block until a given task reaches a terminal state or times out (mandatory partner for immediate tasks) | Yes |

> **Loading**: All are deferred tools. Before calling, activate their schemas via `ToolSearch(names: "ScheduledTaskManage,ScheduledTaskStatus,ScheduledTaskWait")`.

## Which Tool to Use When

- **User is asking about task status** ("what tasks do I have", "how's it going", "what's pending approval") → `ScheduledTaskStatus`
- **User wants to create, cancel, or delete a task** → `ScheduledTaskManage` (create / cancel / delete / archive, etc.)
- **User wants to approve or reject a task** → `ScheduledTaskManage` with the `resolve` action (approve / reject / rework)
- **User wants to "do X right now" and expects to see the result** ("run this script", "generate the report now") → `ScheduledTaskManage(create, skipPlanConfirm:true)` **immediately followed by** `ScheduledTaskWait`
- **User is both asking and acting** ("show me the tasks and cancel the expired ones") → first `ScheduledTaskStatus` to get the list, then `ScheduledTaskManage` one by one

---

## Immediate Tasks vs Scheduled Tasks: When to Use ScheduledTaskWait

This is **the single most important decision point in this skill**. Task completion **does not** surface itself in the conversation automatically — the Agent receives no async notifications.
The only way to learn a task's result is to actively call a tool to fetch it (semantically similar to Claude Code's Sleep tool).

### Immediate Tasks: create + ScheduledTaskWait

When the user describes **something to do right now** ("run this script", "check system status", "generate a report", "help me X now"):

1. `ScheduledTaskManage(action:'create', skipPlanConfirm:true, ...)` to kick it off
2. **Immediately** call `ScheduledTaskWait({taskId, timeoutSec:60})` to block until completion
3. Report the final result to the user based on the `ScheduledTaskWait` tool_result, then end_turn

Fields returned by `ScheduledTaskWait`:

- `status: done` — task succeeded, read `summary` (executionSummary)
- `status: cancelled` — task was cancelled or exceeded the failure threshold, read `error` (lastError)
- `status: timeout` — 60s elapsed without completion, read `currentStatus` (usually still running)

### Scheduled Tasks: create + reply directly, never ScheduledTaskWait

When the user describes **something for the future or recurring** ("every day at 8am", "in 5 minutes", "every Monday", "tomorrow morning"):

1. `ScheduledTaskManage(action:'create', schedule:{...})` to create the scheduled task
2. **Immediately** reply "scheduled, will run at X"
3. end_turn

**Never call ScheduledTaskWait on a scheduled task** — scheduled tasks only fire at some future time. Calling `ScheduledTaskWait` just stalls the current turn until timeout (up to 300s), wasting model tokens and making the user wait for nothing.

### What to Do When ScheduledTaskWait Times Out

When `ScheduledTaskWait` returns after a 60s timeout, the task is still running in the background. Your options:

- **Option A**: If the task is likely to finish soon → call `ScheduledTaskWait({taskId, timeoutSec:120})` once more to keep waiting
- **Option B**: If the task is clearly long-running → tell the user "the task is still running in the background, you can check results later in the task center" and end_turn
- **Do not** chain ScheduledTaskWait calls indefinitely — at most twice, then hand off to the background

### Antipattern: Bash sleep + ScheduledTaskStatus Polling

**Wrong approach** (wastes tokens, inefficient, duplicates what ScheduledTaskWait already does):

```
Bash(sleep 5)
ScheduledTaskStatus(taskId)   → still running
Bash(sleep 5)
ScheduledTaskStatus(taskId)   → still running
...
```

**Correct approach**:

```
ScheduledTaskWait({taskId, timeoutSec: 60})   → one call, event-driven, zero wasted round-trips
```

`ScheduledTaskWait` subscribes to task completion events internally and returns the instant the task reaches a terminal state. There's no need to simulate the same thing with Bash sleep + polling.

## Disambiguation

When the user says "what do I have to deal with", "what's on my plate", or "what's happening today", they could mean tasks, calendar events, or unread email. Prefer `ScheduledTaskStatus` to check tasks, but **tell the user explicitly** that you only looked at the tasks dimension. If context hints at calendar or email (e.g. "any meetings today"), suggest the corresponding skill instead of guessing.

---

## Why Two-Phase Execution Exists

Tasks default to a "plan → approve → execute" two-phase flow. The reason is simple: some operations cannot be undone once executed — files get modified, emails get sent, data gets deleted. Two-phase lets the user see the Agent's execution plan before any irreversible action, and decide whether to proceed.

The flow: after the Agent receives a task, it first generates an execution plan, and the task enters the `review` state awaiting user review. Once the user sees the plan, they can approve, reject, or request changes (rework, with modification notes). Only after approval does the Agent actually execute. The result then enters review again for user confirmation, and finally gets marked done.

Full state transition: `todo → running(plan) → review(plan) → approve → running(execute) → review(result) → done`

### When to Skip Approval

Setting `skipPlanConfirm: true` makes the task execute directly, simplifying the flow to: `todo → running → done`.

Use this for read-only, side-effect-free operations — checking server status, fetching weather, summarizing information, generating a report digest. Even if such a task goes wrong, nothing is lost, and the extra approval step just slows things down.

**Rule of thumb: if the result turns out bad, can the user simply ignore it?** If yes, use `skipPlanConfirm: true`. If no, keep the default two-phase flow.

Concrete examples:
- "Check server status every hour" → skipPlanConfirm: true (read-only query, no side effects)
- "Auto-sort and archive inbox every day" → skipPlanConfirm: false (moving emails is irreversible)
- "Send daily report on a schedule" → skipPlanConfirm: false (sent email cannot be unsent)
- "Generate a morning to-do digest every day" → skipPlanConfirm: true (just reading and summarizing)

Note: scheduled tasks (with `schedule`) default to `skipPlanConfirm: true`, because the user usually isn't online to approve when the timer fires. If a scheduled task involves irreversible operations, explicitly set `skipPlanConfirm: false`.

---

## Schedule Type Decision

When creating a task, first decide whether it needs scheduling. Tasks without `schedule` run immediately and never enter the scheduling system.

**User needs it once? → `once`**
Provide `scheduleAt` (ISO 8601 timestamp, must be in the future). Fits "send the weekly report at 5pm Friday" or "remind me about the meeting tomorrow morning".

**User needs it repeated at a fixed interval? → `interval`**
Provide `intervalMs` (milliseconds), minimum 60000 (1 minute). Fits "check the server every 30 minutes" (intervalMs: 1800000) or "sync data every 2 hours" (intervalMs: 7200000).

**User needs a complex time rule? → `cron`**
Provide `cronExpr` (5-field format: minute hour day month weekday) plus `timezone`. Fits "check email at 9am on weekdays" (cronExpr: "0 9 * * 1-5") or "generate a report on the 1st of every month" (cronExpr: "0 10 1 * *").

Common cron examples: `0 9 * * *` (every day at 9am) · `0 9 * * 1-5` (weekdays at 9am) · `0 * * * *` (every hour on the hour) · `0 10 1 * *` (1st of every month at 10am) · `0 8 * * 1` (every Monday at 8am)

---

## Approval Actions

When a task is in the `review` state, use the resolve action:

- **approve** — approves the plan or confirms the result; the task advances to the next phase
- **reject** — rejects; the task is marked cancelled and nothing is executed
- **rework** — sends it back for revision; you **must** attach `reason` explaining what to change, and the Agent will replan accordingly

```
ScheduledTaskManage { action: "resolve", taskId: "xxx", resolveAction: "rework", reason: "please add error handling" }
```

---

## Typical Workflows

### Creating a Scheduled Task
1. Analyze the user's intent and pick the schedule type (once / interval / cron)
2. Run `date` via `Bash` to confirm the current time and timezone
3. Call `ScheduledTaskManage` with the create action and the schedule config
4. Tell the user the task was created, the schedule, and the next run time

**Writing `title` and `description`**: `title` is a short summary (5-15 chars, distill the user's intent rather than quoting them verbatim); `description` is the Agent's execution handbook and must clearly spell out the **goal** (what to do), the **deliverable** (output format, e.g. "save `report.md` to the project root"), and the **completion criteria** (objectively verifiable conditions, not vague phrases like "good quality"). For tasks with `skipPlanConfirm: false`, the description must be thorough (add constraints and hard red lines); for tasks with `skipPlanConfirm: true`, the description can be concise, but goal and deliverable cannot be omitted.

### Handling Tasks Pending Approval
1. Call `ScheduledTaskStatus {}` to fetch all active tasks
2. Find tasks with status `review`
3. Show the user the Agent's plan or execution result
4. Call resolve (approve / reject / rework) per the user's instruction

### Bulk Cleanup
1. **Look before you leap**: call `ScheduledTaskStatus {}` first to display all current tasks and confirm the blast radius
2. Pick the right bulk operation: cancelAll (cancel active tasks), deleteAll (delete terminated tasks), archiveAll (archive completed tasks)
3. Report the result to the user

---

## Common Mistakes and How to Avoid Them

**interval too small** — `intervalMs` below 60000 is rejected. Why: 1 minute is the hard floor; 5-30 minutes is enough for most monitoring scenarios, and shorter intervals exhaust system resources.

**cron without timezone** — Without `timezone`, cron runs in UTC, so "9am" turns into 1am for the user. Why: the server defaults to UTC, which differs from the user's local time. Always ask or infer the user's timezone from context and pass it explicitly.

**deleteAll without checking first** — `deleteAll` only deletes terminated tasks (done / cancelled) and never touches active ones. Still, call `ScheduledTaskStatus` first and let the user confirm the list. Why: the user may have forgotten that a completed task contains important execution logs.

**Creating a task when you shouldn't** — If the user says "check the weather" or "what time is it", just do it — don't create a task. Why: the task system has scheduling and state-management overhead; only bother when you actually need scheduling, recurrence, deferred execution, or an approval flow.

**scheduleAt in the past** — `scheduleAt` for `once` tasks must be in the future. Why: past times cannot be scheduled and will be rejected. Verify the current time with `Bash` `date` before creating.

**delete on an active task** — Only tasks in `done` or `cancelled` state can be deleted. Why: running tasks must be cancelled first to stop the Agent, then deleted to clean up the record.

**Forgetting ScheduledTaskWait after creating an immediate task** — When the user says "run a script right now", calling only `ScheduledTaskManage(create)` and replying "started" leaves the user waiting in a black box — task completion will not surface unless they ask again. Correct: follow `create` immediately with `ScheduledTaskWait` and deliver the result in one shot.

**Calling ScheduledTaskWait on a scheduled task** — A scheduled task only runs at a future time, so `ScheduledTaskWait` will stall the current turn until timeout. Correct: for scheduled tasks, reply "scheduled" right after `create` and end_turn.

**Bash sleep + ScheduledTaskStatus polling** — This was a stopgap before `ScheduledTaskWait` existed and is now obsolete. `ScheduledTaskWait` is event-driven with zero wasted round-trips — just use it.
