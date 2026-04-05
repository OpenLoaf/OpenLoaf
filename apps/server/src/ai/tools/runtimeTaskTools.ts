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
  taskCreateToolDef,
  taskUpdateToolDef,
  taskReadToolDef,
  type TaskCreateArgs,
  type TaskUpdateArgs,
  type TaskReadArgs,
} from '@openloaf/api/types/tools/runtimeTask'
import {
  getSessionId,
  isMasterAgent,
} from '@/ai/shared/context/requestContext'
import {
  createRuntimeTask,
  updateRuntimeTask,
  getRuntimeTask,
  listRuntimeTasks,
} from '@/ai/services/chat/runtimeTaskService'

type ToolOutput<T> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; message?: string }

const MASTER_ONLY_ERROR =
  "Runtime Task tools are restricted to the Master Agent. Sub-Agents should focus on executing their assigned task — progress is tracked automatically via the Agent tool's taskId parameter."

// ---------------------------------------------------------------------------
// TaskCreate
// ---------------------------------------------------------------------------

export const taskCreateTool = tool({
  description: taskCreateToolDef.description,
  inputSchema: zodSchema(taskCreateToolDef.parameters),
  execute: async (
    input: TaskCreateArgs,
  ): Promise<ToolOutput<{ id: string; subject: string; status: string }>> => {
    if (!isMasterAgent()) {
      return { ok: false, error: MASTER_ONLY_ERROR }
    }
    const sessionId = getSessionId()
    if (!sessionId) {
      return { ok: false, error: 'No active session' }
    }
    const result = await createRuntimeTask(sessionId, {
      subject: input.subject,
      description: input.description,
      blockedBy: input.blockedBy,
    })
    if (!result.ok) {
      return { ok: false, error: result.error }
    }
    const task = result.task
    const hasBlockers = task.blockedBy.length > 0
    const hint = hasBlockers
      ? `Task #${task.id} created and waiting on tasks: [${task.blockedBy.join(', ')}]. It will be ready once those complete.`
      : `Task #${task.id} created. Call TaskUpdate with status='in_progress' when you start working on it.`
    return {
      ok: true,
      data: { id: task.id, subject: task.subject, status: task.status },
      message: hint,
    }
  },
})

// ---------------------------------------------------------------------------
// TaskUpdate
// ---------------------------------------------------------------------------

export const taskUpdateTool = tool({
  description: taskUpdateToolDef.description,
  inputSchema: zodSchema(taskUpdateToolDef.parameters),
  execute: async (
    input: TaskUpdateArgs,
  ): Promise<
    ToolOutput<{ id: string; status: string; unlockedTasks: string[] }>
  > => {
    if (!isMasterAgent()) {
      return { ok: false, error: MASTER_ONLY_ERROR }
    }
    const sessionId = getSessionId()
    if (!sessionId) {
      return { ok: false, error: 'No active session' }
    }
    const result = await updateRuntimeTask(sessionId, input.taskId, {
      subject: input.subject,
      description: input.description,
      activeForm: input.activeForm,
      status: input.status,
      addBlockedBy: input.addBlockedBy,
      metadata: input.metadata,
    })
    if (!result.ok) {
      return { ok: false, error: result.error }
    }
    const { task, unlockedTasks } = result
    // Force-prompt AI about unlocked downstream tasks.
    let message: string
    if (input.status === 'deleted') {
      message = `Task ${task.id} deleted.`
    } else if (unlockedTasks.length > 0) {
      message = `Task ${task.id} updated. The following tasks are now ready to execute: [${unlockedTasks.join(
        ', ',
      )}]. Handle them in your next step.`
    } else if (task.status === 'completed') {
      message = `Task ${task.id} completed. No downstream tasks unlocked.`
    } else if (task.status === 'failed') {
      message = `Task ${task.id} marked as failed${
        task.failReason ? ` (${task.failReason})` : ''
      }. Downstream tasks (if any) have been cascaded to failed.`
    } else {
      message = `Task ${task.id} updated (status=${task.status}).`
    }
    return {
      ok: true,
      data: { id: task.id, status: input.status === 'deleted' ? 'deleted' : task.status, unlockedTasks },
      message,
    }
  },
})

// ---------------------------------------------------------------------------
// TaskRead
// ---------------------------------------------------------------------------

type TaskReadOutput =
  | {
      kind: 'single'
      task: {
        id: string
        subject: string
        description?: string
        status: string
        activeForm?: string
        owner?: { agentId: string; name: string; displayName?: string }
        blocks: string[]
        blockedBy: string[]
        failReason?: string
      } | null
    }
  | {
      kind: 'list'
      tasks: Array<{
        id: string
        subject: string
        status: string
        activeForm?: string
        owner?: { agentId: string; name: string; displayName?: string }
        blockedBy: string[]
      }>
      total: number
    }

export const taskReadTool = tool({
  description: taskReadToolDef.description,
  inputSchema: zodSchema(taskReadToolDef.parameters),
  execute: async (input: TaskReadArgs): Promise<ToolOutput<TaskReadOutput>> => {
    if (!isMasterAgent()) {
      return { ok: false, error: MASTER_ONLY_ERROR }
    }
    const sessionId = getSessionId()
    if (!sessionId) {
      return { ok: false, error: 'No active session' }
    }
    if (input.taskId) {
      const task = await getRuntimeTask(sessionId, input.taskId)
      if (!task) {
        return {
          ok: true,
          data: { kind: 'single', task: null },
          message: `Task ${input.taskId} not found`,
        }
      }
      return {
        ok: true,
        data: {
          kind: 'single',
          task: {
            id: task.id,
            subject: task.subject,
            description: task.description,
            status: task.status,
            activeForm: task.activeForm,
            owner: task.owner,
            blocks: task.blocks,
            blockedBy: task.blockedBy,
            failReason: task.failReason,
          },
        },
      }
    }
    const { tasks, total } = await listRuntimeTasks(sessionId, {
      statusFilter: input.statusFilter,
      includeAborted: input.includeAborted,
      limit: input.limit,
      offset: input.offset,
    })
    return {
      ok: true,
      data: {
        kind: 'list',
        tasks: tasks.map((t) => {
          const activeFormField = t.activeForm
          const truncatedActiveForm = activeFormField
            ? activeFormField.length > 100
              ? `${activeFormField.slice(0, 100)}…`
              : activeFormField
            : undefined
          return {
            id: t.id,
            subject: t.subject,
            status: t.status,
            activeForm: truncatedActiveForm,
            owner: t.owner,
            blockedBy: t.blockedBy,
          }
        }),
        total,
      },
    }
  },
})

