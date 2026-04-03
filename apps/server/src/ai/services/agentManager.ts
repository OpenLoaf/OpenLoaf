/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { generateId, smoothStream, type UIMessage, type UIMessageStreamWriter } from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import {
  type RequestContext,
  runWithContext,
  getSessionId,
  getAssistantParentMessageId,
} from '@/ai/shared/context/requestContext'
import {
  createSubAgent,
  resolveEffectiveAgentName,
} from '@/ai/services/agentFactory'
import { buildModelMessages } from '@/ai/shared/messageConverter'
import {
  registerAgentDir,
  loadMessageTree,
  readSessionJson,
} from '@/ai/services/chat/repositories/chatFileStore'
import {
  saveAgentMessage,
  writeAgentSessionJson,
} from '@/ai/services/chat/repositories/messageStore'
import { buildSubAgentPrefaceText } from '@/ai/shared/subAgentPrefaceBuilder'
import { resolveAgentDir, readAgentJson } from '@/ai/shared/defaultAgentResolver'
import { isBuiltinSubAgentType } from '@/ai/services/agentFactory'
import {
  getProjectRootPath,
} from '@openloaf/api/services/vfsService'
import { logger } from '@/common/logger'
import { resolveApprovalGate, applyApprovalDecision } from '@/ai/tools/approvalUtils'
import { registerFrontendToolPending } from '@/ai/tools/pendingRegistry'

export type AgentStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'shutdown'
  | 'not_found'

export type SpawnContext = {
  model: LanguageModelV3
  writer?: UIMessageStreamWriter<any>
  sessionId?: string
  parentMessageId?: string | null
  requestContext: RequestContext
}

export type ManagedAgent = {
  id: string
  status: AgentStatus
  name: string
  task: string
  result: unknown | null
  error: string | null
  createdAt: Date
  /** Listeners notified on status change. */
  statusListeners: Set<(status: AgentStatus) => void>
  /** Abort controller for cancellation. */
  abortController: AbortController
  /** Spawn context for execution. */
  spawnContext: SpawnContext
  /** Sub-agent conversation history. */
  messages: UIMessage[]
  /** Pending input queue for follow-up messages. */
  inputQueue: Array<{ message: string; submissionId: string }>
  /** Serialized execution lock — ensures only one executeAgent runs at a time. */
  executionLock: Promise<void>
  /** Accumulated output text. */
  outputText: string
  /** Response parts from last stream. */
  responseParts: unknown[]
  /** Spawn depth (sub-agents cannot spawn further). */
  depth: number
  /** True when restored from JSONL — skips initial history writes in executeAgent. */
  isResumed?: boolean
  /** Sub-agent preface text (injected as first user message). */
  preface?: string
  /** Whether preface has been injected into the message chain. */
  prefaceInjected?: boolean
  /** Whether an empty-output retry has been attempted. */
  retried?: boolean
  /** AI SDK tool call id (for frontend mapping during "calling" state). */
  masterToolUseId?: string
  /** Final output text extracted from the last assistant message. */
  finalOutput?: string
  /** Total tool invocation count across all steps. */
  toolUseCount: number
  /** Execution start time (for duration tracking). */
  startedAt?: number
}

const MAX_DEPTH = 2
const MAX_CONCURRENT = 4

// ---------------------------------------------------------------------------
// 输出提取辅助函数
// ---------------------------------------------------------------------------

/**
 * Extract the final summary text from the last assistant message.
 *
 * AI SDK's ToolLoopAgent merges all steps into a single assistant message,
 * so the parts array contains interleaved text (transition phrases) and
 * tool-invocations. We only want the **last text part** — that's the
 * model's final summary after all tool calls are done.
 */
function extractLastAssistantText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg?.role !== 'assistant') continue
    const parts = Array.isArray((msg as any).parts) ? (msg as any).parts : []
    // Walk backwards to find the last text part (the final summary)
    for (let j = parts.length - 1; j >= 0; j--) {
      const p = parts[j]
      if (p?.type === 'text' && typeof p.text === 'string' && p.text.trim().length > 0) {
        return p.text
      }
    }
  }
  return ''
}

