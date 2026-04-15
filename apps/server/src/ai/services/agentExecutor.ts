/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { generateId, type UIMessage } from 'ai'
import fsPromises from 'node:fs/promises'
import nodePath from 'node:path'
import type { RequestContext } from '@/ai/shared/context/requestContext'
import { runWithContext, getSessionId } from '@/ai/shared/context/requestContext'
import { createSubAgent } from '@/ai/services/agentFactory'
import { writeAgentSessionJson } from '@/ai/services/chat/repositories/messageStore'
import { buildSubAgentPrefaceText } from '@/ai/shared/subAgentPrefaceBuilder'
import { resolveSessionDir } from '@openloaf/api/services/chatSessionPaths'
import { readBasicConf } from '@/modules/settings/openloafConfStore'
import { logger } from '@/common/logger'
import type { AgentManager, ManagedAgent } from '@/ai/services/agentManager'
import { appendToAgentHistory } from '@/ai/services/agentHistory'
import { runAgentStreamWithApproval } from '@/ai/services/agentApprovalLoop'
import {
  extractLastAssistantText,
  lastResponseEndsWithToolCall,
  countToolInvocations,
  resolveSubAgentSkills,
} from '@/ai/services/agentOutputUtils'
import { loadToolApprovalRulesForRequest } from '@/ai/tools/toolApprovalRulesLoader'

// ---------------------------------------------------------------------------
// Execution Scheduling & Core Loop
// ---------------------------------------------------------------------------

/** Schedule an execution, serialized via the agent's executionLock. */
export function scheduleExecution(
  manager: AgentManager,
  id: string,
  subagentType?: string,
): void {
  const agent = manager.getAgent(id)
  if (!agent) return
  agent.executionLock = agent.executionLock
    .then(() => executeAgent(manager, id, subagentType))
    .catch((err) => {
      logger.error({ agentId: id, err }, '[agent-manager] scheduleExecution error')
      const msg = err instanceof Error ? err.message : String(err)
      manager.fail(id, msg)
    })
}

