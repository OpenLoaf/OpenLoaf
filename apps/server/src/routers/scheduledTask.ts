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
          // 逻辑：项目范围必须指定 projectId，避免任务落到错误目录。
          if (scope === 'project' && !input.projectId) {
            throw new Error('Project scope requires projectId')
          }
          const rootPath = scope === 'project' && input.projectId
            ? getProjectRootPath(input.projectId, input.workspaceId) ?? workspaceRoot
            : workspaceRoot

          const task = createTask(
            {
              name: input.name,
              agentName: input.agentName,
              enabled: input.enabled ?? true,
              triggerMode: input.triggerMode,
              schedule: input.schedule,
              condition: input.condition,
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
          const { id, projectId, ...patch } = input
          // 逻辑：指定 projectId 时在项目范围内更新任务。
          const projectRoot = projectId ? getProjectRootPath(projectId) : null
          const task = updateTask(id, patch, workspaceRoot, projectRoot)
          if (!task) throw new Error(`Task not found: ${id}`)
          return task
        }),
      delete: shieldedProcedure
        .input(scheduledTaskSchemas.delete.input)
        .output(scheduledTaskSchemas.delete.output)
        .mutation(async ({ input }) => {
          const workspaceRoot = getWorkspaceRootPath()
          taskScheduler.unregisterTask(input.id)
          // 逻辑：指定 projectId 时在项目范围内删除任务。
          const projectRoot = input.projectId ? getProjectRootPath(input.projectId) : null
          const ok = deleteTask(input.id, workspaceRoot, projectRoot)
          return { ok }
        }),
      run: shieldedProcedure
        .input(scheduledTaskSchemas.run.input)
        .output(scheduledTaskSchemas.run.output)
        .mutation(async ({ input }) => {
          // 逻辑：指定 projectId 时在项目范围内执行任务。
          const projectRoot = input.projectId ? getProjectRootPath(input.projectId) : null
          await taskScheduler.runTaskNow(input.id, projectRoot)
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
