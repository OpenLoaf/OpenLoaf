/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { randomUUID } from 'node:crypto'
import { logger } from '@/common/logger'
import { runChatStream } from '@/ai/services/chat/chatStreamService'
import {
  getTask,
  updateTask,
  appendActivityLog,
  updateExecutionSummary,
  type TaskConfig,
  type TaskStatus,
} from './taskConfigService'
import { taskEventBus } from './taskEventBus'
import { appendRunLog } from './taskRunLogService'
import {
  appendMessage,
  loadMessageTree,
  resolveRightmostLeaf,
} from '@/ai/services/chat/repositories/chatFileStore'

type RunningTask = {
  taskId: string
  sessionId: string
  abortController: AbortController
  startedAt: string
}

type ConfirmationResult = 'approved' | 'cancelled' | 'timeout'

const MAX_CONSECUTIVE_ERRORS = 3

/**
 * TaskExecutor handles task execution with two modes:
 * - Two-phase: Generate plan → wait for confirmation → execute plan
 * - Single-phase: Execute directly (when skipPlanConfirm=true and requiresReview=false)
 */
class TaskExecutor {
  private running = new Map<string, RunningTask>()
  private confirmationResolvers = new Map<string, (result: ConfirmationResult) => void>()

  /** Check if a task is currently executing. */
  isRunning(taskId: string): boolean {
    return this.running.has(taskId)
  }

  /** Get all running task IDs. */
  getRunningTaskIds(): string[] {
    return Array.from(this.running.keys())
  }

  /** Abort a running task. */
  abort(taskId: string): boolean {
    const entry = this.running.get(taskId)
    if (!entry) return false
    entry.abortController.abort()
    return true
  }

  /** Resolve a plan confirmation (called by tRPC endpoint). */
  resolvePlanConfirmation(taskId: string, result: ConfirmationResult): boolean {
    const resolver = this.confirmationResolvers.get(taskId)
    if (!resolver) return false
    resolver(result)
    this.confirmationResolvers.delete(taskId)
    return true
  }

