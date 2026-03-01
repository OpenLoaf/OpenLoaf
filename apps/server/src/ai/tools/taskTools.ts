/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { tool, zodSchema } from 'ai'
import {
  taskManageToolDef,
  taskStatusToolDef,
} from '@openloaf/api/types/tools/task'
import {
  createTask,
  deleteTask,
  archiveTask,
  getTask,
  listTasks,
  listTasksByStatus,
  type TaskConfig,
} from '@/services/taskConfigService'
import { taskOrchestrator } from '@/services/taskOrchestrator'
import { taskScheduler } from '@/services/taskScheduler'
import { resolveToolRoots } from '@/ai/tools/toolScope'

// ─── Status Protection Constants ──────────────────────────────────────

/** Statuses that allow deletion. */
const DELETE_ALLOWED: ReadonlySet<string> = new Set(['done', 'cancelled'])
/** Statuses that allow cancellation. */
const CANCEL_ALLOWED: ReadonlySet<string> = new Set(['todo', 'running', 'review'])

function rejectMsg(action: string, taskId: string, currentStatus: string, allowed: string): string {
  return JSON.stringify({
    ok: false,
    error: `无法对状态为 "${currentStatus}" 的任务 ${taskId} 执行 ${action}。允许的状态：${allowed}。`,
  })
}

function errMsg(msg: string): string {
  return JSON.stringify({ ok: false, error: msg })
}

function okMsg(message: string, extra?: Record<string, unknown>): string {
  return JSON.stringify({ ok: true, message, ...extra })
}

// ─── Task Manage Tool ─────────────────────────────────────────────────

