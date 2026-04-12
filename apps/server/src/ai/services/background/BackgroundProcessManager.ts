/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import type {
  BgAgentTaskState,
  BgNotification,
  BgNotificationPriority,
  BgShellTaskState,
  BgTaskState,
  BgTaskStatus,
  BgTaskSummary,
} from './types'
import {
  reapOrphanedShellTasks,
  spawnShellProcess,
  type ShellFinalizeResult,
} from './shellTask'
import { readOutputIncremental } from './outputBuffer'

export type SpawnBashOpts = {
  sessionId: string
  command: string
  description?: string
  ownerAgentId?: string
  env?: NodeJS.ProcessEnv
  cwd?: string
}

export type SpawnAgentOpts = {
  sessionId: string
  agentId: string
  prompt: string
  description?: string
  ownerAgentId?: string
  abortController: AbortController
}

export type ReadOutputOpts = {
  block?: boolean
  timeoutMs?: number
}

/**
 * Session-scoped registry of background tasks (shell + agent). This is the
 * single source of truth for:
 *   - Which tasks are still running for a given session
 *   - Reading incremental output from a task
 *   - Killing a task (by id or by owning agent)
 *   - Draining completion notifications for end-of-turn injection (P2)
 *
 * Lifetime: one instance per server process. Lives in-memory only — disk
 * metadata (shellTask.ts) handles cross-restart orphan reaping.
 */
export class BackgroundProcessManager {
  private tasks = new Map<string, BgTaskState>()
  private sessionIndex = new Map<string, Set<string>>()
  private notifications = new Map<string, BgNotification[]>() // sessionId → queue
  private emitter = new EventEmitter()

  constructor() {
    // Fire-and-forget: reap orphans left by a previously crashed server.
    void reapOrphanedShellTasks().catch((err) => {
      console.warn('[BgManager] reap failed:', err)
    })
    // Node defaults to 10 listeners; bg notifications + watchers easily blow
    // past that in an active session.
    this.emitter.setMaxListeners(100)
  }

  // ─── Spawn ────────────────────────────────────────────────────────────

  async spawnBash(opts: SpawnBashOpts): Promise<BgShellTaskState> {
    const taskId = randomUUID()
    const startTime = Date.now()

    const stateBase: BgShellTaskState = {
      kind: 'shell',
      id: taskId,
      sessionId: opts.sessionId,
      status: 'running',
      description: opts.description ?? opts.command,
      ownerAgentId: opts.ownerAgentId,
      startTime,
      notified: false,
      pid: 0, // filled after spawn
      command: opts.command,
      outputPath: '',
      outputOffset: 0,
    }

    const spawn = await spawnShellProcess({
      taskId,
      sessionId: opts.sessionId,
      command: opts.command,
      env: opts.env,
      cwd: opts.cwd,
      ownerAgentId: opts.ownerAgentId,
      onFinalize: (result) => this.handleShellFinalize(taskId, result),
    })

    stateBase.pid = spawn.pid
    stateBase.outputPath = spawn.outputPath

    this.tasks.set(taskId, stateBase)
    this.addToSessionIndex(opts.sessionId, taskId)

    this.emitter.emit('update', stateBase)
    this.emitter.emit(`session:${opts.sessionId}:update`, stateBase)

    return stateBase
  }

  /**
   * Register a background agent task. The agent is already spawned by
   * AgentManager; we wrap it for unified notification + kill surface.
   */
  spawnAgent(opts: SpawnAgentOpts): BgAgentTaskState {
    const taskId = randomUUID()
    const startTime = Date.now()

    const state: BgAgentTaskState = {
      kind: 'agent',
      id: taskId,
      sessionId: opts.sessionId,
      status: 'running',
      description: opts.description ?? opts.prompt.slice(0, 200),
      ownerAgentId: opts.ownerAgentId,
      startTime,
      notified: false,
      agentId: opts.agentId,
      prompt: opts.prompt,
      abortController: opts.abortController,
    }

    this.tasks.set(taskId, state)
    this.addToSessionIndex(opts.sessionId, taskId)

    this.emitter.emit('update', state)
    this.emitter.emit(`session:${opts.sessionId}:update`, state)

    return state
  }

