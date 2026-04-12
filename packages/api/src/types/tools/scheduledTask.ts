/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from 'zod'
import { RiskType } from '../toolResult'

export const scheduledTaskManageToolDef = {
  id: 'ScheduledTaskManage',
  readonly: false,
  name: 'Manage Scheduled Task',
  description:
    'Manage the full lifecycle of scheduled/recurring tasks (create / cancel / delete / run / resolve / archive, plus batch variants). See schedule-ops skill for usage.',
  parameters: z.object({
    action: z.enum([
      'create',
      'cancel',
      'delete',
      'run',
      'resolve',
      'archive',
      'cancelAll',
      'deleteAll',
      'archiveAll',
    ]),
    title: z.string().optional().describe('Required for create.'),
    description: z.string().optional(),
    priority: z.enum(['urgent', 'high', 'medium', 'low']).optional().default('medium'),
    schedule: z
      .object({
        type: z.enum(['once', 'interval', 'cron']),
        scheduleAt: z.string().optional().describe('ISO 8601; required for type=once.'),
        intervalMs: z.number().optional().describe('Milliseconds, min 60000; required for type=interval.'),
        cronExpr: z.string().optional().describe('5-field cron; required for type=cron.'),
        timezone: z.string().optional().describe('Defaults to system timezone.'),
      })
      .optional()
      .describe('Create only. Pass when user specifies a future time or cadence ("tomorrow 8am", "every day 9am"); omit to run immediately.'),
    skipPlanConfirm: z.boolean().optional().default(true).describe('false enables two-phase plan confirmation.'),
    agentName: z.string().optional().describe('Agent to execute the task.'),
    taskId: z.string().optional().describe('Required for cancel/delete/run/resolve/archive.'),
    resolveAction: z.enum(['approve', 'reject', 'rework']).optional().describe('Required for resolve.'),
    reason: z.string().optional(),
    statusFilter: z
      .array(z.enum(['todo', 'running', 'review', 'done', 'cancelled']))
      .optional()
      .describe('Batch-action filter (deleteAll is forced to done/cancelled).'),
  }),
  component: 'ScheduledTaskTool',
} as const

export const scheduledTaskStatusToolDef = {
  id: 'ScheduledTaskStatus',
  readonly: true,
  name: 'Scheduled Task Status',
  description:
    'Query status and progress of scheduled tasks. Omit taskId for an overview of all active tasks.',
  parameters: z.object({
    taskId: z.string().optional(),
  }),
  component: null,
} as const

export const scheduledTaskWaitToolDef = {
  id: 'ScheduledTaskWait',
  readonly: true,
  name: 'Wait Scheduled Task',
  description: `Block-wait for a scheduled task to reach a terminal state (done/failed/cancelled) or timeout. ONLY for immediate short-running tasks.

- Immediate ("do X now"): ScheduledTaskManage(create) → ScheduledTaskWait → report.
- Scheduled/recurring ("every day 8am", "in 5 minutes"): ScheduledTaskManage(create, schedule=...) → reply "scheduled" → end_turn. NEVER wait on scheduled tasks — it blocks the turn indefinitely.
- Do NOT poll via Bash sleep + ScheduledTaskStatus.

Returns { status: 'done'|'failed'|'cancelled'|'timeout', summary?, error?, currentStatus? }. On timeout, the task keeps running — either re-wait or end_turn.`,
  parameters: z.object({
    taskId: z.string().describe('Returned by ScheduledTaskManage(create).'),
    timeoutSec: z.number().int().min(5).max(300).default(60),
  }),
  component: null,
} as const

export const scheduledTaskToolMeta = {
  [scheduledTaskManageToolDef.id]: { riskType: RiskType.Write },
  [scheduledTaskStatusToolDef.id]: { riskType: RiskType.Read },
  [scheduledTaskWaitToolDef.id]: { riskType: RiskType.Read },
} as const
