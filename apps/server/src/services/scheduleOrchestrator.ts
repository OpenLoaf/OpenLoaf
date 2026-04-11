/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { getOpenLoafRootDir } from '@openloaf/config'
import { logger } from '@/common/logger'
import {
  listTasks,
  getTask,
  updateTask,
  appendActivityLog,
  archiveTask,
  type TaskConfig,
  type TaskStatus,
} from './scheduleConfigService'
import { scheduleExecutor } from './scheduleExecutor'
import { scheduleEventBus } from './scheduleEventBus'

const TICK_INTERVAL_MS = 30_000

/**
 * ScheduleOrchestrator manages the lifecycle of autonomous tasks:
 * - Periodic scanning for ready tasks (todo → running)
 * - Conflict detection between concurrent tasks
 * - Review resolution (plan confirm / completion review)
 * - Task cancellation
 */
class ScheduleOrchestrator {
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private started = false
  /** In-memory cache of SaaS access tokens by taskId. */
  private tokenCache = new Map<string, string>()

  /** Start the orchestrator's periodic scan. */
  start(): void {
    if (this.started) return
    this.started = true
    this.tickTimer = setInterval(() => {
      void this.tick()
    }, TICK_INTERVAL_MS)
    logger.info('[task-orchestrator] Started')
    // Run first tick immediately
    void this.tick()
  }