/** Check if the last response ended on a tool call (no trailing text). */
function lastResponseEndsWithToolCall(responseParts: unknown[]): boolean {
  if (responseParts.length === 0) return false
  // Find the last non-empty part
  for (let i = responseParts.length - 1; i >= 0; i--) {
    const part = responseParts[i] as any
    if (!part || typeof part !== 'object') continue
    const type = typeof part.type === 'string' ? part.type : ''
    // If the last meaningful part is a tool invocation, there's no trailing summary
    if (type === 'tool-invocation' || type.startsWith('tool-')) return true
    if (type === 'text') return false
    // tool-name present = tool part
    if (typeof part.toolName === 'string') return true
  }
  return false
}

/** Count tool invocations across all assistant messages. */
function countToolInvocations(messages: UIMessage[]): number {
  let count = 0
  for (const msg of messages) {
    if (msg?.role !== 'assistant') continue
    const parts = Array.isArray((msg as any).parts) ? (msg as any).parts : []
    for (const p of parts) {
      const type = typeof (p as any)?.type === 'string' ? (p as any).type : ''
      if (type === 'tool-invocation' || type.startsWith('tool-') || typeof (p as any)?.toolName === 'string') {
        count++
      }
    }
  }
  return count
}

/** Resolve skills from a SubAgent's config (empty = no skills). */
function resolveSubAgentSkills(
  agentName: string,
  requestContext: RequestContext,
): string[] {
  const effectiveName = resolveEffectiveAgentName(agentName)
  // 内置行为类型（general-purpose/explore/plan）不加载 skills
  if (isBuiltinSubAgentType(effectiveName)) return []

  const roots: string[] = []
  if (requestContext.projectId) {
    const projectRoot = getProjectRootPath(requestContext.projectId)
    if (projectRoot) roots.push(projectRoot)
  }

  for (const rootPath of roots) {
    const descriptor = readAgentJson(resolveAgentDir(rootPath, effectiveName))
    if (!descriptor) continue
    return Array.isArray(descriptor.skills) ? descriptor.skills : []
  }
  return []
}

/**
 * 清理从 JSONL 恢复的消息中残留的 approval-requested 状态。
 *
 * 如果最后一条 assistant 消息包含未决审批的 tool part，LLM 不知如何继续，
 * 会返回空响应。此函数将这些 part 标记为已拒绝，并追加系统提示让 LLM 继续。
 */
