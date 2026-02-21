import {
  BaseScheduledTaskRouter,
  scheduledTaskSchemas,
  shieldedProcedure,
  t,
  getWorkspaceRootPath,
  getProjectRootPath,
} from '@tenas-ai/api'
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
} from '@/services/taskConfigService'
import { readRunLogsMultiScope } from '@/services/taskRunLogService'
import { taskScheduler } from '@/services/taskScheduler'

export class ScheduledTaskRouterImpl extends BaseScheduledTaskRouter {
  public static createRouter() {
    return t.router({
      list: shieldedProcedure
        .input(scheduledTaskSchemas.list.input)
        .output(scheduledTaskSchemas.list.output)
        .query(async ({ input }) => {
          const workspaceRoot = getWorkspaceRootPath()
          const projectRoot = input.projectId
            ? getProjectRootPath(input.projectId, input.workspaceId)
            : null
          return listTasks(workspaceRoot, projectRoot)
        }),
      create: shieldedProcedure
        .input(scheduledTaskSchemas.create.input)
        .output(scheduledTaskSchemas.create.output)
        .mutation(async ({ input }) => {
          const workspaceRoot = getWorkspaceRootPath()
          const scope = input.scope ?? (input.projectId ? 'project' : 'workspace')
          const rootPath = scope === 'project' && input.projectId
            ? getProjectRootPath(input.projectId, input.workspaceId) ?? workspaceRoot
            : workspaceRoot

          const task = createTask(
            {
              name: input.name,
              description: input.description,
              agentName: input.agentName,
              enabled: input.enabled ?? true,
              triggerMode: input.triggerMode,
              schedule: input.schedule,
              condition: input.condition,
              taskType: input.taskType,
              payload: input.payload,
              sessionMode: input.sessionMode ?? 'isolated',
              timeoutMs: input.timeoutMs ?? 600000,
              cooldownMs: input.cooldownMs,
            },
            rootPath,
            scope,
          )
          return task
        }),
      update: shieldedProcedure
        .input(scheduledTaskSchemas.update.input)
        .output(scheduledTaskSchemas.update.output)
        .mutation(async ({ input }) => {
          const workspaceRoot = getWorkspaceRootPath()
          const { id, ...patch } = input
          const task = updateTask(id, patch, workspaceRoot)
          if (!task) throw new Error(`Task not found: ${id}`)
          return task
        }),
      delete: shieldedProcedure
        .input(scheduledTaskSchemas.delete.input)
        .output(scheduledTaskSchemas.delete.output)
        .mutation(async ({ input }) => {
          const workspaceRoot = getWorkspaceRootPath()
          taskScheduler.unregisterTask(input.id)
          const ok = deleteTask(input.id, workspaceRoot)
          return { ok }
        }),
      run: shieldedProcedure
        .input(scheduledTaskSchemas.run.input)
        .output(scheduledTaskSchemas.run.output)
        .mutation(async ({ input }) => {
          await taskScheduler.runTaskNow(input.id)
          return { ok: true }
        }),
      runLogs: shieldedProcedure
        .input(scheduledTaskSchemas.runLogs.input)
        .output(scheduledTaskSchemas.runLogs.output)
        .query(async ({ input }) => {
          const workspaceRoot = getWorkspaceRootPath()
          const projectRoot = input.projectId
            ? getProjectRootPath(input.projectId, input.workspaceId)
            : null
          return readRunLogsMultiScope(
            input.taskId,
            workspaceRoot,
            projectRoot,
            input.limit,
          )
        }),
    })
  }
}

export const scheduledTaskRouterImplementation =
  ScheduledTaskRouterImpl.createRouter()
