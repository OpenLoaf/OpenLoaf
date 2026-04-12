/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { randomBytes } from 'node:crypto'
import { generateId, type UIMessage, type UIMessageStreamWriter } from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'

/** Generate a short, human-readable ID with a prefix. Format: `openloaf-<prefix>-<6hex>`. */
function friendlyId(prefix: string): string {
  return `openloaf-${prefix}-${randomBytes(3).toString('hex')}`
}
import type { RequestContext } from '@/ai/shared/context/requestContext'
import { getSessionId } from '@/ai/shared/context/requestContext'
import {
  registerAgentDir,
  loadMessageTree,
  readSessionJson,
} from '@/ai/services/chat/repositories/chatFileStore'
import { logger } from '@/common/logger'
import { scheduleExecution } from '@/ai/services/agentExecutor'
import { sanitizeRestoredMessages } from '@/ai/services/agentHistory'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
// AgentManager — manages SubAgent lifecycle
// ---------------------------------------------------------------------------

/**
 * AgentManager — manages SubAgent lifecycle with real execution.
 *
 * Each SubAgent runs in an independent async context via runWithContext.
 * Status changes are observable via listeners or the wait() method.
 *
 * Execution logic is delegated to agentExecutor.ts.
 * Stream/approval handling is delegated to agentApprovalLoop.ts.
 * History persistence is delegated to agentHistory.ts.
 * Output utilities are in agentOutputUtils.ts.
 * Registry/singleton is in agentRegistry.ts.
 */
export class AgentManager {
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

    const id = friendlyId('agent')

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
    scheduleExecution(this, id, input.subagentType)

    return id
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
        scheduleExecution(this, id, agent.name)
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
      scheduleExecution(this, id, agent.name)
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
      scheduleExecution(this, id, agent.name)
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
      scheduleExecution(this, id, (meta.agentType as string) || restored.name)
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
  setStatus(id: string, status: AgentStatus): void {
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

// ---------------------------------------------------------------------------
// Re-exports for backward compatibility
// ---------------------------------------------------------------------------
// Consumers that imported from agentManager continue to work.
// New code should import from the specific module directly.
export { getAgentManager, agentManager, agentRegistry } from '@/ai/services/agentRegistry'