  /**
   * Finalize a background agent task (called from agentTools.ts when the
   * agent's statusListener fires a terminal state). Enqueues a notification
   * and cascades cleanup to any child bg shells.
   */
  handleAgentFinalize(
    taskId: string,
    result: {
      status: 'completed' | 'failed' | 'killed'
      result?: string
      error?: string
      toolUseCount?: number
    },
  ): void {
    const task = this.tasks.get(taskId)
    if (!task || task.kind !== 'agent') return
    if (task.status !== 'running') return // already finalized

    task.status = result.status
    task.result = result.result
    task.error = result.error
    task.endTime = Date.now()
    if (result.toolUseCount != null) {
      task.progress = {
        ...(task.progress ?? { toolUseCount: 0, tokenCount: 0 }),
        toolUseCount: result.toolUseCount,
      }
    }

    // Enqueue notification
    if (!task.notified) {
      task.notified = true
      const priority: BgNotificationPriority =
        result.status === 'failed' ? 'next' : 'later'
      const xml = this.buildAgentNotificationXml(task)
      if (xml) {
        const notification: BgNotification = {
          taskId,
          priority,
          xmlContent: xml,
          enqueuedAt: Date.now(),
        }
        const queue = this.notifications.get(task.sessionId) ?? []
        queue.push(notification)
        this.notifications.set(task.sessionId, queue)
        this.emitter.emit(`session:${task.sessionId}:notification`, notification)
      }
    }

    // Cascade: kill child bg shells owned by this agent
    void this.killForAgent(task.agentId).catch(() => {})

    this.emitter.emit('complete', task)
    this.emitter.emit(`session:${task.sessionId}:complete`, task)
  }

  // ─── Finalize ─────────────────────────────────────────────────────────