/** Core execution loop for a SubAgent. */
async function executeAgent(
  manager: AgentManager,
  id: string,
  subagentType?: string,
): Promise<void> {
  const agent = manager.getAgent(id)
  if (!agent) return

  const { spawnContext } = agent
  const writer = spawnContext.writer
  const toolCallId = id

  // 创建子 RequestContext，将当前 agent 入栈到 agentStack。
  // 审批规则按子 agent 有效的 projectId 重新加载，保证 rules 与 ctx.projectId
  // 严格对齐（就算父子同项目也只是一次磁盘读取，成本可忽略）。这样将来任何路径
  // 若给子 agent 设了不同 projectId，rules 会自动跟随，不会使用父项目的白名单。
  const childProjectId = spawnContext.requestContext.projectId
  const childToolApprovalRules = await loadToolApprovalRulesForRequest(childProjectId)
  const childRequestContext: RequestContext = {
    ...spawnContext.requestContext,
    toolApprovalRules: childToolApprovalRules,
    agentStack: [
      ...(spawnContext.requestContext.agentStack ?? []),
      {
        kind: 'master' as const,
        name: agent.name,
        agentId: agent.id,
        path: [],
      },
    ],
  }

  await runWithContext(childRequestContext, async () => {
    try {
      const toolLoopAgent = createSubAgent({
        subagentType,
        model: spawnContext.model,
      })

      // 仅首次 spawn 时生成 preface、写入 session.json 和初始 user 消息，恢复场景跳过。
      if (!agent.isResumed) {
        // 逻辑：从 toolLoopAgent 获取实际工具名称列表，用于 preface 能力检测。
        const resolvedToolIds = Object.keys(toolLoopAgent.tools ?? {})
        const historySessionId = spawnContext.sessionId ?? getSessionId()

        // 逻辑：异步生成 preface，不阻塞 agent 启动（失败时降级为无 preface）。
        const agentSkills = resolveSubAgentSkills(agent.name, spawnContext.requestContext)
        try {
          agent.preface = await buildSubAgentPrefaceText({
            agentId: agent.id,
            agentName: agent.name,
            parentSessionId: historySessionId ?? '',
            toolIds: resolvedToolIds,
            requestContext: spawnContext.requestContext,
            skills: agentSkills,
          })
        } catch (err) {
          logger.warn({ agentId: id, err }, '[agent-manager] preface generation failed, continuing without preface')
        }

        if (historySessionId) {
          await writeAgentSessionJson({
            parentSessionId: historySessionId,
            agentId: agent.id,
            name: agent.name,
            task: agent.task,
            agentType: subagentType || 'general-purpose',
            preface: agent.preface,
            createdAt: agent.createdAt,
          }).catch((err) => {
            logger.warn({ agentId: id, err }, '[agent-manager] failed to write agent session.json')
          })
          // 写入初始 user 消息
          if (agent.messages.length > 0) {
            await appendToAgentHistory(agent, agent.messages[0]!)
          }

          // AI 调试模式 — 写入子代理 PROMPT.md（系统 prompt）和 PREFACE.md
          if (readBasicConf().chatPrefaceEnabled) {
            const agentDir = await resolveSessionDir(agent.id)
            const systemPrompt = (toolLoopAgent as any).settings?.instructions ?? (toolLoopAgent as any).instructions ?? ''
            if (systemPrompt) {
              fsPromises.writeFile(
                nodePath.join(agentDir, 'PROMPT.md'),
                typeof systemPrompt === 'string' ? systemPrompt : JSON.stringify(systemPrompt, null, 2),
                'utf-8',
              ).catch((err) => {
                logger.warn({ agentId: id, err }, '[agent-debug] failed to write PROMPT.md')
              })
            }
            if (agent.preface) {
              fsPromises.writeFile(
                nodePath.join(agentDir, 'PREFACE.md'),
                agent.preface,
                'utf-8',
              ).catch((err) => {
                logger.warn({ agentId: id, err }, '[agent-debug] failed to write PREFACE.md')
              })
            }
          }
        }
      }
      agent.isResumed = false

      if (writer) {
        writer.write({
          type: 'data-sub-agent-start',
          data: { toolCallId, name: agent.name, task: agent.task, masterToolUseId: agent.masterToolUseId },
        } as any)
      }

      // 逻辑：执行初始流式推理（含审批门处理）。
      await runAgentStreamWithApproval(id, agent, toolLoopAgent)

      // 逻辑：处理 inputQueue 中的追加输入。
      while (agent.inputQueue.length > 0) {
        const input = agent.inputQueue.shift()!
        const followUpMessage: UIMessage = {
          id: generateId(),
          role: 'user',
          parts: [{ type: 'text', text: input.message }],
        }
        agent.messages.push(followUpMessage)
        await appendToAgentHistory(agent, followUpMessage)
        await runAgentStreamWithApproval(id, agent, toolLoopAgent)
      }

      // 逻辑：子 agent 完整历史已保存在 agents/<agentId>.jsonl，不再写入 messages.jsonl。

      // 逻辑：验证子 Agent 输出有效性（MAST FM-3.2 — 不完整验证）。
      // 空输出且无工具结果时：首次自动重试一次，仍失败则标记为 failed。
      const hasOutput = agent.outputText.trim().length > 0
      const hasToolResults = agent.responseParts.some(
        (p: any) =>
          p?.type === 'tool-invocation' && p?.state === 'output-available',
      )
      if (!hasOutput && !hasToolResults) {
        if (!agent.retried) {
          agent.retried = true
          logger.warn({ agentId: id }, '[agent-manager] empty output, retrying once')
          const retryMessage: UIMessage = {
            id: generateId(),
            role: 'user',
            parts: [{ type: 'text', text:
              '你的上一次回复为空。请重新审视任务，使用可用工具执行操作，并提供明确的输出结果。' }],
          }
          agent.messages.push(retryMessage)
          await appendToAgentHistory(agent, retryMessage)
          await runAgentStreamWithApproval(id, agent, toolLoopAgent)
        }
        // Re-check after retry
        const retryHasOutput = agent.outputText.trim().length > 0
        const retryHasToolResults = agent.responseParts.some(
          (p: any) => p?.type === 'tool-invocation' && p?.state === 'output-available',
        )
        if (!retryHasOutput && !retryHasToolResults) {
          manager.fail(
            id,
            'Agent completed without producing any output or tool results after retry.',
          )
          return
        }
      }

      // 逻辑：补偿总结 — 如果最后一步是 tool call（无尾部文字），追加一轮强制总结。
      if (lastResponseEndsWithToolCall(agent.responseParts)) {
        logger.info({ agentId: id }, '[agent-manager] last response ends with tool call, requesting summary')
        const summaryMessage: UIMessage = {
          id: generateId(),
          role: 'user',
          parts: [{ type: 'text', text:
            '你已完成所有工具调用。现在请输出一段简明的总结文本，概括你的发现和结论。不要再调用任何工具。' }],
        }
        agent.messages.push(summaryMessage)
        await appendToAgentHistory(agent, summaryMessage)
        await runAgentStreamWithApproval(id, agent, toolLoopAgent)
      }

      // 统计 tool use count
      agent.toolUseCount = countToolInvocations(agent.messages)

      // 提取最后一条 assistant 消息的文字作为 finalOutput
      agent.finalOutput = extractLastAssistantText(agent.messages) || agent.outputText

      if (writer) {
        writer.write({
          type: 'data-sub-agent-end',
          data: { toolCallId, output: agent.finalOutput },
        } as any)
      }

      manager.complete(id, agent.finalOutput)
    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'SubAgent failed'
      logger.error({ agentId: id, err }, '[agent-manager] agent execution failed')

      if (writer) {
        writer.write({
          type: 'data-sub-agent-error',
          data: { toolCallId, errorText },
        } as any)
      }

      manager.fail(id, errorText)
    }
  })
}
