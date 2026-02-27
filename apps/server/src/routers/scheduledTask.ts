/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import {
  BaseScheduledTaskRouter,
  scheduledTaskSchemas,
  shieldedProcedure,
  t,
  getWorkspaceRootPath,
  getProjectRootPath,
} from '@openloaf/api'
import {
  listTasks,
  listTasksByStatus,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  archiveTask,
} from '@/services/taskConfigService'
import {
  listTemplates,
  getTemplate as getTemplateById,
  createTemplate,
  deleteTemplate as deleteTemplateById,
  createTaskFromTemplate,
} from '@/services/taskTemplateService'
import { readRunLogsMultiScope } from '@/services/taskRunLogService'
import { taskScheduler } from '@/services/taskScheduler'
import { taskOrchestrator } from '@/services/taskOrchestrator'
import { taskEventBus } from '@/services/taskEventBus'

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
          if (scope === 'project' && !input.projectId) {
            throw new Error('Project scope requires projectId')
          }
          const rootPath = scope === 'project' && input.projectId
            ? getProjectRootPath(input.projectId, input.workspaceId) ?? workspaceRoot
            : workspaceRoot

          const task = createTask(
            {
              name: input.name,
              description: input.description,
              priority: input.priority,
              agentName: input.agentName,
              enabled: input.enabled ?? true,
              triggerMode: input.triggerMode,
              schedule: input.schedule,
              condition: input.condition,
              payload: input.payload,
              sessionMode: input.sessionMode ?? 'isolated',
              timeoutMs: input.timeoutMs ?? 600000,
              cooldownMs: input.cooldownMs,
              planConfirmTimeoutMs: input.planConfirmTimeoutMs,
              skipPlanConfirm: input.skipPlanConfirm,
              requiresReview: input.requiresReview,
              autoExecute: input.autoExecute,
              parentTaskId: input.parentTaskId,
              dependsOn: input.dependsOn,
              createdBy: input.createdBy,
            },
            rootPath,
            scope,
          )

          // For scheduled tasks, register with scheduler
          if (task.triggerMode === 'scheduled') {
            taskScheduler.registerTask(task)
          }

          // For manual autoExecute tasks, enqueue
          if (task.triggerMode === 'manual' && task.autoExecute) {
            void taskOrchestrator.enqueue(task.id)
          }

          return task
        }),
      update: shieldedProcedure
        .input(scheduledTaskSchemas.update.input)
        .output(scheduledTaskSchemas.update.output)
        .mutation(async ({ input }) => {
          const workspaceRoot = getWorkspaceRootPath()
          const { id, projectId, ...patch } = input
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
          const projectRoot = input.projectId ? getProjectRootPath(input.projectId) : null
          const ok = deleteTask(input.id, workspaceRoot, projectRoot)
          return { ok }
        }),
      run: shieldedProcedure
        .input(scheduledTaskSchemas.run.input)
        .output(scheduledTaskSchemas.run.output)
        .mutation(async ({ input }) => {
          const projectRoot = input.projectId ? getProjectRootPath(input.projectId) : null
          void taskOrchestrator.enqueue(input.id, projectRoot)
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
      // ─── New endpoints ──────────────────────────────────────
      updateStatus: shieldedProcedure
        .input(scheduledTaskSchemas.updateStatus.input)
        .output(scheduledTaskSchemas.updateStatus.output)
        .mutation(async ({ input }) => {
          const workspaceRoot = getWorkspaceRootPath()
          const projectRoot = input.projectId ? getProjectRootPath(input.projectId) : null
          const task = updateTask(input.id, { status: input.status }, workspaceRoot, projectRoot)
          if (!task) throw new Error(`Task not found: ${input.id}`)
          return task
        }),
      resolveReview: shieldedProcedure
        .input(scheduledTaskSchemas.resolveReview.input)
        .output(scheduledTaskSchemas.resolveReview.output)
        .mutation(async ({ input }) => {
          const projectRoot = input.projectId ? getProjectRootPath(input.projectId) : null
          const result = await taskOrchestrator.resolveReview(
            input.id,
            input.action,
            input.reason,
            projectRoot,
          )
          if (!result) throw new Error(`Task not found or not in review: ${input.id}`)
          return result
        }),
      getTaskDetail: shieldedProcedure
        .input(scheduledTaskSchemas.getTaskDetail.input)
        .output(scheduledTaskSchemas.getTaskDetail.output)
        .query(async ({ input }) => {
          const workspaceRoot = getWorkspaceRootPath()
          const projectRoot = input.projectId
            ? getProjectRootPath(input.projectId, input.workspaceId)
            : null
          const task = getTask(input.id, workspaceRoot, projectRoot)
          if (!task) throw new Error(`Task not found: ${input.id}`)
          return task
        }),
      listByStatus: shieldedProcedure
        .input(scheduledTaskSchemas.listByStatus.input)
        .output(scheduledTaskSchemas.listByStatus.output)
        .query(async ({ input }) => {
          const workspaceRoot = getWorkspaceRootPath()
          const projectRoot = input.projectId
            ? getProjectRootPath(input.projectId, input.workspaceId)
            : null
          if (input.status && input.status.length > 0) {
            return listTasksByStatus(input.status, workspaceRoot, projectRoot)
          }
          return listTasks(workspaceRoot, projectRoot)
        }),
      archiveCompleted: shieldedProcedure
        .input(scheduledTaskSchemas.archiveCompleted.input)
        .output(scheduledTaskSchemas.archiveCompleted.output)
        .mutation(async ({ input }) => {
          const workspaceRoot = getWorkspaceRootPath()
          const projectRoot = input.projectId ? getProjectRootPath(input.projectId) : null
          const ok = archiveTask(input.id, workspaceRoot, projectRoot)
          return { ok }
        }),
      // ─── Template endpoints ─────────────────────────────────
      listTemplates: shieldedProcedure
        .input(scheduledTaskSchemas.listTemplates.input)
        .output(scheduledTaskSchemas.listTemplates.output)
        .query(async () => {
          const workspaceRoot = getWorkspaceRootPath()
          return listTemplates(workspaceRoot)
        }),
      getTemplate: shieldedProcedure
        .input(scheduledTaskSchemas.getTemplate.input)
        .output(scheduledTaskSchemas.getTemplate.output)
        .query(async ({ input }) => {
          const workspaceRoot = getWorkspaceRootPath()
          const template = getTemplateById(input.id, workspaceRoot)
          if (!template) throw new Error(`Template not found: ${input.id}`)
          return template
        }),
      createTemplate: shieldedProcedure
        .input(scheduledTaskSchemas.createTemplate.input)
        .output(scheduledTaskSchemas.createTemplate.output)
        .mutation(async ({ input }) => {
          const workspaceRoot = getWorkspaceRootPath()
          return createTemplate(
            {
              name: input.name,
              description: input.description,
              agentName: input.agentName,
              defaultPayload: input.defaultPayload,
              skipPlanConfirm: input.skipPlanConfirm,
              requiresReview: input.requiresReview,
              priority: input.priority,
              tags: input.tags,
              triggerMode: input.triggerMode,
              timeoutMs: input.timeoutMs,
            },
            workspaceRoot,
          )
        }),
      deleteTemplate: shieldedProcedure
        .input(scheduledTaskSchemas.deleteTemplate.input)
        .output(scheduledTaskSchemas.deleteTemplate.output)
        .mutation(async ({ input }) => {
          const workspaceRoot = getWorkspaceRootPath()
          const ok = deleteTemplateById(input.id, workspaceRoot)
          return { ok }
        }),
      createFromTemplate: shieldedProcedure
        .input(scheduledTaskSchemas.createFromTemplate.input)
        .output(scheduledTaskSchemas.createFromTemplate.output)
        .mutation(async ({ input }) => {
          const workspaceRoot = getWorkspaceRootPath()
          const scope = input.scope ?? (input.projectId ? 'project' : 'workspace')
          const rootPath = scope === 'project' && input.projectId
            ? getProjectRootPath(input.projectId, input.workspaceId) ?? workspaceRoot
            : workspaceRoot
          const task = createTaskFromTemplate(
            input.templateId,
            { name: input.name, description: input.description },
            rootPath,
            scope,
          )
          if (!task) throw new Error(`Template not found: ${input.templateId}`)
          return task
        }),
    })
  }
}

export const scheduledTaskRouterImplementation =
  ScheduledTaskRouterImpl.createRouter()