function sanitizeRestoredMessages(messages: UIMessage[]): UIMessage[] {
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

/**
 * AgentManager — manages SubAgent lifecycle with real execution.
 *
 * Each SubAgent runs in an independent async context via runWithContext.
 * Status changes are observable via listeners or the wait() method.
 */
class AgentManager {
  private agents = new Map<string, ManagedAgent>()

  /** Count currently running agents. */
  private get runningCount(): number {
    let count = 0
    for (const agent of this.agents.values()) {
      if (agent.status === 'running') count++
    }
    return count
  }

  /** Check if any agents are currently running. */
  hasRunningAgents(): boolean {
    return this.runningCount > 0
  }

  /** Spawn a new SubAgent and return its id immediately. */
  spawn(input: {
    task: string
    name: string
    subagentType?: string
    context: SpawnContext
    depth?: number
    masterToolUseId?: string
  }): string {
    const depth = input.depth ?? 0
    if (depth >= MAX_DEPTH) {
      throw new Error(
        `Max agent spawn depth (${MAX_DEPTH}) reached. Cannot spawn more agents.`,
      )
    }
    if (this.runningCount >= MAX_CONCURRENT) {
      throw new Error(
        `Max concurrent agents (${MAX_CONCURRENT}) reached. Wait for existing agents to complete.`,
      )
    }

    const id = `agent_${generateId()}`

    const initialMessage: UIMessage = {
      id: generateId(),
      role: 'user',
      parts: [{ type: 'text', text: input.task }],
    }

    const agent: ManagedAgent = {
      id,
      status: 'pending',
      name: input.name || input.subagentType || 'general-purpose',
      task: input.task,
      result: null,
      error: null,
      createdAt: new Date(),
      statusListeners: new Set(),
      abortController: new AbortController(),
      spawnContext: input.context,
      messages: [initialMessage],
      inputQueue: [],
      executionLock: Promise.resolve(),
      outputText: '',
      responseParts: [],
      depth,
      isResumed: false,
      masterToolUseId: input.masterToolUseId,
      toolUseCount: 0,
      startedAt: Date.now(),
    }
    this.agents.set(id, agent)

    logger.info({ agentId: id, name: agent.name, task: input.task }, '[agent-manager] spawned')
    this.setStatus(id, 'running')

    // fire-and-forget 执行，不阻塞 master agent
    this.scheduleExecution(id, input.subagentType)

    return id
  }

  /** Schedule an execution, serialized via the agent's executionLock. */
  private scheduleExecution(
    id: string,
    subagentType?: string,
  ): void {
    const agent = this.agents.get(id)
    if (!agent) return
    agent.executionLock = agent.executionLock
      .then(() => this.executeAgent(id, subagentType))
      .catch((err) => {
        logger.error({ agentId: id, err }, '[agent-manager] scheduleExecution error')
        const msg = err instanceof Error ? err.message : String(err)
        this.fail(id, msg)
      })
  }

  /** Append a UIMessage to the agent's independent history (new format: agents/<agentId>/messages.jsonl). */
  private async appendToAgentHistory(
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

  /** Core execution loop for a SubAgent. */
  private async executeAgent(
    id: string,
    subagentType?: string,
  ): Promise<void> {
    const agent = this.agents.get(id)
    if (!agent) return

    const { spawnContext } = agent
    const writer = spawnContext.writer
    const toolCallId = id

    // 创建子 RequestContext，将当前 agent 入栈到 agentStack。
    const childRequestContext: RequestContext = {
      ...spawnContext.requestContext,
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
              await this.appendToAgentHistory(agent, agent.messages[0]!)
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
        await this.runAgentStreamWithApproval(id, agent, toolLoopAgent)

        // 逻辑：处理 inputQueue 中的追加输入。
        while (agent.inputQueue.length > 0) {
          const input = agent.inputQueue.shift()!
          const followUpMessage: UIMessage = {
            id: generateId(),
            role: 'user',
            parts: [{ type: 'text', text: input.message }],
          }
          agent.messages.push(followUpMessage)
          await this.appendToAgentHistory(agent, followUpMessage)
          await this.runAgentStreamWithApproval(id, agent, toolLoopAgent)
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
            await this.appendToAgentHistory(agent, retryMessage)
            await this.runAgentStreamWithApproval(id, agent, toolLoopAgent)
          }
          // Re-check after retry
          const retryHasOutput = agent.outputText.trim().length > 0
          const retryHasToolResults = agent.responseParts.some(
            (p: any) => p?.type === 'tool-invocation' && p?.state === 'output-available',
          )
          if (!retryHasOutput && !retryHasToolResults) {
            this.fail(
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
          await this.appendToAgentHistory(agent, summaryMessage)
          await this.runAgentStreamWithApproval(id, agent, toolLoopAgent)
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

        this.complete(id, agent.finalOutput)
      } catch (err) {
        const errorText = err instanceof Error ? err.message : 'SubAgent failed'
        logger.error({ agentId: id, err }, '[agent-manager] agent execution failed')

        if (writer) {
          writer.write({
            type: 'data-sub-agent-error',
            data: { toolCallId, errorText },
          } as any)
        }

        this.fail(id, errorText)
      }
    })
  }

  /** Run a single stream cycle for the agent. */
  private async runAgentStream(
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

    const agentStream = await toolLoopAgent.stream({
      messages: modelMessages as any,
      abortSignal: agent.abortController.signal,
      experimental_transform: smoothStream({
        delayInMs: 10,
        chunking: new Intl.Segmenter('zh', { granularity: 'word' }),
      }),
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
          this.appendToAgentHistory(agent, responseMessage as UIMessage)
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
  private async runAgentStreamWithApproval(
    id: string,
    agent: ManagedAgent,
    toolLoopAgent: ReturnType<typeof createSubAgent>,
  ): Promise<void> {
    await this.runAgentStream(agent, toolLoopAgent)

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
        await this.appendToAgentHistory(agent, lastMsg)
      }

      // 重置输出并继续执行
      agent.outputText = ''
      agent.responseParts = []

      await this.runAgentStream(agent, toolLoopAgent)
      approvalGate = resolveApprovalGate(agent.responseParts)
    }
  }

  /** Send input/message to an existing agent. Auto-recovers from JSONL if not in memory. */
  async sendInput(
    id: string,
    message?: string,
    interrupt?: boolean,
    context?: SpawnContext,
  ): Promise<string> {
    let agent = this.agents.get(id)

    // 逻辑：agent 不在内存中 → 尝试从 JSONL 恢复。
    if (!agent) {
      const sessionId = context?.sessionId ?? getSessionId()
      if (sessionId && context) {
        const status = await this.resume(id, context)
        if (status === 'running') {
          agent = this.agents.get(id)
        }
      }
      if (!agent) throw new Error(`Agent ${id} not found.`)
    }

    if (agent.status === 'shutdown') {
      // 逻辑：shutdown 状态的 agent 自动恢复。
      if (context) {
        agent.abortController = new AbortController()
        agent.spawnContext = context
        agent.isResumed = true
        this.setStatus(id, 'running')
        this.scheduleExecution(id, agent.name)
      } else {
        throw new Error(`Agent ${id} is shut down.`)
      }
    }

    if (interrupt) {
      agent.abortController.abort()
      agent.abortController = new AbortController()
      logger.info({ agentId: id }, '[agent-manager] interrupted')
    }

    const submissionId = `sub_${generateId()}`

    if (message) {
      agent.inputQueue.push({ message, submissionId })
    }

    // 逻辑：如果 agent 已完成/失败，重新触发执行。
    if (
      message &&
      (agent.status === 'completed' || agent.status === 'failed')
    ) {
      this.setStatus(id, 'running')
      this.scheduleExecution(id, agent.name)
    }

    logger.info(
      { agentId: id, submissionId, hasMessage: Boolean(message) },
      '[agent-manager] input sent',
    )
    return submissionId
  }

  /** Wait for ANY agent to reach a terminal state (Codex semantics). */
  async wait(
    ids: string[],
    timeoutMs = 300000,
    abortSignal?: AbortSignal,
  ): Promise<{
    completedId: string | null
    status: Record<string, AgentStatus>
    timedOut: boolean
  }> {
    const isTerminal = (s: AgentStatus) =>
      s === 'completed' || s === 'failed' || s === 'shutdown' || s === 'not_found'

    // 逻辑：先同步检查是否有已完成的 agent。
    const buildSnapshot = (): {
      completedId: string | null
      status: Record<string, AgentStatus>
    } => {
      const status: Record<string, AgentStatus> = {}
      let completedId: string | null = null
      for (const id of ids) {
        const agent = this.agents.get(id)
        const s = agent?.status ?? 'not_found'
        status[id] = s
        if (completedId === null && isTerminal(s)) {
          completedId = id
        }
      }
      return { completedId, status }
    }

    // 检查 abort signal 是否已触发
    if (abortSignal?.aborted) {
      for (const id of ids) this.abort(id)
      const final = buildSnapshot()
      return { ...final, timedOut: false }
    }

    const snap = buildSnapshot()
    if (snap.completedId !== null) {
      return { ...snap, timedOut: false }
    }

    // 逻辑：异步等待任一 agent 到达终态，或被 abort。
    let timedOut = false
    await Promise.race([
      new Promise<void>((resolve) => {
        const cleanup: Array<() => void> = []
        const onDone = () => {
          for (const fn of cleanup) fn()
          resolve()
        }
        for (const id of ids) {
          const agent = this.agents.get(id)
          if (!agent || isTerminal(agent.status)) {
            onDone()
            return
          }
          const listener = (s: AgentStatus) => {
            if (isTerminal(s)) onDone()
          }
          agent.statusListeners.add(listener)
          cleanup.push(() => agent.statusListeners.delete(listener))
        }
        // 监听 abort signal — 终止所有等待的子 agent
        if (abortSignal) {
          const onAbort = () => {
            for (const id of ids) this.abort(id)
            onDone()
          }
          abortSignal.addEventListener('abort', onAbort, { once: true })
          cleanup.push(() => abortSignal.removeEventListener('abort', onAbort))
        }
      }),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          timedOut = true
          resolve()
        }, timeoutMs)
      }),
    ])

    const final = buildSnapshot()
    return { ...final, timedOut }
  }

  /** Abort (terminate) an agent and return its output. */
  abort(id: string): { status: AgentStatus; output: string } {
    const agent = this.agents.get(id)
    if (!agent) return { status: 'not_found', output: '' }
    if (agent.status === 'running' || agent.status === 'pending') {
      agent.abortController.abort()
    }
    const output = agent.outputText || ''
    this.setStatus(id, 'shutdown')
    // 逻辑：abort 后立即从 Map 中删除，释放内存和并发槽位。
    this.agents.delete(id)
    logger.info({ agentId: id }, '[agent-manager] aborted')
    return { status: 'shutdown', output }
  }

  /** Resume a shut-down agent, or recover from JSONL if not in memory. */
  async resume(id: string, context?: SpawnContext): Promise<AgentStatus> {
    const agent = this.agents.get(id)

    // 逻辑：内存中有 → 直接重新激活。
    if (agent) {
      if (agent.status !== 'shutdown') {
        return agent.status
      }
      agent.abortController = new AbortController()
      if (context) agent.spawnContext = context
      this.setStatus(id, 'running')
      this.scheduleExecution(id, agent.name)
      logger.info({ agentId: id }, '[agent-manager] resumed from memory')
      return 'running'
    }

    // 逻辑：内存中没有 → 从文件恢复。
    if (!context?.sessionId) return 'not_found'

    try {
      await registerAgentDir(context.sessionId, id)
      const tree = await loadMessageTree(id)
      if (tree.byId.size === 0) return 'not_found'

      // 从 tree 构建 restoredMessages（按 createdAt 排序）
      const sorted = Array.from(tree.byId.values()).sort((a, b) => {
        const ta = new Date(a.createdAt).getTime()
        const tb = new Date(b.createdAt).getTime()
        return ta - tb || a.id.localeCompare(b.id)
      })
      let restoredMessages: UIMessage[] = sorted.map((m) => ({
        id: m.id,
        role: m.role as UIMessage['role'],
        parts: (Array.isArray(m.parts) ? m.parts : []) as UIMessage['parts'],
      }))

      // 读取 session.json 获取 meta
      const sessionJson = await readSessionJson(id)
      const meta = sessionJson ? {
        name: sessionJson.title,
        task: (sessionJson as any).task,
        agentType: (sessionJson as any).agentType,
        preface: (sessionJson as any).sessionPreface ?? undefined,
        createdAt: sessionJson.createdAt,
      } : { name: 'default', task: '', agentType: undefined, preface: undefined, createdAt: undefined }

      // 逻辑：清理残留的 approval-requested 状态，避免 LLM 返回空响应。
      const sanitizedMessages = sanitizeRestoredMessages(restoredMessages)

      const restored: ManagedAgent = {
        id,
        status: 'pending',
        name: (meta.name as string) || 'default',
        task: (meta.task as string) || '',
        result: null,
        error: null,
        createdAt: meta.createdAt ? new Date(meta.createdAt as string) : new Date(),
        statusListeners: new Set(),
        abortController: new AbortController(),
        spawnContext: context,
        messages: sanitizedMessages,
        inputQueue: [],
        executionLock: Promise.resolve(),
        outputText: '',
        responseParts: [],
        depth: 0,
        isResumed: true,
        // 逻辑：从 session.json 恢复 preface，标记为已注入（恢复的消息链中已包含 preface 效果）。
        preface: (meta.preface as string) || undefined,
        prefaceInjected: Boolean(meta.preface),
        toolUseCount: 0,
        startedAt: Date.now(),
      }
      this.agents.set(id, restored)
      this.setStatus(id, 'running')
      this.scheduleExecution(id, (meta.agentType as string) || restored.name)
      logger.info({ agentId: id }, '[agent-manager] resumed from JSONL')
      return 'running'
    } catch (err) {
      logger.error({ agentId: id, err }, '[agent-manager] JSONL resume failed')
      return 'not_found'
    }
  }

  /** Get current status of an agent. */
  getStatus(id: string): AgentStatus {
    return this.agents.get(id)?.status ?? 'not_found'
  }

  /** Get agent by id. */
  getAgent(id: string): ManagedAgent | undefined {
    return this.agents.get(id)
  }

  /** Mark an agent as completed with a result. */
  complete(id: string, result: unknown): void {
    const agent = this.agents.get(id)
    if (!agent) return
    agent.result = result
    this.setStatus(id, 'completed')
    this.scheduleAutoCleanup(id)
  }

  /** Mark an agent as failed with an error. */
  fail(id: string, error: string): void {
    const agent = this.agents.get(id)
    if (!agent) return
    agent.error = error
    this.setStatus(id, 'failed')
    this.scheduleAutoCleanup(id)
  }

  /** Auto-cleanup: remove agent from Map after 5 minutes. */
  private scheduleAutoCleanup(id: string): void {
    setTimeout(() => {
      const agent = this.agents.get(id)
      if (agent && (agent.status === 'completed' || agent.status === 'failed')) {
        this.agents.delete(id)
        logger.info({ agentId: id }, '[agent-manager] auto-cleaned')
      }
    }, 5 * 60 * 1000)
  }

  /** Shut down all agents in this manager. */
  shutdownAll(): void {
    for (const [id, agent] of this.agents) {
      if (agent.status === 'running' || agent.status === 'pending') {
        agent.abortController.abort()
      }
      this.setStatus(id, 'shutdown')
    }
    this.agents.clear()
    logger.info('[agent-manager] shutdownAll')
  }

  /** Internal: update status and notify listeners. */
  private setStatus(id: string, status: AgentStatus): void {
    const agent = this.agents.get(id)
    if (!agent) return
    agent.status = status
    for (const listener of agent.statusListeners) {
      try {
        listener(status)
      } catch {
        // ignore listener errors
      }
    }
  }
}

