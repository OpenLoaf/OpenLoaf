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
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { logger } from '@/common/logger'
import { runChatStream } from '@/ai/services/chat/chatStreamService'
import {
  getTask,
  updateTask,
  appendActivityLog,
  updateExecutionSummary,
  getTaskDir,
  type TaskConfig,
  type TaskStatus,
} from './taskConfigService'
import { taskEventBus } from './taskEventBus'
import { appendRunLog } from './taskRunLogService'

type RunningTask = {
  taskId: string
  sessionId: string
  abortController: AbortController
  startedAt: string
}

type ConfirmationResult = 'approved' | 'cancelled' | 'timeout'

/**
 * TaskExecutor handles the two-phase execution of autonomous tasks:
 * Phase 1: Generate plan → wait for confirmation
 * Phase 2: Execute plan → mark for review or done
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
   * Execute a task through the full lifecycle:
   * todo → running (plan) → review(plan) → running (execute) → review(completion) / done
   */
  async execute(
    taskId: string,
    workspaceRoot: string,
    projectRoot?: string | null,
  ): Promise<void> {
    const startedAt = new Date().toISOString()
    const abortController = new AbortController()

    try {
      const task = getTask(taskId, workspaceRoot, projectRoot ?? undefined)
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
      this.transitionStatus(taskId, task.status, 'running', workspaceRoot, projectRoot, {
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
        // ─── Phase 1: Generate Plan ─────────────────────────────
        const planInstruction = this.buildPlanInstruction(task)
        await this.runAgentPhase(sessionId, planInstruction, abortController.signal, taskId, workspaceRoot, projectRoot)

        // ─── Plan Confirmation ──────────────────────────────────
        if (!task.skipPlanConfirm) {
          this.transitionStatus(taskId, 'running', 'review', workspaceRoot, projectRoot, {
            reviewType: 'plan',
          })

          const confirmResult = await this.waitForConfirmation(taskId, task.planConfirmTimeoutMs)

          if (confirmResult === 'cancelled') {
            this.transitionStatus(taskId, 'review', 'cancelled', workspaceRoot, projectRoot, undefined, {
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
          }, workspaceRoot, projectRoot ?? undefined)

          updateTask(taskId, {
            status: 'running',
            reviewType: undefined,
          }, workspaceRoot, projectRoot ?? undefined)

          taskEventBus.emitStatusChange({
            taskId,
            status: 'running',
            previousStatus: 'review',
            title: task.name,
            updatedAt: new Date().toISOString(),
          })
        }

        // ─── Phase 2: Execute Plan ──────────────────────────────
        const execInstruction = '请按照已生成的计划开始执行。逐步完成每个步骤，完成后汇报结果。'
        await this.runAgentPhase(sessionId, execInstruction, abortController.signal, taskId, workspaceRoot, projectRoot)

        // ─── Completion ─────────────────────────────────────────
        const nextStatus: TaskStatus = task.requiresReview ? 'review' : 'done'
        const now = new Date().toISOString()

        this.transitionStatus(taskId, 'running', nextStatus, workspaceRoot, projectRoot, {
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
        }, projectRoot ?? workspaceRoot)

      } finally {
        clearTimeout(timeoutId)
      }
    } catch (err) {
      logger.error({ taskId, err }, '[task-executor] Task execution failed')

      const errorMessage = err instanceof Error ? err.message : String(err)
      const task = getTask(taskId, workspaceRoot, projectRoot ?? undefined)

      updateTask(taskId, {
        status: 'cancelled',
        lastStatus: 'error',
        lastError: errorMessage,
        consecutiveErrors: (task?.consecutiveErrors ?? 0) + 1,
      }, workspaceRoot, projectRoot ?? undefined)

      appendActivityLog(taskId, {
        from: task?.status ?? 'running',
        to: 'cancelled',
        actor: 'system',
        reason: errorMessage,
      }, workspaceRoot, projectRoot ?? undefined)

      taskEventBus.emitStatusChange({
        taskId,
        status: 'cancelled',
        previousStatus: task?.status ?? 'running',
        title: task?.name ?? taskId,
        updatedAt: new Date().toISOString(),
      })

      appendRunLog(taskId, {
        trigger: 'autonomous',
        status: 'error',
        error: errorMessage,
        agentSessionId: this.running.get(taskId)?.sessionId,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(startedAt).getTime(),
      }, projectRoot ?? workspaceRoot)
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
    workspaceRoot: string,
    projectRoot?: string | null,
  ): Promise<void> {
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
        workspaceId: undefined,
        projectId: undefined,
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
              }, workspaceRoot, projectRoot ?? undefined)

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

    // Save plan.md if generated during plan phase
    this.savePlanIfPresent(taskId, workspaceRoot, projectRoot)
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
    workspaceRoot: string,
    projectRoot?: string | null,
    patch?: Partial<Record<string, unknown>>,
    logOverride?: { reason?: string; actor?: 'system' | 'user' | 'agent' | 'timeout' },
  ) {
    const task = getTask(taskId, workspaceRoot, projectRoot ?? undefined)
    if (!task) return

    updateTask(taskId, {
      status: to,
      ...patch,
    } as any, workspaceRoot, projectRoot ?? undefined)

    appendActivityLog(taskId, {
      from,
      to,
      reviewType: (patch as any)?.reviewType,
      reason: logOverride?.reason,
      actor: logOverride?.actor ?? 'system',
    }, workspaceRoot, projectRoot ?? undefined)

    taskEventBus.emitStatusChange({
      taskId,
      status: to,
      previousStatus: from,
      reviewType: (patch as any)?.reviewType,
      title: task.name,
      updatedAt: new Date().toISOString(),
    })
  }

  /** Save plan.md from the task session if update-plan was used. */
  private savePlanIfPresent(
    taskId: string,
    workspaceRoot: string,
    projectRoot?: string | null,
  ) {
    // Plan content is stored by update-plan tool in the session.
    // We create a plan.md file in the task directory for display.
    const taskDir = getTaskDir(taskId, workspaceRoot, projectRoot ?? undefined)
    if (!taskDir) return

    try {
      const planPath = path.join(taskDir, 'plan.md')
      // The plan is written by the update-plan tool to the session.
      // For now, create a placeholder that will be populated by the tool.
      mkdirSync(taskDir, { recursive: true })
      // plan.md will be written by the update-plan tool integration
      void planPath
    } catch {
      // Ignore
    }
  }
}

export const taskExecutor = new TaskExecutor()
