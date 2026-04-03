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
import { getSessionId } from '@/ai/shared/context/requestContext'
import { saveAgentMessage } from '@/ai/services/chat/repositories/messageStore'
import { logger } from '@/common/logger'
import type { ManagedAgent } from '@/ai/services/agentManager'

// ---------------------------------------------------------------------------
// 持久化：追加消息到 Agent 历史
// ---------------------------------------------------------------------------

/** Append a UIMessage to the agent's independent history (agents/<agentId>/messages.jsonl). */
export async function appendToAgentHistory(
  agent: ManagedAgent,
  message: UIMessage,
): Promise<void> {
  const sessionId =
    agent.spawnContext.sessionId ?? getSessionId()
  if (!sessionId) return
  // 跳过空 assistant 消息
  const parts = Array.isArray(message.parts) ? message.parts : []
  if (message.role !== 'user' && parts.length === 0) return
  try {
    // 逻辑：parentMessageId 指向 agent 对话中的上一条消息，构建线性链。
    const prevMessages = agent.messages.filter((m) => m.id !== message.id)
    const parentMessageId = prevMessages.length > 0
      ? prevMessages[prevMessages.length - 1]!.id
      : null
    await saveAgentMessage({
      parentSessionId: sessionId,
      agentId: agent.id,
      message: { id: message.id, role: message.role, parts: parts as any },
      parentMessageId,
      createdAt: new Date(),
    })
  } catch (err) {
    logger.warn({ agentId: agent.id, err }, '[agent-manager] failed to append agent history')
  }
}

// ---------------------------------------------------------------------------
// 恢复：清理从 JSONL 恢复的消息
// ---------------------------------------------------------------------------

/**
 * 清理从 JSONL 恢复的消息中残留的 approval-requested 状态。
 *
 * 如果最后一条 assistant 消息包含未决审批的 tool part，LLM 不知如何继续，
 * 会返回空响应。此函数将这些 part 标记为已拒绝，并追加系统提示让 LLM 继续。
 */
export function sanitizeRestoredMessages(messages: UIMessage[]): UIMessage[] {
  if (messages.length === 0) return messages

  const lastIdx = messages.length - 1
  const last = messages[lastIdx]!
  if (last.role !== 'assistant' || !Array.isArray(last.parts)) return messages

  let hasPendingApproval = false
  const sanitizedParts = last.parts.map((part: any) => {
    // 检测未决审批：有 approval.id 但 approved 既非 true 也非 false
    if (
      part.type === 'tool-invocation' &&
      part.approval?.id &&
      part.approval?.approved !== true &&
      part.approval?.approved !== false
    ) {
      hasPendingApproval = true
      return {
        ...part,
        state: 'output-denied',
        approval: { ...part.approval, approved: false },
        output: part.output ?? '[Cancelled: session restarted before approval]',
      }
    }
    return part
  })

  if (!hasPendingApproval) return messages

  const result = [...messages]
  result[lastIdx] = { ...last, parts: sanitizedParts }
  // 追加系统提示，让 LLM 知道之前的工具被取消了
  result.push({
    id: generateId(),
    role: 'user',
    parts: [
      {
        type: 'text',
        text: '[System] Previous tool execution was cancelled due to session restart. Please continue with the task.',
      },
    ],
  })
  return result
}