/**
 * AgentManagerRegistry — 按 sessionId 分发 AgentManager 实例。
 *
 * 每个 session 拥有独立的 AgentManager，避免不同 session 的 agent 混在一起。
 * 启动 5 分钟定时器，清理 30 分钟无访问的 session manager。
 */
class AgentManagerRegistry {
  private managers = new Map<string, { manager: AgentManager; lastAccess: number }>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    // 逻辑：每 5 分钟清理 30 分钟无访问的 session manager。
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      const staleThreshold = 30 * 60 * 1000
      for (const [sessionId, entry] of this.managers) {
        if (now - entry.lastAccess > staleThreshold) {
          // 逻辑：清理前检查是否有 running 状态的 Agent，若有则跳过（MAST FM-2.1）。
          if (entry.manager.hasRunningAgents()) {
            entry.lastAccess = now // 刷新时间戳，防止下轮再检查
            logger.info({ sessionId }, '[agent-registry] session has running agents, skipping cleanup')
            continue
          }
          entry.manager.shutdownAll()
          this.managers.delete(sessionId)
          logger.info({ sessionId }, '[agent-registry] stale session cleaned')
        }
      }
    }, 5 * 60 * 1000)
    // 逻辑：不阻止进程退出。
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref()
    }
  }

  /** Get or create an AgentManager for the given sessionId. */
  get(sessionId: string): AgentManager {
    let entry = this.managers.get(sessionId)
    if (!entry) {
      entry = { manager: new AgentManager(), lastAccess: Date.now() }
      this.managers.set(sessionId, entry)
    } else {
      entry.lastAccess = Date.now()
    }
    return entry.manager
  }

  /** Refresh lastAccess for a session without creating it. */
  touchSession(sessionId?: string): void {
    if (!sessionId) return
    const entry = this.managers.get(sessionId)
    if (entry) {
      entry.lastAccess = Date.now()
    }
  }

  /** Shut down and remove a session's manager. */
  remove(sessionId: string): void {
    const entry = this.managers.get(sessionId)
    if (entry) {
      entry.manager.shutdownAll()
      this.managers.delete(sessionId)
    }
  }
}

/** Global agent manager registry (session-isolated). */
const agentRegistry = new AgentManagerRegistry()

/**
 * Convenience: get the AgentManager for the current session.
 * Falls back to a shared 'global' manager if no sessionId is available.
 */
export function getAgentManager(): AgentManager {
  const sessionId = getSessionId() || '__global__'
  return agentRegistry.get(sessionId)
}

/** @deprecated Use getAgentManager() instead. Kept for backward compatibility. */
export const agentManager = {
  get spawn() { return getAgentManager().spawn.bind(getAgentManager()) },
  get sendInput() { return getAgentManager().sendInput.bind(getAgentManager()) },
  get wait() { return getAgentManager().wait.bind(getAgentManager()) },
  get abort() { return getAgentManager().abort.bind(getAgentManager()) },
  get getStatus() { return getAgentManager().getStatus.bind(getAgentManager()) },
  get getAgent() { return getAgentManager().getAgent.bind(getAgentManager()) },
  get complete() { return getAgentManager().complete.bind(getAgentManager()) },
  get fail() { return getAgentManager().fail.bind(getAgentManager()) },
  get shutdownAll() { return getAgentManager().shutdownAll.bind(getAgentManager()) },
}
