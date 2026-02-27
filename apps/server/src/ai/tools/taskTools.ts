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
import { getWorkspaceRootPath } from '@openloaf/api'
import {
  createTaskToolDef,
  taskStatusToolDef,
} from '@openloaf/api/types/tools/task'
import {
  createTask,
  getTask,
  listTasksByStatus,
  type TaskConfig,
} from '@/services/taskConfigService'
import { taskOrchestrator } from '@/services/taskOrchestrator'
import { taskScheduler } from '@/services/taskScheduler'

export const createTaskTool = tool({
  description: createTaskToolDef.description,
  inputSchema: zodSchema(createTaskToolDef.parameters),
  execute: async ({
    actionName: _actionName,
    title,
    description,
    priority,
    schedule,
    skipPlanConfirm,
    agentName,
  }) => {
    const workspaceRoot = getWorkspaceRootPath()

    // 有 schedule → 定时任务，无 schedule → 一次性任务
    const isScheduled = !!schedule

    // 校验 schedule 子字段
    if (schedule) {
      if (schedule.type === 'once' && !schedule.scheduleAt) {
        return JSON.stringify({
          ok: false,
          error: 'schedule.type 为 "once" 时必须提供 scheduleAt（ISO 8601 时间字符串）',
        })
      }
      if (schedule.type === 'interval') {
        if (!schedule.intervalMs || schedule.intervalMs <= 0) {
          return JSON.stringify({
            ok: false,
            error: 'schedule.type 为 "interval" 时必须提供正整数 intervalMs',
          })
        }
        if (schedule.intervalMs < 60000) {
          return JSON.stringify({
            ok: false,
            error: 'intervalMs 最小值为 60000（1 分钟），请勿设置过于频繁的间隔',
          })
        }
      }
      if (schedule.type === 'cron' && !schedule.cronExpr) {
        return JSON.stringify({
          ok: false,
          error: 'schedule.type 为 "cron" 时必须提供 cronExpr（5 段 cron 表达式）',
        })
      }
      if (schedule.type === 'once' && schedule.scheduleAt) {
        const target = new Date(schedule.scheduleAt).getTime()
        if (target <= Date.now()) {
          return JSON.stringify({
            ok: false,
            error: 'scheduleAt 指定的时间已过，请设置一个未来的时间',
          })
        }
      }
    }

    const task = createTask(
      {
        name: title,
        description,
        priority: priority ?? 'medium',
        triggerMode: isScheduled ? 'scheduled' : 'manual',
        schedule: isScheduled ? schedule : undefined,
        autoExecute: !isScheduled,
        skipPlanConfirm: isScheduled ? true : (skipPlanConfirm ?? false),
        agentName,
        createdBy: 'agent',
      },
      workspaceRoot,
      'workspace',
    )

    // 定时任务注册到调度器，一次性任务入队立即执行
    if (isScheduled) {
      taskScheduler.registerTask(task)
    } else {
      void taskOrchestrator.enqueue(task.id)
    }

    // 构建用户友好的消息
    let message: string
    if (isScheduled) {
      const scheduleDesc = formatScheduleDescription(schedule!)
      message = `定时任务 "${task.name}" 已创建。${scheduleDesc}。任务 ID: ${task.id}`
    } else {
      message = `任务 "${task.name}" 已创建并开始执行。任务 ID: ${task.id}`
    }

    return JSON.stringify({
      ok: true,
      task: {
        id: task.id,
        name: task.name,
        status: task.status,
        priority: task.priority,
        triggerMode: task.triggerMode,
      },
      message,
    })
  },
})

export const taskStatusTool = tool({
  description: taskStatusToolDef.description,
  inputSchema: zodSchema(taskStatusToolDef.parameters),
  execute: async ({ actionName: _actionName, taskId }) => {
    const workspaceRoot = getWorkspaceRootPath()

    if (taskId) {
      const task = getTask(taskId, workspaceRoot)
      if (!task) {
        return JSON.stringify({ ok: false, error: `任务 ${taskId} 不存在` })
      }
      return JSON.stringify({
        ok: true,
        task: formatTaskSummary(task),
      })
    }

    // Return all active tasks
    const activeTasks = listTasksByStatus(
      ['todo', 'running', 'review'],
      workspaceRoot,
    )

    return JSON.stringify({
      ok: true,
      activeTasks: activeTasks.map(formatTaskSummary),
      total: activeTasks.length,
    })
  },
})

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
