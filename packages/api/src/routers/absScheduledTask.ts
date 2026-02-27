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
import { t, shieldedProcedure } from '../../generated/routers/helpers/createRouter'

const scheduleConfigSchema = z.object({
  type: z.enum(['once', 'interval', 'cron']),
  cronExpr: z.string().optional(),
  intervalMs: z.number().optional(),
  scheduleAt: z.string().optional(),
  timezone: z.string().optional(),
})

const conditionConfigSchema = z.object({
  type: z.enum(['email_received', 'chat_keyword', 'file_changed']),
  preFilter: z.any().optional(),
  rule: z.string().optional(),
})

const executionSummarySchema = z.object({
  currentStep: z.string().optional(),
  totalSteps: z.number().optional(),
  completedSteps: z.number().optional(),
  lastAgentMessage: z.string().optional(),
})

const activityLogEntrySchema = z.object({
  timestamp: z.string(),
  from: z.enum(['todo', 'running', 'review', 'done', 'cancelled']),
  to: z.enum(['todo', 'running', 'review', 'done', 'cancelled']),
  reviewType: z.enum(['plan', 'completion']).optional(),
  reason: z.string().optional(),
  actor: z.enum(['system', 'user', 'agent', 'timeout']),
})

const taskConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  status: z.enum(['todo', 'running', 'review', 'done', 'cancelled']),
  reviewType: z.enum(['plan', 'completion']).optional(),
  priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
  triggerMode: z.enum(['manual', 'scheduled', 'condition']),
  schedule: scheduleConfigSchema.optional(),
  condition: conditionConfigSchema.optional(),
  agentName: z.string().optional(),
  payload: z.any().optional(),
  sessionMode: z.enum(['isolated', 'shared']),
  sessionId: z.string().optional(),
  timeoutMs: z.number(),
  cooldownMs: z.number().optional(),
  planConfirmTimeoutMs: z.number(),
  skipPlanConfirm: z.boolean(),
  requiresReview: z.boolean(),
  autoExecute: z.boolean(),
  parentTaskId: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  enabled: z.boolean(),
  lastRunAt: z.string().nullable(),
  lastStatus: z.string().nullable(),
  lastError: z.string().nullable(),
  runCount: z.number(),
  consecutiveErrors: z.number(),
  executionSummary: executionSummarySchema.optional(),
  activityLog: z.array(activityLogEntrySchema),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  createdBy: z.enum(['user', 'agent']),
  scope: z.enum(['workspace', 'project']),
  filePath: z.string(),
})

const runLogSchema = z.object({
  id: z.string(),
  trigger: z.string(),
  triggerData: z.any().optional(),
  status: z.string(),
  error: z.string().nullable().optional(),
  agentSessionId: z.string().nullable().optional(),
  startedAt: z.string(),
  finishedAt: z.string().nullable().optional(),
  durationMs: z.number().nullable().optional(),
})

const taskStatusChangeSchema = z.object({
  taskId: z.string(),
  status: z.enum(['todo', 'running', 'review', 'done', 'cancelled']),
  previousStatus: z.enum(['todo', 'running', 'review', 'done', 'cancelled']),
  reviewType: z.enum(['plan', 'completion']).optional(),
  title: z.string(),
  updatedAt: z.string(),
})

