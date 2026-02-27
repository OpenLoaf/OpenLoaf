/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { tool } from 'ai'
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

export const createTaskTool = tool({
  description: createTaskToolDef.description,
  parameters: createTaskToolDef.parameters,
  execute: async ({
    actionName: _actionName,
    title,
    description,
    priority,
    autoExecute,
    skipPlanConfirm,
    agentName,
  }) => {
    const workspaceRoot = getWorkspaceRootPath()

    const task = createTask(
      {
        name: title,
        description,
        priority: priority ?? 'medium',
        triggerMode: 'manual',
        autoExecute: autoExecute ?? true,
        skipPlanConfirm: skipPlanConfirm ?? false,
        agentName,
        createdBy: 'agent',
      },
      workspaceRoot,
      'workspace',
    )

    // If autoExecute, enqueue for orchestrator
    if (task.autoExecute) {
      void taskOrchestrator.enqueue(task.id)
    }

    return JSON.stringify({
      ok: true,
      task: {
        id: task.id,
        name: task.name,
        status: task.status,
        priority: task.priority,
        autoExecute: task.autoExecute,
      },
      message: task.autoExecute
        ? `任务 "${task.name}" 已创建并开始执行。任务 ID: ${task.id}`
        : `任务 "${task.name}" 已创建，等待手动启动。任务 ID: ${task.id}`,
    })
  },
})

export const taskStatusTool = tool({
  description: taskStatusToolDef.description,
  parameters: taskStatusToolDef.parameters,
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
    agentName: task.agentName,
    executionSummary: task.executionSummary,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }
}