  /**
   * Execute a task through its lifecycle.
   *
   * Single-phase (skipPlanConfirm=true && requiresReview=false):
   *   todo → running → done
   *
   * Two-phase:
   *   todo → running (plan) → review(plan) → running (execute) → review(completion) / done
   */
  async execute(
    taskId: string,
    globalRoot: string,
    projectRoot?: string | null,
  ): Promise<void> {
    const startedAt = new Date().toISOString()
    const abortController = new AbortController()

    try {
      const task = getTask(taskId, globalRoot, projectRoot ?? undefined)
      if (!task) {
        logger.warn({ taskId }, '[task-executor] Task not found')
        return
      }

      if (this.running.has(taskId)) {
        logger.warn({ taskId }, '[task-executor] Task already running, skipping')
        return
      }

      // Generate session ID
      const sessionId = task.sessionMode === 'shared'
        ? `task-${taskId}`
        : `task-${taskId}-${randomUUID()}`

      logger.info({ taskId, name: task.name, sessionId }, '[task-executor] Starting task execution')

      this.running.set(taskId, { taskId, sessionId, abortController, startedAt })

      // Transition: → running
      this.transitionStatus(taskId, task.status, 'running', globalRoot, projectRoot, {
        sessionId,
        lastRunAt: startedAt,
        lastError: null,
        runCount: task.runCount + 1,
      })

      // Set up timeout
      const timeoutId = setTimeout(() => {
        abortController.abort()
      }, task.timeoutMs || 600_000)

      try {
        const isSinglePhase = task.skipPlanConfirm && !task.requiresReview

        if (isSinglePhase) {
          // ─── Single-phase: Direct execution ─────────────────────
          const instruction = this.buildDirectInstruction(task)
          await this.runAgentPhase(sessionId, instruction, abortController.signal, taskId, globalRoot, projectRoot)

          // Mark done
          const now = new Date().toISOString()
          this.transitionStatus(taskId, 'running', 'done', globalRoot, projectRoot, {
            completedAt: now,
            lastStatus: 'ok',
            lastError: null,
            consecutiveErrors: 0,
          })

          appendRunLog(taskId, {
            trigger: task.triggerMode === 'scheduled' ? 'scheduled' : 'autonomous',
            status: 'ok',
            agentSessionId: sessionId,
            startedAt,
            finishedAt: now,
            durationMs: Date.now() - new Date(startedAt).getTime(),
          }, projectRoot ?? globalRoot)

          // Report completion to source chat session
          const latestTask = getTask(taskId, globalRoot, projectRoot ?? undefined)
          if (latestTask) {
            await this.reportToSourceSession(
              latestTask,
              'completed',
              latestTask.executionSummary?.lastAgentMessage,
            )
          }

        } else {
          // ─── Two-phase: Plan → Confirm → Execute ────────────────

          // Phase 1: Generate Plan
          const planInstruction = this.buildPlanInstruction(task)
          await this.runAgentPhase(sessionId, planInstruction, abortController.signal, taskId, globalRoot, projectRoot)

          // Plan Confirmation
          if (!task.skipPlanConfirm) {
            this.transitionStatus(taskId, 'running', 'review', globalRoot, projectRoot, {
              reviewType: 'plan',
            })

            const confirmResult = await this.waitForConfirmation(taskId, task.planConfirmTimeoutMs)

            if (confirmResult === 'cancelled') {
              this.transitionStatus(taskId, 'review', 'cancelled', globalRoot, projectRoot, undefined, {
                reason: '用户拒绝计划',
                actor: 'user',
              })
              return
            }

            // approved or timeout → continue execution
            const actor = confirmResult === 'timeout' ? 'timeout' : 'user'
            const reason = confirmResult === 'timeout' ? '计划确认超时，自动继续' : '用户确认计划'
            appendActivityLog(taskId, {
              from: 'review',
              to: 'running',
              reviewType: 'plan',
              reason,
              actor,
            }, globalRoot, projectRoot ?? undefined)

            updateTask(taskId, {
              status: 'running',
              reviewType: undefined,
            }, globalRoot, projectRoot ?? undefined)

            taskEventBus.emitStatusChange({
              taskId,
              status: 'running',
              previousStatus: 'review',
              title: task.name,
              updatedAt: new Date().toISOString(),
            })
          }

          // Phase 2: Execute Plan
          const execInstruction = '请按照已生成的计划开始执行。逐步完成每个步骤，完成后汇报结果。'
          await this.runAgentPhase(sessionId, execInstruction, abortController.signal, taskId, globalRoot, projectRoot)

          // Completion
          const nextStatus: TaskStatus = task.requiresReview ? 'review' : 'done'
          const now = new Date().toISOString()

          this.transitionStatus(taskId, 'running', nextStatus, globalRoot, projectRoot, {
            reviewType: task.requiresReview ? 'completion' : undefined,
            completedAt: now,
            lastStatus: 'ok',
            lastError: null,
            consecutiveErrors: 0,
          })

          appendRunLog(taskId, {
            trigger: 'autonomous',
            status: 'ok',
            agentSessionId: sessionId,
            startedAt,
            finishedAt: now,
            durationMs: Date.now() - new Date(startedAt).getTime(),
          }, projectRoot ?? globalRoot)

          // Report completion to source chat session (only if done, not review)
          if (nextStatus === 'done') {
            const latestTask = getTask(taskId, globalRoot, projectRoot ?? undefined)
            if (latestTask) {
              await this.reportToSourceSession(
                latestTask,
                'completed',
                latestTask.executionSummary?.lastAgentMessage,
              )
            }
          }
        }

      } finally {
        clearTimeout(timeoutId)
      }
    } catch (err) {
      logger.error({ taskId, err }, '[task-executor] Task execution failed')

      const errorMessage = err instanceof Error ? err.message : String(err)
      const task = getTask(taskId, globalRoot, projectRoot ?? undefined)
      const newConsecutiveErrors = (task?.consecutiveErrors ?? 0) + 1

      // Determine next status: retry if under threshold, cancel otherwise
      const shouldRetry = newConsecutiveErrors < MAX_CONSECUTIVE_ERRORS
        && task?.triggerMode !== 'scheduled' // scheduled tasks rely on their timer for retry
      const nextStatus: TaskStatus = shouldRetry ? 'todo' : 'cancelled'

      updateTask(taskId, {
        status: nextStatus,
        lastStatus: 'error',
        lastError: errorMessage,
        consecutiveErrors: newConsecutiveErrors,
      }, globalRoot, projectRoot ?? undefined)

      appendActivityLog(taskId, {
        from: task?.status ?? 'running',
        to: nextStatus,
        actor: 'system',
        reason: shouldRetry
          ? `执行失败 (${newConsecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})，等待重试`
          : `连续失败 ${newConsecutiveErrors} 次，任务取消`,
      }, globalRoot, projectRoot ?? undefined)

      taskEventBus.emitStatusChange({
        taskId,
        status: nextStatus,
        previousStatus: task?.status ?? 'running',
        title: task?.name ?? taskId,
        updatedAt: new Date().toISOString(),
      })

      appendRunLog(taskId, {
        trigger: task?.triggerMode === 'scheduled' ? 'scheduled' : 'autonomous',
        status: 'error',
        error: errorMessage,
        agentSessionId: this.running.get(taskId)?.sessionId,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(startedAt).getTime(),
      }, projectRoot ?? globalRoot)

      // Report failure to source chat session
      if (task) {
        await this.reportToSourceSession(task, 'failed')
      }
    } finally {
      this.running.delete(taskId)
      this.confirmationResolvers.delete(taskId)
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────

  /** Run one agent phase (plan generation or execution). */
  private async runAgentPhase(
    sessionId: string,
    instruction: string,
    signal: AbortSignal,
    taskId: string,
    globalRoot: string,
    projectRoot?: string | null,
  ): Promise<void> {
    // Resolve projectId and agentType from task config
    const taskConfig = getTask(taskId, globalRoot, projectRoot ?? undefined)
    const taskProjectId = taskConfig?.projectId
    const taskAgentName = taskConfig?.agentName

    // Determine agent type: 'pm' for PM agents, 'project' for project-scoped, undefined otherwise
    let agentType: string | undefined
    if (taskAgentName === 'pm') {
      agentType = 'pm'
    } else if (taskProjectId) {
      agentType = 'project'
    }

    const messageId = randomUUID()
    const response = await runChatStream({
      request: {
        sessionId,
        messages: [{
          id: messageId,
          role: 'user',
          parts: [{ type: 'text', text: instruction }],
          createdAt: new Date(),
          parentMessageId: null,
        } as any],
        trigger: 'submit-message',
        projectId: taskProjectId,
        params: agentType
          ? { agentType, taskId }
          : undefined,
      },
      cookies: {},
      requestSignal: signal,
    })

    // Consume SSE stream
    if (response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let lastMessage = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          // Try to extract progress from stream data
          if (value) {
            const chunk = decoder.decode(value, { stream: true })
            lastMessage = this.extractLastMessage(chunk, lastMessage)

            // Update execution summary periodically
            if (lastMessage) {
              updateExecutionSummary(taskId, {
                lastAgentMessage: lastMessage.slice(0, 100),
              }, globalRoot, projectRoot ?? undefined)

              taskEventBus.emitSummaryUpdate({
                taskId,
                summary: { lastAgentMessage: lastMessage.slice(0, 100) },
              })
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    }
  }

  /** Extract the last meaningful text from an SSE chunk. */
  private extractLastMessage(chunk: string, fallback: string): string {
    // SSE format: data: {...}\n\n
    const lines = chunk.split('\n')
    let lastText = fallback
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const data = JSON.parse(line.slice(6))
        if (data.type === 'text-delta' && data.textDelta) {
          lastText = data.textDelta
        }
      } catch {
        // Not JSON, skip
      }
    }
    return lastText
  }

  /** Build instruction for single-phase direct execution. */
  private buildDirectInstruction(task: TaskConfig): string {
    const parts: string[] = []
    parts.push(`## 自主任务执行\n`)
    parts.push(`你正在执行一个后台自主任务。请直接开始执行，完成后汇报结果。\n`)
    parts.push(`### 任务名称\n${task.name}\n`)
    if (task.description) {
      parts.push(`### 任务描述\n${task.description}\n`)
    }
    if (task.payload?.message && typeof task.payload.message === 'string') {
      parts.push(`### 用户原始指令\n${task.payload.message}\n`)
    }
    return parts.join('\n')
  }

  /** Build the instruction for plan generation phase. */
  private buildPlanInstruction(task: TaskConfig): string {
    const parts: string[] = []
    parts.push(`## 自主任务执行\n`)
    parts.push(`你正在执行一个后台自主任务。请先分析需求并生成执行计划。\n`)
    parts.push(`### 任务名称\n${task.name}\n`)
    if (task.description) {
      parts.push(`### 任务描述\n${task.description}\n`)
    }
    if (task.payload?.message && typeof task.payload.message === 'string') {
      parts.push(`### 用户原始指令\n${task.payload.message}\n`)
    }
    parts.push(`### 要求`)
    parts.push(`1. 使用 update-plan 工具生成分步骤的执行计划`)
    parts.push(`2. 每个步骤应清晰、可执行`)
    parts.push(`3. 生成计划后停止，等待确认后再执行`)
    parts.push(`4. 如需使用其他 Agent（如 shell、document），可通过 spawn-agent 调度`)

    return parts.join('\n')
  }

  /**
   * Report task completion/failure back to the originating chat session.
   * Appends a task-report message to the source session's messages.jsonl.
   */
  private async reportToSourceSession(
    task: TaskConfig,
    status: 'completed' | 'failed',
    summary?: string,
  ): Promise<void> {
    const sourceSessionId = task.sourceSessionId
    if (!sourceSessionId) return

    try {
      const tree = await loadMessageTree(sourceSessionId)
      const parentId = resolveRightmostLeaf(tree)

      const summaryText = summary || (status === 'completed'
        ? `任务「${task.name}」已完成。`
        : `任务「${task.name}」执行失败：${task.lastError || '未知错误'}`)

      // Resolve agent identity type from agentName
      const agentIdentityType = task.agentName === 'pm'
        ? 'pm' as const
        : task.agentName === 'secretary'
          ? 'secretary' as const
          : 'specialist' as const

      const reportMessage = {
        id: randomUUID(),
        parentMessageId: parentId,
        role: 'task-report' as const,
        messageKind: 'normal' as const,
        parts: [
          {
            type: 'text' as const,
            text: summaryText,
          },
          {
            type: 'task-ref' as const,
            taskId: task.id,
            title: task.name,
            agentType: task.agentName || 'general',
            status,
          },
        ],
        metadata: {
          taskId: task.id,
          agentType: task.agentName || 'general',
          displayName: task.agentName || '任务助手',
          projectId: task.projectId,
          agentIdentity: {
            type: agentIdentityType,
            name: task.agentName || '任务助手',
            projectId: task.projectId,
            taskId: task.id,
          },
        },
        createdAt: new Date().toISOString(),
      }

      await appendMessage({
        sessionId: sourceSessionId,
        message: reportMessage,
      })

      taskEventBus.emitTaskReport({
        taskId: task.id,
        sourceSessionId,
        status,
        title: task.name,
        summary: summaryText,
        messageId: reportMessage.id,
      })

      logger.info(
        { taskId: task.id, sourceSessionId: task.sourceSessionId },
        '[task-executor] Reported task completion to source session',
      )
    } catch (err) {
      logger.error(
        { taskId: task.id, err },
        '[task-executor] Failed to report to source session',
      )
    }
  }

  /**
   * Append a user message to a running task's agent session.
   * Used for @agents/ mention routing — users can send follow-up instructions
   * to a specific running agent.
   */
  async appendUserMessage(taskId: string, message: string, globalRoot: string, projectRoot?: string | null): Promise<boolean> {
    const entry = this.running.get(taskId)
    if (!entry) {
      logger.warn({ taskId }, '[task-executor] Cannot append message: task not running')
      return false
    }

    const messageId = randomUUID()
    try {
      await appendMessage({
        sessionId: entry.sessionId,
        message: {
          id: messageId,
          parentMessageId: null,
          role: 'user' as const,
          messageKind: 'normal' as const,
          parts: [{ type: 'text' as const, text: message }],
          metadata: { source: 'agent-mention' },
          createdAt: new Date().toISOString(),
        },
      })

      // Re-trigger agent phase with the new instruction
      const task = getTask(taskId, globalRoot, projectRoot ?? undefined)
      if (task) {
        // Fire-and-forget: run another agent phase in the background
        void this.runAgentPhase(
          entry.sessionId,
          message,
          entry.abortController.signal,
          taskId,
          globalRoot,
          projectRoot,
        ).then(async () => {
          // After handling the follow-up, report back to source session
          const latestTask = getTask(taskId, globalRoot, projectRoot ?? undefined)
          if (latestTask) {
            await this.reportToSourceSession(latestTask, 'completed', latestTask.executionSummary?.lastAgentMessage)
          }
        }).catch((err) => {
          logger.error({ taskId, err }, '[task-executor] Follow-up agent phase failed')
        })
      }

      return true
    } catch (err) {
      logger.error({ taskId, err }, '[task-executor] Failed to append user message')
      return false
    }
  }

  /** Wait for plan confirmation from user or timeout. */
  private waitForConfirmation(taskId: string, timeoutMs: number): Promise<ConfirmationResult> {
    return new Promise<ConfirmationResult>((resolve) => {
      const timer = setTimeout(() => {
        this.confirmationResolvers.delete(taskId)
        resolve('timeout')
      }, timeoutMs)

      this.confirmationResolvers.set(taskId, (result) => {
        clearTimeout(timer)
        resolve(result)
      })
    })
  }

  /** Transition task status with activity log and event emission. */
  private transitionStatus(
    taskId: string,
    from: TaskStatus,
    to: TaskStatus,
    globalRoot: string,
    projectRoot?: string | null,
    patch?: Partial<Record<string, unknown>>,
    logOverride?: { reason?: string; actor?: 'system' | 'user' | 'agent' | 'timeout' },
  ) {
    const task = getTask(taskId, globalRoot, projectRoot ?? undefined)
    if (!task) return

    updateTask(taskId, {
      status: to,
      ...patch,
    } as any, globalRoot, projectRoot ?? undefined)

    appendActivityLog(taskId, {
      from,
      to,
      reviewType: (patch as any)?.reviewType,
      reason: logOverride?.reason,
      actor: logOverride?.actor ?? 'system',
    }, globalRoot, projectRoot ?? undefined)

    taskEventBus.emitStatusChange({
      taskId,
      status: to,
      previousStatus: from,
      reviewType: (patch as any)?.reviewType,
      title: task.name,
      updatedAt: new Date().toISOString(),
    })
  }
}

export const taskExecutor = new TaskExecutor()