export const taskManageTool = tool({
  description: taskManageToolDef.description,
  inputSchema: zodSchema(taskManageToolDef.parameters),
  execute: async (input) => {
    const { workspaceRoot, projectRoot } = resolveToolRoots()
    const scope = projectRoot ? 'project' : 'workspace'
    const rootPath = projectRoot ?? workspaceRoot
    const action = input.action

    switch (action) {
      // ── create ──────────────────────────────────────────────────
      case 'create': {
        if (!input.title) return errMsg('create 操作必须提供 title 参数')

        const schedule = input.schedule
        const isScheduled = !!schedule

        // 校验 schedule 子字段
        if (schedule) {
          if (schedule.type === 'once' && !schedule.scheduleAt) {
            return errMsg('schedule.type 为 "once" 时必须提供 scheduleAt（ISO 8601 时间字符串）')
          }
          if (schedule.type === 'interval') {
            if (!schedule.intervalMs || schedule.intervalMs <= 0) {
              return errMsg('schedule.type 为 "interval" 时必须提供正整数 intervalMs')
            }
            if (schedule.intervalMs < 60000) {
              return errMsg('intervalMs 最小值为 60000（1 分钟），请勿设置过于频繁的间隔')
            }
          }
          if (schedule.type === 'cron' && !schedule.cronExpr) {
            return errMsg('schedule.type 为 "cron" 时必须提供 cronExpr（5 段 cron 表达式）')
          }
          if (schedule.type === 'once' && schedule.scheduleAt) {
            const target = new Date(schedule.scheduleAt).getTime()
            if (target <= Date.now()) {
              return errMsg('scheduleAt 指定的时间已过，请设置一个未来的时间')
            }
          }
        }

        const task = createTask(
          {
            name: input.title,
            description: input.description,
            priority: input.priority ?? 'medium',
            triggerMode: isScheduled ? 'scheduled' : 'manual',
            schedule: isScheduled ? schedule : undefined,
            autoExecute: !isScheduled,
            skipPlanConfirm: isScheduled ? true : (input.skipPlanConfirm ?? false),
            agentName: input.agentName,
            createdBy: 'agent',
          },
          rootPath,
          scope,
        )

        if (isScheduled) {
          taskScheduler.registerTask(task)
        } else {
          void taskOrchestrator.enqueue(task.id, projectRoot)
        }

        let message: string
        if (isScheduled) {
          const scheduleDesc = formatScheduleDescription(schedule!)
          message = `定时任务 "${task.name}" 已创建。${scheduleDesc}。任务 ID: ${task.id}`
        } else {
          message = `任务 "${task.name}" 已创建并开始执行。任务 ID: ${task.id}`
        }

        return okMsg(message, {
          task: {
            id: task.id,
            name: task.name,
            status: task.status,
            priority: task.priority,
            triggerMode: task.triggerMode,
          },
        })
      }

      // ── cancel ──────────────────────────────────────────────────
      case 'cancel': {
        if (!input.taskId) return errMsg('cancel 操作必须提供 taskId 参数')

        const task = getTask(input.taskId, workspaceRoot, projectRoot)
        if (!task) return errMsg(`任务 ${input.taskId} 不存在`)
        if (!CANCEL_ALLOWED.has(task.status)) {
          return rejectMsg('cancel', input.taskId, task.status, 'todo, running, review')
        }

        await taskOrchestrator.cancel(input.taskId, projectRoot)
        return okMsg(`任务 "${task.name}" 已取消。`, { taskId: input.taskId })
      }

      // ── delete ──────────────────────────────────────────────────
      case 'delete': {
        if (!input.taskId) return errMsg('delete 操作必须提供 taskId 参数')

        const task = getTask(input.taskId, workspaceRoot, projectRoot)
        if (!task) return errMsg(`任务 ${input.taskId} 不存在`)
        if (!DELETE_ALLOWED.has(task.status)) {
          return rejectMsg('delete', input.taskId, task.status, 'done, cancelled（活跃任务请先 cancel）')
        }

        deleteTask(input.taskId, workspaceRoot, projectRoot)
        return okMsg(`任务 "${task.name}" 已删除。`, { taskId: input.taskId })
      }

      // ── run ─────────────────────────────────────────────────────
      case 'run': {
        if (!input.taskId) return errMsg('run 操作必须提供 taskId 参数')

        const task = getTask(input.taskId, workspaceRoot, projectRoot)
        if (!task) return errMsg(`任务 ${input.taskId} 不存在`)
        if (task.status !== 'todo') {
          return rejectMsg('run', input.taskId, task.status, 'todo')
        }

        await taskOrchestrator.enqueue(input.taskId, projectRoot)
        return okMsg(`任务 "${task.name}" 已开始执行。`, { taskId: input.taskId })
      }

      // ── resolve ─────────────────────────────────────────────────
      case 'resolve': {
        if (!input.taskId) return errMsg('resolve 操作必须提供 taskId 参数')
        if (!input.resolveAction) return errMsg('resolve 操作必须提供 resolveAction 参数（approve/reject/rework）')

        const task = getTask(input.taskId, workspaceRoot, projectRoot)
        if (!task) return errMsg(`任务 ${input.taskId} 不存在`)
        if (task.status !== 'review') {
          return rejectMsg('resolve', input.taskId, task.status, 'review')
        }

        const result = await taskOrchestrator.resolveReview(
          input.taskId,
          input.resolveAction,
          input.reason,
          projectRoot,
        )
        if (!result) return errMsg(`审批任务 ${input.taskId} 失败`)

        return okMsg(
          `任务 "${result.name}" 审批完成，动作: ${input.resolveAction}，当前状态: ${result.status}。`,
          { taskId: input.taskId, resolveAction: input.resolveAction, newStatus: result.status },
        )
      }

      // ── archive ─────────────────────────────────────────────────
      case 'archive': {
        if (!input.taskId) return errMsg('archive 操作必须提供 taskId 参数')

        const task = getTask(input.taskId, workspaceRoot, projectRoot)
        if (!task) return errMsg(`任务 ${input.taskId} 不存在`)
        if (task.status !== 'done') {
          return rejectMsg('archive', input.taskId, task.status, 'done')
        }

        archiveTask(input.taskId, workspaceRoot, projectRoot)
        return okMsg(`任务 "${task.name}" 已归档。`, { taskId: input.taskId })
      }

      // ── cancelAll ───────────────────────────────────────────────
      case 'cancelAll': {
        const activeTasks = listTasksByStatus(
          ['todo', 'running', 'review'],
          workspaceRoot,
          projectRoot,
        )

        if (activeTasks.length === 0) {
          return okMsg('没有活跃任务需要取消。', { cancelled: 0 })
        }

        let cancelled = 0
        for (const task of activeTasks) {
          try {
            await taskOrchestrator.cancel(task.id, projectRoot)
            cancelled++
          } catch {
            // skip individual failures
          }
        }

        return okMsg(`已取消 ${cancelled} 个活跃任务。`, { cancelled, total: activeTasks.length })
      }

      // ── deleteAll ───────────────────────────────────────────────
      case 'deleteAll': {
        // 安全规则：无论 LLM 传什么 statusFilter，都强制 intersect ['done', 'cancelled']
        const safeStatuses: Array<'done' | 'cancelled'> = ['done', 'cancelled']
        const terminatedTasks = listTasksByStatus(safeStatuses, workspaceRoot, projectRoot)

        if (terminatedTasks.length === 0) {
          return okMsg('没有已终结的任务（done/cancelled）可删除。', { deleted: 0 })
        }

        let deleted = 0
        for (const task of terminatedTasks) {
          try {
            deleteTask(task.id, workspaceRoot, projectRoot)
            deleted++
          } catch {
            // skip individual failures
          }
        }

        return okMsg(`已删除 ${deleted} 个已终结任务。活跃任务未受影响。`, { deleted, total: terminatedTasks.length })
      }

      // ── archiveAll ──────────────────────────────────────────────
      case 'archiveAll': {
        const doneTasks = listTasksByStatus(['done'], workspaceRoot, projectRoot)

        if (doneTasks.length === 0) {
          return okMsg('没有已完成的任务需要归档。', { archived: 0 })
        }

        let archived = 0
        for (const task of doneTasks) {
          try {
            archiveTask(task.id, workspaceRoot, projectRoot)
            archived++
          } catch {
            // skip individual failures
          }
        }

        return okMsg(`已归档 ${archived} 个已完成任务。`, { archived, total: doneTasks.length })
      }

      default:
        return errMsg(`未知的 action: ${action}`)
    }
  },
})