export const scheduledTaskSchemas = {
  list: {
    input: z.object({
      workspaceId: z.string(),
      projectId: z.string().optional(),
    }),
    output: z.array(taskConfigSchema),
  },
  create: {
    input: z.object({
      workspaceId: z.string(),
      projectId: z.string().optional(),
      name: z.string().min(1),
      description: z.string().optional(),
      priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
      agentName: z.string().optional(),
      enabled: z.boolean().optional(),
      triggerMode: z.enum(['manual', 'scheduled', 'condition']),
      schedule: scheduleConfigSchema.optional(),
      condition: conditionConfigSchema.optional(),
      payload: z.any().optional(),
      sessionMode: z.enum(['isolated', 'shared']).optional(),
      timeoutMs: z.number().optional(),
      cooldownMs: z.number().optional(),
      planConfirmTimeoutMs: z.number().optional(),
      skipPlanConfirm: z.boolean().optional(),
      requiresReview: z.boolean().optional(),
      autoExecute: z.boolean().optional(),
      parentTaskId: z.string().optional(),
      dependsOn: z.array(z.string()).optional(),
      scope: z.enum(['workspace', 'project']).optional(),
      createdBy: z.enum(['user', 'agent']).optional(),
    }),
    output: taskConfigSchema,
  },
  update: {
    input: z.object({
      id: z.string(),
      projectId: z.string().optional(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      priority: z.enum(['urgent', 'high', 'medium', 'low']).optional(),
      agentName: z.string().optional(),
      enabled: z.boolean().optional(),
      triggerMode: z.enum(['manual', 'scheduled', 'condition']).optional(),
      schedule: scheduleConfigSchema.optional(),
      condition: conditionConfigSchema.optional(),
      payload: z.any().optional(),
      sessionMode: z.enum(['isolated', 'shared']).optional(),
      timeoutMs: z.number().optional(),
      cooldownMs: z.number().optional(),
      planConfirmTimeoutMs: z.number().optional(),
      skipPlanConfirm: z.boolean().optional(),
      requiresReview: z.boolean().optional(),
      autoExecute: z.boolean().optional(),
    }),
    output: taskConfigSchema,
  },
  delete: {
    input: z.object({
      id: z.string(),
      projectId: z.string().optional(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  run: {
    input: z.object({
      id: z.string(),
      projectId: z.string().optional(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  runLogs: {
    input: z.object({
      taskId: z.string(),
      workspaceId: z.string(),
      projectId: z.string().optional(),
      limit: z.number().optional(),
    }),
    output: z.array(runLogSchema),
  },
  // New endpoints for autonomous task system
  updateStatus: {
    input: z.object({
      id: z.string(),
      projectId: z.string().optional(),
      status: z.enum(['todo', 'running', 'review', 'done', 'cancelled']),
    }),
    output: taskConfigSchema,
  },
  resolveReview: {
    input: z.object({
      id: z.string(),
      projectId: z.string().optional(),
      action: z.enum(['approve', 'reject', 'rework']),
      reason: z.string().optional(),
    }),
    output: taskConfigSchema,
  },
  getTaskDetail: {
    input: z.object({
      id: z.string(),
      workspaceId: z.string(),
      projectId: z.string().optional(),
    }),
    output: taskConfigSchema,
  },
  listByStatus: {
    input: z.object({
      workspaceId: z.string(),
      projectId: z.string().optional(),
      status: z.array(z.enum(['todo', 'running', 'review', 'done', 'cancelled'])).optional(),
    }),
    output: z.array(taskConfigSchema),
  },
  archiveCompleted: {
    input: z.object({
      id: z.string(),
      projectId: z.string().optional(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
}

export abstract class BaseScheduledTaskRouter {
  public static routeName = 'scheduledTask'

  public static createRouter() {
    return t.router({
      list: shieldedProcedure
        .input(scheduledTaskSchemas.list.input)
        .output(scheduledTaskSchemas.list.output)
        .query(async () => {
          throw new Error('Not implemented in base class')
        }),
      create: shieldedProcedure
        .input(scheduledTaskSchemas.create.input)
        .output(scheduledTaskSchemas.create.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),
      update: shieldedProcedure
        .input(scheduledTaskSchemas.update.input)
        .output(scheduledTaskSchemas.update.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),
      delete: shieldedProcedure
        .input(scheduledTaskSchemas.delete.input)
        .output(scheduledTaskSchemas.delete.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),
      run: shieldedProcedure
        .input(scheduledTaskSchemas.run.input)
        .output(scheduledTaskSchemas.run.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),
      runLogs: shieldedProcedure
        .input(scheduledTaskSchemas.runLogs.input)
        .output(scheduledTaskSchemas.runLogs.output)
        .query(async () => {
          throw new Error('Not implemented in base class')
        }),
      updateStatus: shieldedProcedure
        .input(scheduledTaskSchemas.updateStatus.input)
        .output(scheduledTaskSchemas.updateStatus.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),
      resolveReview: shieldedProcedure
        .input(scheduledTaskSchemas.resolveReview.input)
        .output(scheduledTaskSchemas.resolveReview.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),
      getTaskDetail: shieldedProcedure
        .input(scheduledTaskSchemas.getTaskDetail.input)
        .output(scheduledTaskSchemas.getTaskDetail.output)
        .query(async () => {
          throw new Error('Not implemented in base class')
        }),
      listByStatus: shieldedProcedure
        .input(scheduledTaskSchemas.listByStatus.input)
        .output(scheduledTaskSchemas.listByStatus.output)
        .query(async () => {
          throw new Error('Not implemented in base class')
        }),
      archiveCompleted: shieldedProcedure
        .input(scheduledTaskSchemas.archiveCompleted.input)
        .output(scheduledTaskSchemas.archiveCompleted.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),
    })
  }
}

export const scheduledTaskRouter = BaseScheduledTaskRouter.createRouter()
export type ScheduledTaskRouter = typeof scheduledTaskRouter
