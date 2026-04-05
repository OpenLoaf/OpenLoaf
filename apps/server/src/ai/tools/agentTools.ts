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
  agentToolDef,
  sendMessageToolDef,
} from '@openloaf/api/types/tools/agent'
import { getAgentManager, type SpawnContext } from '@/ai/services/agentManager'
import {
  getChatModel,
  getUiWriter,
  getSessionId,
  getAssistantParentMessageId,
  getRequestContext,
} from '@/ai/shared/context/requestContext'
import { resolveEffectiveAgentName } from '@/ai/services/agentFactory'
import {
  getRuntimeTask,
  updateRuntimeTask,
} from '@/ai/services/chat/runtimeTaskService'
import { logger } from '@/common/logger'

/** Build XML task-notification result for agent tool output. */
function buildAgentResultXml(input: {
  agentId: string
  status: string
  summary: string | null
  error: string | null
  toolUseCount: number
  durationMs: number
}): string {
  const lines = [
    '<task-notification>',
    `<task-id>${input.agentId}</task-id>`,
    `<status>${input.status}</status>`,
  ]
  if (input.summary) {
    lines.push(`<summary>${input.summary}</summary>`)
  }
  if (input.error) {
    lines.push(`<error>${input.error}</error>`)
  }
  if (input.toolUseCount > 0 || input.durationMs > 0) {
    lines.push('<usage>')
    lines.push(`<tool_uses>${input.toolUseCount}</tool_uses>`)
    lines.push(`<duration_ms>${input.durationMs}</duration_ms>`)
    lines.push('</usage>')
  }
  lines.push('</task-notification>')
  return lines.join('\n')
}

/** Launch a SubAgent (sync by default, async with run_in_background). */
export const agentTool = tool({
  description: agentToolDef.description,
  inputSchema: zodSchema(agentToolDef.parameters),
  inputExamples: [
    {
      input: {
        description: '分析代码库结构',
        prompt: '分析 src/utils 目录下的所有 TypeScript 文件，总结主要的工具函数及其用途。',
        subagent_type: 'explore',
      },
    },
    {
      input: {
        description: '设计重构方案',
        prompt: '阅读 src/components/Dashboard.tsx 及其依赖文件，设计组件拆分的重构方案。',
        subagent_type: 'plan',
      },
    },
  ],
  execute: async (
    {
      description: _desc,
      prompt,
      subagent_type,
      model: _modelOverride,
      run_in_background,
      task_id,
    },
    { toolCallId: masterToolUseId, abortSignal },
  ): Promise<string> => {
    const requestContext = getRequestContext()
    if (!requestContext) throw new Error('request context is not available.')

    const model = getChatModel()
    if (!model) throw new Error('chat model is not available.')

    const sessionId = getSessionId()
    const effectiveName = resolveEffectiveAgentName(subagent_type)

    // 禁止 spawn master agent 作为子 agent
    if (effectiveName === 'master') {
      throw new Error('Cannot spawn master agent as a SubAgent.')
    }

    // 禁止 agent 创建和自己同类型的子 agent
    const stack = requestContext.agentStack ?? []
    if (stack.length > 0 && subagent_type) {
      const parentName = resolveEffectiveAgentName(stack[stack.length - 1]!.name)
      if (parentName === effectiveName) {
        throw new Error(
          `Agent "${subagent_type}" cannot spawn a SubAgent of the same type. Try a different approach or use available tools directly.`,
        )
      }
    }

    // Validate runtime task_id if provided.
    let runtimeTaskValidated = false
    if (task_id && sessionId) {
      const task = await getRuntimeTask(sessionId, task_id)
      if (!task) {
        throw new Error(`Runtime Task ${task_id} not found. Use TaskRead to list available tasks.`)
      }
      if (task.status === 'completed' || task.status === 'failed') {
        throw new Error(`Runtime Task ${task_id} is already ${task.status} and cannot be assigned.`)
      }
      runtimeTaskValidated = true
    }

    // Child context: clear runtimeTaskId so sub-sub-agents don't inherit parent's task association.
    // The sub-agent itself doesn't need runtimeTaskId in context (it's tracked via owner.agentId).
    const childRequestContext = { ...requestContext, runtimeTaskId: undefined }
    const context: SpawnContext = {
      model,
      writer: getUiWriter(),
      sessionId,
      parentMessageId: getAssistantParentMessageId() ?? null,
      requestContext: childRequestContext,
    }

    // Derive current depth from agentStack
    const currentDepth = requestContext.agentStack?.length ?? 0

    const manager = getAgentManager()
    const agentId = manager.spawn({
      task: prompt,
      name: effectiveName,
      subagentType: subagent_type,
      context,
      depth: currentDepth,
      masterToolUseId,
    })

    // Link the runtime task to the newly spawned sub-agent.
    if (runtimeTaskValidated && task_id && sessionId) {
      const displayName = deriveDisplayName(effectiveName, subagent_type)
      await updateRuntimeTask(sessionId, task_id, {
        status: 'in_progress',
        activeForm: `由 ${displayName} 执行中`,
        owner: { agentId, name: effectiveName, displayName },
      }).catch((err) => {
        logger.warn({ err, task_id, agentId }, '[runtime-task] failed to link task to sub-agent')
      })
    }

    // Sync mode (default): wait for agent to complete (abort-aware)
    if (run_in_background !== true) {
      const result = await manager.wait([agentId], 300_000, abortSignal)
      const agent = manager.getAgent(agentId)
      const status = result.status[agentId] ?? 'unknown'

      // Auto-transition task based on sub-agent outcome.
      if (runtimeTaskValidated && task_id && sessionId) {
        await transitionTaskForAgentOutcome(sessionId, task_id, status, agent?.error)
      }

      return buildAgentResultXml({
        agentId,
        status,
        summary: agent?.finalOutput || agent?.outputText || null,
        error: agent?.error || null,
        toolUseCount: agent?.toolUseCount ?? 0,
        durationMs: agent?.startedAt ? Date.now() - agent.startedAt : 0,
      })
    }

    // Async mode: attach status listener to auto-update task when agent finishes.
    if (runtimeTaskValidated && task_id && sessionId) {
      const agent = manager.getAgent(agentId)
      if (agent) {
        agent.statusListeners.add((newStatus) => {
          if (newStatus === 'pending' || newStatus === 'running') return
          // Terminal status reached; update task.
          const liveAgent = manager.getAgent(agentId)
          void transitionTaskForAgentOutcome(
            sessionId,
            task_id,
            newStatus,
            liveAgent?.error,
          ).catch((err) => {
            logger.warn({ err, task_id }, '[runtime-task] async task update failed')
          })
        })
      }
    }

    return buildAgentResultXml({
      agentId,
      status: 'async_launched',
      summary: null,
      error: null,
      toolUseCount: 0,
      durationMs: 0,
    })
  },
})