  private async handleShellFinalize(
    taskId: string,
    result: ShellFinalizeResult,
  ): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task || task.kind !== 'shell') return

    task.status = result.status
    task.exitCode = result.exitCode
    task.interrupted = result.interrupted
    task.endTime = Date.now()

    // Enqueue completion notification for the next turn (P2 drain will pick
    // it up). Non-zero exit → 'next' priority so the AI hears about failures
    // immediately.
    if (!task.notified) {
      task.notified = true
      const priority: BgNotificationPriority =
        result.status === 'failed' ? 'next' : 'later'
      const xml = await this.buildShellNotificationXml(task).catch(() => '')
      if (xml) {
        const notification: BgNotification = {
          taskId,
          priority,
          xmlContent: xml,
          enqueuedAt: Date.now(),
        }
        const queue = this.notifications.get(task.sessionId) ?? []
        queue.push(notification)
        this.notifications.set(task.sessionId, queue)
        this.emitter.emit(`session:${task.sessionId}:notification`, notification)
      }
    }

    this.emitter.emit('complete', task)
    this.emitter.emit(`session:${task.sessionId}:complete`, task)
  }

  private async buildShellNotificationXml(
    task: BgShellTaskState,
  ): Promise<string> {
    const preview = await readOutputIncremental(task.outputPath, 0)
      .then((r) => r.content.slice(-2000))
      .catch(() => '')
    const duration = (task.endTime ?? Date.now()) - task.startTime
    return [
      '<bg-task-notification>',
      `  <task-id>${escapeXml(task.id)}</task-id>`,
      `  <task-type>bash</task-type>`,
      `  <status>${escapeXml(task.status)}</status>`,
      `  <description>${escapeXml(task.description)}</description>`,
      `  <exit-code>${task.exitCode ?? -1}</exit-code>`,
      `  <duration-ms>${duration}</duration-ms>`,
      `  <output-preview>${escapeXml(preview)}</output-preview>`,
      '</bg-task-notification>',
    ].join('\n')
  }

  private buildAgentNotificationXml(task: BgAgentTaskState): string {
    const duration = (task.endTime ?? Date.now()) - task.startTime
    const summary = task.result ? escapeXml(task.result.slice(-2000)) : ''
    return [
      '<bg-task-notification>',
      `  <task-id>${escapeXml(task.id)}</task-id>`,
      `  <task-type>agent</task-type>`,
      `  <status>${escapeXml(task.status)}</status>`,
      `  <description>${escapeXml(task.description)}</description>`,
      `  <agent-id>${escapeXml(task.agentId)}</agent-id>`,
      `  <duration-ms>${duration}</duration-ms>`,
      ...(summary ? [`  <output-preview>${summary}</output-preview>`] : []),
      ...(task.error ? [`  <error>${escapeXml(task.error)}</error>`] : []),
      '</bg-task-notification>',
    ].join('\n')
  }

  // ─── Query ────────────────────────────────────────────────────────────

  get(taskId: string): BgTaskState | undefined {
    return this.tasks.get(taskId)
  }

  listBySession(sessionId: string): BgTaskState[] {
    const ids = this.sessionIndex.get(sessionId)
    if (!ids) return []
    return [...ids]
      .map((id) => this.tasks.get(id))
      .filter((t): t is BgTaskState => !!t)
  }

  summarize(task: BgTaskState): BgTaskSummary {
    if (task.kind === 'shell') {
      return {
        id: task.id,
        kind: 'shell',
        status: task.status,
        description: task.description,
        startTime: task.startTime,
        endTime: task.endTime,
        pid: task.pid,
        command: task.command,
        exitCode: task.exitCode,
      }
    }
    return {
      id: task.id,
      kind: 'agent',
      status: task.status,
      description: task.description,
      startTime: task.startTime,
      endTime: task.endTime,
      agentId: task.agentId,
    }
  }

  // ─── Output ───────────────────────────────────────────────────────────

  /**
   * Read output bytes since the last offset stored on the task. When
   * `block: true`, wait until the task completes (or timeout) before
   * reading one final time.
   */
  async readOutput(
    taskId: string,
    opts: ReadOutputOpts = {},
  ): Promise<{
    content: string
    isFinal: boolean
    exitCode?: number
    status: BgTaskStatus
    truncated: boolean
  }> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Task not found: ${taskId}`)
    if (task.kind !== 'shell') {
      throw new Error(`Task ${taskId} is not a shell task`)
    }

    if (opts.block && task.status === 'running') {
      const timeoutMs = Math.min(Math.max(opts.timeoutMs ?? 60_000, 1_000), 600_000)
      await this.waitForCompletion(taskId, timeoutMs)
    }

    const read = await readOutputIncremental(task.outputPath, task.outputOffset)
    task.outputOffset = read.newOffset

    return {
      content: read.content,
      isFinal: task.status !== 'running',
      exitCode: task.exitCode,
      status: task.status,
      truncated: read.truncated,
    }
  }

  private waitForCompletion(taskId: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        this.emitter.off('complete', onComplete)
        resolve()
      }, timeoutMs)
      timer.unref()

      const onComplete = (t: BgTaskState) => {
        if (t.id !== taskId) return
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.emitter.off('complete', onComplete)
        resolve()
      }
      this.emitter.on('complete', onComplete)

      // Double-check in case it already finished between the caller's check
      // and our listener registration.
      const task = this.tasks.get(taskId)
      if (task && task.status !== 'running') {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.emitter.off('complete', onComplete)
        resolve()
      }
    })
  }

  // ─── Kill ─────────────────────────────────────────────────────────────

  async kill(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task) return
    if (task.status !== 'running') return

    if (task.kind === 'shell') {
      await this.killShell(task)
    } else {
      // Agent kill: abort triggers the agent runtime which fires a
      // statusListener that calls handleAgentFinalize (registered in
      // agentTools.ts async branch). No direct status change here.
      task.abortController.abort()
    }
  }

  private async killShell(task: BgShellTaskState): Promise<void> {
    // tree-kill walks descendants. Exit handler inside shellTask.ts will
    // call finalize → handleShellFinalize above.
    const { default: treeKill } = await import('tree-kill')
    await new Promise<void>((resolve) => {
      treeKill(task.pid, 'SIGKILL', () => resolve())
    })
  }

  /**
   * Kill every running task owned by the given agent. Called in P3 when a
   * parent agent exits so its child shells don't leak. Already wired into
   * the type system now so P1 can spawn with ownerAgentId.
   */
  async killForAgent(agentId: string): Promise<void> {
    const victims: string[] = []
    for (const [id, task] of this.tasks) {
      if (task.ownerAgentId === agentId && task.status === 'running') {
        victims.push(id)
      }
    }
    await Promise.all(victims.map((id) => this.kill(id)))
  }

  // ─── Notifications (P2) ───────────────────────────────────────────────

  drainNotifications(
    sessionId: string,
    maxPriority: BgNotificationPriority,
  ): BgNotification[] {
    const queue = this.notifications.get(sessionId)
    if (!queue || queue.length === 0) return []

    // 'next' is stricter — only next-priority items surface at 'next'. 'later'
    // surfaces everything.
    const keep: BgNotification[] = []
    const take: BgNotification[] = []
    for (const n of queue) {
      if (maxPriority === 'later') {
        take.push(n)
      } else if (n.priority === 'next') {
        take.push(n)
      } else {
        keep.push(n)
      }
    }
    if (keep.length === 0) {
      this.notifications.delete(sessionId)
    } else {
      this.notifications.set(sessionId, keep)
    }
    return take
  }

  hasPending(sessionId: string, priority: BgNotificationPriority = 'later'): boolean {
    const queue = this.notifications.get(sessionId)
    if (!queue || queue.length === 0) return false
    if (priority === 'later') return queue.length > 0
    return queue.some((n) => n.priority === 'next')
  }

  /**
   * Subscribe to notification enqueue events for a single session. Used by
   * the P2 Sleep tool to wake early when background work completes.
   */
  onSessionNotification(sessionId: string, cb: () => void): () => void {
    const handler = () => cb()
    const event = `session:${sessionId}:notification`
    this.emitter.on(event, handler)
    return () => {
      this.emitter.off(event, handler)
    }
  }

  // ─── Subscriptions (P1 frontend) ──────────────────────────────────────

  onUpdate(listener: (task: BgTaskState) => void): () => void {
    this.emitter.on('update', listener)
    return () => {
      this.emitter.off('update', listener)
    }
  }

  onComplete(listener: (task: BgTaskState) => void): () => void {
    this.emitter.on('complete', listener)
    return () => {
      this.emitter.off('complete', listener)
    }
  }

  onSessionUpdate(
    sessionId: string,
    listener: (task: BgTaskState) => void,
  ): () => void {
    const updateEvent = `session:${sessionId}:update`
    const completeEvent = `session:${sessionId}:complete`
    this.emitter.on(updateEvent, listener)
    this.emitter.on(completeEvent, listener)
    return () => {
      this.emitter.off(updateEvent, listener)
      this.emitter.off(completeEvent, listener)
    }
  }

  // ─── Internals ────────────────────────────────────────────────────────

  private addToSessionIndex(sessionId: string, taskId: string) {
    let set = this.sessionIndex.get(sessionId)
    if (!set) {
      set = new Set()
      this.sessionIndex.set(sessionId, set)
    }
    set.add(taskId)
  }
}

/** XML escape for notification body / shell output preview. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Singleton — one per server process. */
export const backgroundProcessManager = new BackgroundProcessManager()
