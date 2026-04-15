/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { generateId, smoothStream, type UIMessage } from 'ai'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ManagedAgent } from '@/ai/services/agentManager'
import type { createSubAgent } from '@/ai/services/agentFactory'
import { buildModelMessages } from '@/ai/shared/messageConverter'
import { resolveApprovalGate, applyApprovalDecision } from '@/ai/tools/approvalUtils'
import { registerFrontendToolPending } from '@/ai/tools/pendingRegistry'
import { appendToAgentHistory } from '@/ai/services/agentHistory'
import { agentRegistry } from '@/ai/services/agentRegistry'
import { resolveSessionDir } from '@openloaf/api/services/chatSessionPaths'
import { readBasicConf } from '@/modules/settings/openloafConfStore'
import { logger } from '@/common/logger'

// ---------------------------------------------------------------------------
// Debug Step File Writer (for sub-agents)
// ---------------------------------------------------------------------------

function makeAttemptTag(): string {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `${hh}${mm}${ss}`
}

async function writeAgentDebugStepFile(input: {
  agentId: string
  assistantMessageId: string
  attemptTag: string
  stepNumber: number
  kind: 'request' | 'response'
  data: unknown
}): Promise<void> {
  try {
    const agentDir = await resolveSessionDir(input.agentId)
    const debugDir = path.join(agentDir, 'debug', `${input.attemptTag}_${input.assistantMessageId}`)
    await fs.mkdir(debugDir, { recursive: true })
    const fileName = `step${input.stepNumber}_${input.kind}.json`
    await fs.writeFile(path.join(debugDir, fileName), JSON.stringify(input.data, null, 2), 'utf-8')
  } catch (err) {
    logger.warn(
      { err, agentId: input.agentId, step: input.stepNumber, kind: input.kind },
      '[agent-debug] failed to write debug step file',
    )
  }
}

// ---------------------------------------------------------------------------
// Stream + Approval Loop
// ---------------------------------------------------------------------------

/** Run a single stream cycle for the agent. */
async function runAgentStream(
  agent: ManagedAgent,
  toolLoopAgent: ReturnType<typeof createSubAgent>,
): Promise<void> {
  const modelMessages = await buildModelMessages(
    agent.messages,
    toolLoopAgent.tools,
  )

  // 逻辑：如果 preface 存在且未注入，作为首条 user 消息注入到消息链。
  // 注意：modelMessages 已由 convertToModelMessages 转换为 ModelMessage 格式，
  // 需使用 `content` 而非 UIMessage 的 `parts`。
  if (agent.preface && !agent.prefaceInjected) {
    modelMessages.unshift({
      role: 'user',
      content: [{ type: 'text', text: agent.preface }],
    } as any)
    agent.prefaceInjected = true
  }

  // AI 调试模式 — 子代理每步 LLM 请求/响应写入 agents/<agentId>/debug/
  const isDebugMode = readBasicConf().chatPrefaceEnabled
  const debugAttemptTag = makeAttemptTag()
  const debugMessageId = agent.messages.length > 0
    ? agent.messages[agent.messages.length - 1]!.id
    : generateId()

  const agentStream = await toolLoopAgent.stream({
    messages: modelMessages as any,
    abortSignal: agent.abortController.signal,
    experimental_transform: smoothStream({
      delayInMs: 10,
      chunking: new Intl.Segmenter('zh', { granularity: 'word' }),
    }),
    ...(isDebugMode ? {
      experimental_onStepStart: (event: any) => {
        void writeAgentDebugStepFile({
          agentId: agent.id,
          assistantMessageId: debugMessageId,
          attemptTag: debugAttemptTag,
          stepNumber: event.stepNumber,
          kind: 'request',
          data: {
            stepNumber: event.stepNumber,
            model: event.model,
            system: event.system,
            messages: event.messages,
            activeTools: event.activeTools,
            toolChoice: event.toolChoice,
          },
        })
      },
      onStepFinish: (event: any) => {
        void writeAgentDebugStepFile({
          agentId: agent.id,
          assistantMessageId: debugMessageId,
          attemptTag: debugAttemptTag,
          stepNumber: event.stepNumber,
          kind: 'response',
          data: {
            stepNumber: event.stepNumber,
            text: event.text,
            toolCalls: event.toolCalls,
            toolResults: event.toolResults,
            finishReason: event.finishReason,
            usage: event.usage,
          },
        })
      },
    } : {}),
  })

  const uiStream = agentStream.toUIMessageStream({
    originalMessages: agent.messages as any[],
    generateMessageId: () => generateId(),
    onFinish: ({ responseMessage }) => {
      const parts = Array.isArray(responseMessage?.parts)
        ? responseMessage.parts
        : []
      agent.responseParts = parts
      // 逻辑：将 assistant 响应追加到对话历史，支持多轮。
      // 过滤空 parts 的消息——validateUIMessages 对 assistant 空 parts 会报 TypeValidationError。
      if (responseMessage && parts.length > 0) {
        agent.messages.push(responseMessage as UIMessage)
        // 逻辑：写入 assistant 消息到 agent 独立 JSONL。
        appendToAgentHistory(agent, responseMessage as UIMessage)
      }
    },
  })

  const writer = agent.spawnContext.writer
  const toolCallId = agent.id
  const reader = uiStream.getReader()

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue

    // 逻辑：刷新 session lastAccess，防止运行中 Agent 被清理（MAST FM-2.1）。
    agentRegistry.touchSession(agent.spawnContext.sessionId)

    const type = (value as any)?.type
    if (type === 'text-delta') {
      const delta = (value as any)?.delta
      if (delta) agent.outputText += String(delta)
      if (writer && delta) {
        writer.write({
          type: 'data-sub-agent-delta',
          data: { toolCallId, delta },
        } as any)
      }
    }
    if (writer) {
      writer.write({
        type: 'data-sub-agent-chunk',
        data: { toolCallId, chunk: value },
      } as any)
    }
  }
}

