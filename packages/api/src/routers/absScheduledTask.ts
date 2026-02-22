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

const taskConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  agentName: z.string().optional(),
  enabled: z.boolean(),
  triggerMode: z.enum(['scheduled', 'condition']),
  schedule: scheduleConfigSchema.optional(),
  condition: conditionConfigSchema.optional(),
  payload: z.any().optional(),
  sessionMode: z.enum(['isolated', 'shared']),
  timeoutMs: z.number(),
  cooldownMs: z.number().optional(),
  lastRunAt: z.string().nullable(),
  lastStatus: z.string().nullable(),
  lastError: z.string().nullable(),
  runCount: z.number(),
  consecutiveErrors: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
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
      agentName: z.string().optional(),
      enabled: z.boolean().optional(),
      triggerMode: z.enum(['scheduled', 'condition']),
      schedule: scheduleConfigSchema.optional(),
      condition: conditionConfigSchema.optional(),
      payload: z.any().optional(),
      sessionMode: z.enum(['isolated', 'shared']).optional(),
      timeoutMs: z.number().optional(),
      cooldownMs: z.number().optional(),
      scope: z.enum(['workspace', 'project']).optional(),
    }),
    output: taskConfigSchema,
  },
  update: {
    input: z.object({
      id: z.string(),
      projectId: z.string().optional(),
      name: z.string().min(1).optional(),
      agentName: z.string().optional(),
      enabled: z.boolean().optional(),
      triggerMode: z.enum(['scheduled', 'condition']).optional(),
      schedule: scheduleConfigSchema.optional(),
      condition: conditionConfigSchema.optional(),
      payload: z.any().optional(),
      sessionMode: z.enum(['isolated', 'shared']).optional(),
      timeoutMs: z.number().optional(),
      cooldownMs: z.number().optional(),
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
    })
  }
}

export const scheduledTaskRouter = BaseScheduledTaskRouter.createRouter()
export type ScheduledTaskRouter = typeof scheduledTaskRouter
