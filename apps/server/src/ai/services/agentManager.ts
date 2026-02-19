import { generateId, type UIMessage, type UIMessageStreamWriter } from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import {
  type RequestContext,
  runWithContext,
  getSessionId,
  getAssistantParentMessageId,
} from '@/ai/shared/context/requestContext'
import {
  resolveAgentType,
  createSubAgent,
} from '@/ai/agents/subagent/subAgentFactory'
import { buildModelMessages } from '@/ai/shared/messageConverter'
import { saveMessage } from '@/ai/services/chat/repositories/messageStore'
import { appendAgentJsonlLine } from '@/ai/services/chat/repositories/chatFileStore'
import { logger } from '@/common/logger'

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
  /** Accumulated output text. */
  outputText: string
  /** Response parts from last stream. */
  responseParts: unknown[]
  /** Spawn depth (sub-agents cannot spawn further). */
  depth: number
}

const MAX_DEPTH = 1
const MAX_CONCURRENT = 4

/**
 * AgentManager — manages sub-agent lifecycle with real execution.
 *
 * Each sub-agent runs in an independent async context via runWithContext.
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

  /** Spawn a new sub-agent and return its id immediately. */
  spawn(input: {
    task: string
    name: string
    agentType?: string
    context: SpawnContext
    depth?: number
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
      name: input.name || input.agentType || 'default',
      task: input.task,
      result: null,
      error: null,
      createdAt: new Date(),
      statusListeners: new Set(),
      abortController: new AbortController(),
      spawnContext: input.context,
      messages: [initialMessage],
      inputQueue: [],
      outputText: '',
      responseParts: [],
      depth,
    }
    this.agents.set(id, agent)

    logger.info({ agentId: id, name: agent.name, task: input.task }, '[agent-manager] spawned')
    this.setStatus(id, 'running')

    // 逻辑：fire-and-forget 执行，不阻塞 master agent。
    this.executeAgent(id, input.agentType).catch((err) => {
      logger.error({ agentId: id, err }, '[agent-manager] executeAgent unhandled error')
    })

    return id
  }

  /** Append a UIMessage to the agent's independent JSONL history. */
  private async appendToAgentHistory(
    agent: ManagedAgent,
    message: UIMessage,
  ): Promise<void> {
    const sessionId =
      agent.spawnContext.sessionId ?? getSessionId()
    if (!sessionId) return
    try {
      await appendAgentJsonlLine(sessionId, agent.id, {
        id: message.id,
        role: message.role,
        parts: message.parts,
        createdAt: new Date().toISOString(),
      })
    } catch (err) {
      logger.warn({ agentId: agent.id, err }, '[agent-manager] failed to append agent history')
    }
  }

  /** Core execution loop for a sub-agent. */
  private async executeAgent(id: string, rawAgentType?: string): Promise<void> {
    const agent = this.agents.get(id)
    if (!agent) return

    const { spawnContext } = agent
    const agentType = resolveAgentType(rawAgentType)
    const writer = spawnContext.writer
    const toolCallId = id

    await runWithContext(spawnContext.requestContext, async () => {
      try {
        // 逻辑：写入 agent-meta 头行和初始 user 消息到独立 JSONL。
        const historySessionId = spawnContext.sessionId ?? getSessionId()
        if (historySessionId) {
          await appendAgentJsonlLine(historySessionId, agent.id, {
            type: 'agent-meta',
            agentId: agent.id,
            name: agent.name,
            task: agent.task,
            createdAt: agent.createdAt.toISOString(),
            agentType: agentType,
          }).catch((err) => {
            logger.warn({ agentId: id, err }, '[agent-manager] failed to write agent-meta')
          })
          // 写入初始 user 消息
          if (agent.messages.length > 0) {
            await this.appendToAgentHistory(agent, agent.messages[0]!)
          }
        }

        if (writer) {
          writer.write({
            type: 'data-sub-agent-start',
            data: { toolCallId, name: agent.name, task: agent.task },
          } as any)
        }

        const toolLoopAgent = createSubAgent({
          agentType,
          model: spawnContext.model,
        })

        // 逻辑：执行初始流式推理。
        await this.runAgentStream(agent, toolLoopAgent)

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
          await this.runAgentStream(agent, toolLoopAgent)
        }

        // 逻辑：持久化子 agent 摘要到主 session（完整历史已在 agents/ 下）。
        const sessionId = spawnContext.sessionId ?? getSessionId()
        if (sessionId) {
          // 逻辑：只保留最后一条 text 作为子 agent 输出摘要，完整历史在 agents/<agentId>.jsonl 中。
          const lastText = [...agent.responseParts]
            .reverse()
            .find((p: any) => p?.type === 'text' && p?.text)
          const finalParts = lastText
            ? [lastText]
            : agent.outputText
              ? [{ type: 'text', text: agent.outputText }]
              : []
          await saveMessage({
            sessionId,
            message: {
              id: `subagent:${id}`,
              role: 'subagent' as any,
              parts: finalParts,
              metadata: {
                agentId: id,
                name: agent.name,
                task: agent.task,
              },
            } as any,
            parentMessageId: spawnContext.parentMessageId ?? null,
            createdAt: agent.createdAt,
            allowEmpty: true,
          })
        }

        if (writer) {
          writer.write({
            type: 'data-sub-agent-end',
            data: { toolCallId, output: agent.outputText },
          } as any)
        }

        this.complete(id, agent.outputText || agent.responseParts)
      } catch (err) {
        const errorText = err instanceof Error ? err.message : 'sub-agent failed'
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
    const agentStream = await toolLoopAgent.stream({
      messages: modelMessages as any,
      abortSignal: agent.abortController.signal,
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
        if (responseMessage) {
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

  /** Send input/message to an existing agent. */
  sendInput(
    id: string,
    message?: string,
    interrupt?: boolean,
  ): string {
    const agent = this.agents.get(id)
    if (!agent) throw new Error(`Agent ${id} not found.`)
    if (agent.status === 'shutdown') {
      throw new Error(`Agent ${id} is shut down. Use resume-agent first.`)
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
      this.executeAgent(id, agent.name).catch((err) => {
        logger.error({ agentId: id, err }, '[agent-manager] re-executeAgent error')
      })
    }

    logger.info(
      { agentId: id, submissionId, hasMessage: Boolean(message) },
      '[agent-manager] input sent',
    )
    return submissionId
  }

  /** Wait for one or more agents to reach a terminal state. */
  async wait(
    ids: string[],
    timeoutMs = 30000,
  ): Promise<{ status: Record<string, AgentStatus>; timedOut: boolean }> {
    const result: Record<string, AgentStatus> = {}
    let timedOut = false

    const isTerminal = (s: AgentStatus) =>
      s === 'completed' || s === 'failed' || s === 'shutdown' || s === 'not_found'

    const allDone = () =>
      ids.every((id) => {
        const agent = this.agents.get(id)
        const status = agent?.status ?? 'not_found'
        result[id] = status
        return isTerminal(status)
      })

    if (allDone()) return { status: result, timedOut: false }

    await Promise.race([
      new Promise<void>((resolve) => {
        const check = () => {
          if (allDone()) {
            resolve()
            return
          }
          for (const id of ids) {
            const agent = this.agents.get(id)
            if (!agent || isTerminal(agent.status)) continue
            const listener = () => {
              agent.statusListeners.delete(listener)
              if (allDone()) resolve()
            }
            agent.statusListeners.add(listener)
          }
        }
        check()
      }),
      new Promise<void>((resolve) => {
        setTimeout(() => {
          timedOut = true
          for (const id of ids) {
            const agent = this.agents.get(id)
            result[id] = agent?.status ?? 'not_found'
          }
          resolve()
        }, timeoutMs)
      }),
    ])

    return { status: result, timedOut }
  }

  /** Close (shut down) an agent. */
  close(id: string): AgentStatus {
    const agent = this.agents.get(id)
    if (!agent) return 'not_found'
    if (agent.status === 'running' || agent.status === 'pending') {
      agent.abortController.abort()
    }
    this.setStatus(id, 'shutdown')
    logger.info({ agentId: id }, '[agent-manager] closed')
    return 'shutdown'
  }

  /** Resume a shut-down agent. */
  resume(id: string): AgentStatus {
    const agent = this.agents.get(id)
    if (!agent) return 'not_found'
    if (agent.status !== 'shutdown') {
      return agent.status
    }
    agent.abortController = new AbortController()
    this.setStatus(id, 'running')

    // 逻辑：恢复后重新触发执行。
    this.executeAgent(id, agent.name).catch((err) => {
      logger.error({ agentId: id, err }, '[agent-manager] resume executeAgent error')
    })

    logger.info({ agentId: id }, '[agent-manager] resumed')
    return 'running'
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
  }

  /** Mark an agent as failed with an error. */
  fail(id: string, error: string): void {
    const agent = this.agents.get(id)
    if (!agent) return
    agent.error = error
    this.setStatus(id, 'failed')
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

/** Singleton agent manager instance. */
export const agentManager = new AgentManager()