/** Derive a user-friendly displayName for an agent type. */
function deriveDisplayName(effectiveName: string, subagentType: string | undefined): string {
  const map: Record<string, string> = {
    'general-purpose': '通用助手',
    explore: '探索助手',
    plan: '规划助手',
    'doc-editor': '文档助手',
    browser: '浏览器助手',
  }
  return map[effectiveName] ?? subagentType ?? effectiveName
}

/** Transition a runtime task based on sub-agent terminal status. */
async function transitionTaskForAgentOutcome(
  sessionId: string,
  taskId: string,
  agentStatus: string,
  agentError: string | null | undefined,
): Promise<void> {
  if (agentStatus === 'completed' || agentStatus === 'finished') {
    await updateRuntimeTask(sessionId, taskId, { status: 'completed' })
    return
  }
  if (agentStatus === 'shutdown' || agentStatus === 'aborted' || agentStatus === 'cancelled') {
    await updateRuntimeTask(sessionId, taskId, {
      status: 'failed',
      failReason: 'abortedByUser',
    })
    return
  }
  if (agentStatus === 'timeout' || agentStatus === 'timed_out') {
    await updateRuntimeTask(sessionId, taskId, {
      status: 'failed',
      failReason: 'timeout',
    })
    return
  }
  // failed, error, unknown, etc.
  await updateRuntimeTask(sessionId, taskId, {
    status: 'failed',
    failReason: 'agentFailed',
    description: agentError ? `Sub-agent error: ${agentError}` : undefined,
  })
}

/** Send a message to an existing SubAgent (auto-recovers stopped agents). */
export const sendMessageTool = tool({
  description: sendMessageToolDef.description,
  inputSchema: zodSchema(sendMessageToolDef.parameters),
  execute: async ({ to, message }): Promise<string> => {
    const model = getChatModel()
    const requestContext = getRequestContext()

    // 构建 SpawnContext 供恢复使用
    const context: SpawnContext | undefined =
      model && requestContext
        ? {
            model,
            writer: getUiWriter(),
            sessionId: getSessionId(),
            parentMessageId: getAssistantParentMessageId() ?? null,
            requestContext,
          }
        : undefined

    const submissionId = await getAgentManager().sendInput(to, message, false, context)
    return JSON.stringify({ submission_id: submissionId })
  },
})