  /** Stop the orchestrator. */
  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
    this.started = false
    logger.info('[task-orchestrator] Stopped')
  }

  /** Enqueue a task for execution (sets autoExecute and triggers tick). */
  async enqueue(taskId: string, projectRoot?: string | null, saasAccessToken?: string): Promise<void> {
    const globalRoot = getOpenLoafRootDir()
    const task = getTask(taskId, globalRoot, projectRoot ?? undefined)
    if (!task) return

    if (task.status !== 'todo') {
      logger.warn({ taskId, status: task.status }, '[task-orchestrator] Cannot enqueue non-todo task')
      return
    }

    // Store token for later use
    if (saasAccessToken) {
      this.tokenCache.set(taskId, saasAccessToken)
    }

    // Trigger immediate evaluation
    void this.evaluateCandidate(task, globalRoot, projectRoot)
  }

  /** Cancel a task. */
  async cancel(taskId: string, projectRoot?: string | null): Promise<void> {
    const globalRoot = getOpenLoafRootDir()
    const task = getTask(taskId, globalRoot, projectRoot ?? undefined)
    if (!task) return

    const previousStatus = task.status

    if (previousStatus === 'running') {
      // Abort the executor
      scheduleExecutor.abort(taskId)
      // Status will be updated by executor's catch block
      return
    }

    if (previousStatus === 'todo' || previousStatus === 'review') {
      updateTask(taskId, { status: 'cancelled' }, globalRoot, projectRoot ?? undefined)

      appendActivityLog(taskId, {
        from: previousStatus,
        to: 'cancelled',
        actor: 'user',
        reason: '用户取消任务',
      }, globalRoot, projectRoot ?? undefined)

      scheduleEventBus.emitStatusChange({
        taskId,
        status: 'cancelled',
        previousStatus,
        title: task.name,
        updatedAt: new Date().toISOString(),
      })

      // If in plan confirmation, resolve it
      if (previousStatus === 'review' && task.reviewType === 'plan') {
        scheduleExecutor.resolvePlanConfirmation(taskId, 'cancelled')
      }
    }
  }

  /**
   * Resolve a review action (plan confirmation or completion review).
   */
  async resolveReview(
    taskId: string,
    action: 'approve' | 'reject' | 'rework',
    reason?: string,
    projectRoot?: string | null,
  ): Promise<TaskConfig | null> {
    const globalRoot = getOpenLoafRootDir()
    const task = getTask(taskId, globalRoot, projectRoot ?? undefined)
    if (!task || task.status !== 'review') return null

    if (task.reviewType === 'plan') {
      // Plan confirmation
      if (action === 'approve') {
        scheduleExecutor.resolvePlanConfirmation(taskId, 'approved')
      } else {
        // reject → cancel
        scheduleExecutor.resolvePlanConfirmation(taskId, 'cancelled')

        appendActivityLog(taskId, {
          from: 'review',
          to: 'cancelled',
          reviewType: 'plan',
          actor: 'user',
          reason: reason ?? '用户拒绝计划',
        }, globalRoot, projectRoot ?? undefined)
      }
    } else if (task.reviewType === 'completion') {
      if (action === 'approve') {
        // Pass review → done
        updateTask(taskId, {
          status: 'done',
          reviewType: undefined,
        }, globalRoot, projectRoot ?? undefined)

        appendActivityLog(taskId, {
          from: 'review',
          to: 'done',
          reviewType: 'completion',
          actor: 'user',
          reason: reason ?? '用户通过审查',
        }, globalRoot, projectRoot ?? undefined)

        scheduleEventBus.emitStatusChange({
          taskId,
          status: 'done',
          previousStatus: 'review',
          title: task.name,
          updatedAt: new Date().toISOString(),
        })
      } else if (action === 'rework') {
        // Rework → re-execute
        updateTask(taskId, {
          status: 'todo',
          reviewType: undefined,
        }, globalRoot, projectRoot ?? undefined)

        appendActivityLog(taskId, {
          from: 'review',
          to: 'todo',
          reviewType: 'completion',
          actor: 'user',
          reason: reason ?? '用户要求返工',
        }, globalRoot, projectRoot ?? undefined)

        scheduleEventBus.emitStatusChange({
          taskId,
          status: 'todo',
          previousStatus: 'review',
          title: task.name,
          updatedAt: new Date().toISOString(),
        })

        // Auto re-enqueue if autoExecute
        if (task.autoExecute) {
          void this.enqueue(taskId, projectRoot)
        }
      } else {
        // reject completion → cancel
        updateTask(taskId, {
          status: 'cancelled',
          reviewType: undefined,
        }, globalRoot, projectRoot ?? undefined)

        appendActivityLog(taskId, {
          from: 'review',
          to: 'cancelled',
          reviewType: 'completion',
          actor: 'user',
          reason: reason ?? '用户拒绝完成结果',
        }, globalRoot, projectRoot ?? undefined)

        scheduleEventBus.emitStatusChange({
          taskId,
          status: 'cancelled',
          previousStatus: 'review',
          title: task.name,
          updatedAt: new Date().toISOString(),
        })
      }
    }

    return getTask(taskId, globalRoot, projectRoot ?? undefined)
  }

  // ─── Periodic Tick ──────────────────────────────────────────────────

  /** Periodic scan: collect candidates, check conflicts, start tasks. */
  private async tick(): Promise<void> {
    try {
      const globalRoot = getOpenLoafRootDir()
      const allTasks = listTasks(globalRoot)

      // Collect candidates
      const candidates = this.collectCandidates(allTasks)
      if (candidates.length === 0) return

      // Get currently running tasks
      const runningTasks = allTasks.filter((t) => t.status === 'running')

      for (const candidate of candidates) {
        await this.evaluateCandidate(candidate, globalRoot, null, runningTasks)
      }

      // Check timeouts
      this.checkTimeouts(allTasks, globalRoot)

      // Auto-archive done tasks older than 7 days
      this.checkAutoArchive(allTasks, globalRoot)
    } catch (err) {
      logger.error({ err }, '[task-orchestrator] Tick failed')
    }
  }

  /** Collect tasks that are ready to execute. */
  private collectCandidates(allTasks: TaskConfig[]): TaskConfig[] {
    const candidates: TaskConfig[] = []
    const doneTaskIds = new Set(
      allTasks.filter((t) => t.status === 'done').map((t) => t.id),
    )

    for (const task of allTasks) {
      if (task.status !== 'todo') continue
      if (!task.autoExecute) continue
      if (!task.enabled) continue

      // Check dependencies
      if (task.dependsOn && task.dependsOn.length > 0) {
        const allDepsComplete = task.dependsOn.every((depId) => doneTaskIds.has(depId))
        if (!allDepsComplete) continue
      }

      // Check cooldown period
      if (task.cooldownMs && task.cooldownMs > 0 && task.lastRunAt) {
        const elapsed = Date.now() - new Date(task.lastRunAt).getTime()
        if (elapsed < task.cooldownMs) continue
      }

      // Check retry backoff for tasks that previously failed
      if (task.consecutiveErrors > 0 && task.lastRunAt) {
        const backoffMs = Math.min(Math.pow(2, task.consecutiveErrors) * 60_000, 600_000)
        const elapsed = Date.now() - new Date(task.lastRunAt).getTime()
        if (elapsed < backoffMs) continue
      }

      candidates.push(task)
    }

    return candidates
  }

  /** Evaluate a single candidate task for execution. */
  private async evaluateCandidate(
    candidate: TaskConfig,
    globalRoot: string,
    projectRoot?: string | null,
    runningTasks?: TaskConfig[],
  ): Promise<void> {
    if (scheduleExecutor.isRunning(candidate.id)) return

    const running = runningTasks ?? listTasks(globalRoot).filter((t) => t.status === 'running')

    const cachedToken = this.tokenCache.get(candidate.id)

    if (running.length === 0) {
      // No conflicts possible, start immediately
      void scheduleExecutor.execute(candidate.id, globalRoot, projectRoot, cachedToken)
    } else {
      // Check for conflicts with running tasks
      const conflict = await this.checkConflict(candidate, running)
      if (!conflict.conflict) {
        void scheduleExecutor.execute(candidate.id, globalRoot, projectRoot, cachedToken)
      } else {
        // Conflict detected, delay
        appendActivityLog(candidate.id, {
          from: 'todo',
          to: 'todo',
          actor: 'agent',
          reason: `延迟执行：与运行中任务冲突 — ${conflict.reason}`,
        }, globalRoot, projectRoot ?? undefined)

        logger.info(
          { taskId: candidate.id, reason: conflict.reason },
          '[task-orchestrator] Task delayed due to conflict',
        )
      }
    }
  }

  /** Check for conflicts between a candidate and running tasks. */
  private async checkConflict(
    candidate: TaskConfig,
    runningTasks: TaskConfig[],
  ): Promise<{ conflict: boolean; reason: string }> {
    // Simple heuristic: if tasks operate on the same project, potential conflict
    // For now, use a simple rule-based check. LLM-based check can be added later.
    const candidateScope = candidate.scope
    for (const running of runningTasks) {
      if (running.scope === candidateScope && candidateScope === 'project') {
        // Same project scope → potential conflict
        return {
          conflict: true,
          reason: `与运行中的任务 "${running.name}" 在同一项目范围内`,
        }
      }
    }

    return { conflict: false, reason: '' }
  }

  /** Check for timed-out running tasks. */
  private checkTimeouts(allTasks: TaskConfig[], globalRoot: string): void {
    for (const task of allTasks) {
      if (task.status !== 'running') continue
      if (!task.lastRunAt) continue

      const elapsed = Date.now() - new Date(task.lastRunAt).getTime()
      if (elapsed > task.timeoutMs) {
        logger.warn({ taskId: task.id, elapsed }, '[task-orchestrator] Task timed out')
        scheduleExecutor.abort(task.id)
      }
    }
  }

  /** Auto-archive tasks that have been done for more than 7 days. */
  private checkAutoArchive(allTasks: TaskConfig[], globalRoot: string): void {
    const ARCHIVE_AFTER_MS = 7 * 24 * 60 * 60 * 1000
    const now = Date.now()

    for (const task of allTasks) {
      if (task.status !== 'done') continue

      const completedTime = task.completedAt ?? task.updatedAt
      const elapsed = now - new Date(completedTime).getTime()
      if (elapsed > ARCHIVE_AFTER_MS) {
        const success = archiveTask(task.id, globalRoot)
        if (success) {
          logger.info({ taskId: task.id }, '[task-orchestrator] Auto-archived completed task')
        }
      }
    }
  }
}

export const scheduleOrchestrator = new ScheduleOrchestrator()