/**
 * Run a stream cycle with approval gate handling.
 *
 * After each runAgentStream(), checks responseParts for pending approvals.
 * If found, waits for frontend decision, applies it, and re-runs the stream.
 * Loops until no more approvals remain.
 */
export async function runAgentStreamWithApproval(
  id: string,
  agent: ManagedAgent,
  toolLoopAgent: ReturnType<typeof createSubAgent>,
): Promise<void> {
  await runAgentStream(agent, toolLoopAgent)

  let approvalGate = resolveApprovalGate(agent.responseParts)
  while (approvalGate) {
    const approvalWaitTimeoutSec = (() => {
      const t = (approvalGate!.part as { timeoutSec?: unknown }).timeoutSec
      return Number.isFinite(t) ? Math.max(1, Math.floor(Number(t))) : 60
    })()

    logger.info(
      { agentId: id, approvalId: approvalGate.approvalId },
      '[agent-manager] approval requested, waiting for frontend',
    )

    const ack = await registerFrontendToolPending({
      toolCallId: approvalGate.approvalId,
      timeoutSec: approvalWaitTimeoutSec,
    })

    // 逻辑：审批超时/失败优雅降级（MAST FM-3.1 — 过早终止）。
    // 超时视为拒绝而非中止整条链，让 Agent 可以跳过该步骤或用替代方案。
    // 仅在明确失败（非超时）时才抛出终止错误。
    let approved = false
    if (ack.status === 'success') {
      approved = Boolean(
        ack.output &&
          typeof ack.output === 'object' &&
          (ack.output as { approved?: unknown }).approved === true,
      )
    } else if (ack.status === 'timeout') {
      logger.warn(
        { agentId: id, approvalId: approvalGate.approvalId },
        '[agent-manager] approval timed out, treating as rejected',
      )
      approved = false
    } else {
      // status === 'failed' — a hard failure, abort the chain
      throw new Error(ack.errorText || 'agent approval failed')
    }

    applyApprovalDecision({
      parts: agent.responseParts,
      approvalId: approvalGate.approvalId,
      approved,
    })

    // 逻辑：runAgentStream 的 onFinish 已将 assistant 消息 push 到 agent.messages，
    // 且 responseParts 与该消息的 parts 是同一引用，applyApprovalDecision 已原地修改。
    // 只需将更新后的消息持久化，不能再 push 新消息（否则 LLM 收到重复 assistant 消息会产生空响应）。
    const lastMsg = agent.messages[agent.messages.length - 1]
    if (lastMsg && lastMsg.role === 'assistant') {
      await appendToAgentHistory(agent, lastMsg)
    }

    // 重置输出并继续执行
    agent.outputText = ''
    agent.responseParts = []

    await runAgentStream(agent, toolLoopAgent)
    approvalGate = resolveApprovalGate(agent.responseParts)
  }
}