// ─── Task Status Tool ─────────────────────────────────────────────────

export const taskStatusTool = tool({
  description: taskStatusToolDef.description,
  inputSchema: zodSchema(taskStatusToolDef.parameters),
  execute: async ({ actionName: _actionName, taskId }) => {
    const { workspaceRoot, projectRoot } = resolveToolRoots()

    if (taskId) {
      const task = getTask(taskId, workspaceRoot, projectRoot)
      if (!task) {
        return JSON.stringify({ ok: false, error: `任务 ${taskId} 不存在` })
      }
      return JSON.stringify({
        ok: true,
        task: formatTaskSummary(task),
      })
    }

    const activeTasks = listTasksByStatus(
      ['todo', 'running', 'review'],
      workspaceRoot,
      projectRoot,
    )

    return JSON.stringify({
      ok: true,
      activeTasks: activeTasks.map(formatTaskSummary),
      total: activeTasks.length,
    })
  },
})

// ─── Backward Compatibility ───────────────────────────────────────────

/** @deprecated 使用 taskManageTool 替代 */
export const createTaskTool = taskManageTool

// ─── Helpers ──────────────────────────────────────────────────────────

function formatTaskSummary(task: TaskConfig) {
  return {
    id: task.id,
    name: task.name,
    status: task.status,
    reviewType: task.reviewType,
    priority: task.priority,
    triggerMode: task.triggerMode,
    agentName: task.agentName,
    executionSummary: task.executionSummary,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}

function formatScheduleDescription(schedule: {
  type: string
  scheduleAt?: string
  intervalMs?: number
  cronExpr?: string
}): string {
  switch (schedule.type) {
    case 'once':
      return `将在 ${schedule.scheduleAt} 执行一次`
    case 'interval': {
      const ms = schedule.intervalMs!
      if (ms >= 3600000) return `每 ${Math.round(ms / 3600000)} 小时执行一次`
      if (ms >= 60000) return `每 ${Math.round(ms / 60000)} 分钟执行一次`
      return `每 ${Math.round(ms / 1000)} 秒执行一次`
    }
    case 'cron':
      return `按 cron 表达式 "${schedule.cronExpr}" 周期执行`
    default:
      return ''
  }
}
