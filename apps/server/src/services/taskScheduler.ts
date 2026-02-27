/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { getWorkspaceRootPath } from '@openloaf/api'
import { randomUUID } from 'node:crypto'
import { logger } from '@/common/logger'
import { listTasks, getTask, updateTask, type TaskConfig } from './taskConfigService'
import { appendRunLog } from './taskRunLogService'
import { runChatStream } from '@/ai/services/chat/chatStreamService'

type TimerEntry = {
  taskId: string
  timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>
  type: 'timeout' | 'interval'
}

type RunningTaskEntry = {
  sessionId: string
  startedAt: string
  abortController: AbortController
}

class TaskScheduler {
  private timers = new Map<string, TimerEntry>()
  private runningTasks = new Map<string, RunningTaskEntry>()
  private started = false

  /** Load all enabled tasks from file system and register timers. */
  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    try {
      const workspaceRoot = getWorkspaceRootPath()
      const tasks = listTasks(workspaceRoot)
      const enabled = tasks.filter((t) => t.enabled)
      for (const task of enabled) {
        this.registerTask(task)
      }
      logger.info(
        `[task-scheduler] Started with ${enabled.length} tasks`,
      )
    } catch (err) {
      logger.error({ err }, '[task-scheduler] Failed to start')
    }
  }

  /** Stop all timers. */
  stop(): void {
    for (const entry of this.timers.values()) {
      if (entry.type === 'timeout') {
        clearTimeout(entry.timer as ReturnType<typeof setTimeout>)
      } else {
        clearInterval(entry.timer as ReturnType<typeof setInterval>)
      }
    }
    this.timers.clear()
    // 逻辑：停止所有运行中的任务。
    for (const running of this.runningTasks.values()) {
      running.abortController.abort()
    }
    this.runningTasks.clear()
    this.started = false
  }

  /** Register a single task timer based on its schedule config. */
  registerTask(task: TaskConfig): void {
    if (!task.enabled || task.triggerMode !== 'scheduled') return
    this.unregisterTask(task.id)
    const schedule = task.schedule
    if (!schedule) return

    switch (schedule.type) {
      case 'once': {
        if (!schedule.scheduleAt) return
        const delay = new Date(schedule.scheduleAt).getTime() - Date.now()
        if (delay <= 0) return
        const timer = setTimeout(() => {
          void this.executeTask(task.id)
        }, delay)
        this.timers.set(task.id, { taskId: task.id, timer, type: 'timeout' })
        break
      }
      case 'interval': {
        if (!schedule.intervalMs || schedule.intervalMs <= 0) return
        const timer = setInterval(() => {
          void this.executeTask(task.id)
        }, schedule.intervalMs)
        this.timers.set(task.id, { taskId: task.id, timer, type: 'interval' })
        break
      }
      case 'cron': {
        if (!schedule.cronExpr) return
        const timer = setInterval(() => {
          if (this.shouldRunCron(schedule.cronExpr!, schedule.timezone)) {
            void this.executeTask(task.id)
          }
        }, 60_000)
        this.timers.set(task.id, { taskId: task.id, timer, type: 'interval' })
        break
      }
    }
  }

  /** Unregister a task timer. */
  unregisterTask(taskId: string): void {
    const entry = this.timers.get(taskId)
    if (!entry) return
    if (entry.type === 'timeout') {
      clearTimeout(entry.timer as ReturnType<typeof setTimeout>)
    } else {
      clearInterval(entry.timer as ReturnType<typeof setInterval>)
    }
    this.timers.delete(taskId)
  }

  /** Check if a task is currently running. */
  isRunning(taskId: string): boolean {
    return this.runningTasks.has(taskId)
  }

  /** Manually trigger a task (fire-and-forget). */
  async runTaskNow(taskId: string, projectRoot?: string | null): Promise<void> {
    if (this.runningTasks.has(taskId)) {
      logger.warn({ taskId }, '[task-scheduler] Task already running, skipping')
      return
    }
    await this.executeTask(taskId, projectRoot ?? null)
  }

  /** Execute a task: call Agent via runChatStream. */
  private async executeTask(taskId: string, projectRoot?: string | null): Promise<void> {
    const workspaceRoot = getWorkspaceRootPath()
    const startedAt = new Date().toISOString()
    const abortController = new AbortController()
    let sessionId = ''

    try {
      const task = getTask(taskId, workspaceRoot, projectRoot ?? undefined)
      if (!task || !task.enabled) return

      // 逻辑：防止同一任务并发执行。
      if (this.runningTasks.has(taskId)) return

      // 逻辑：生成 sessionId，isolated 模式每次唯一，shared 模式固定。
      sessionId = task.sessionMode === 'shared'
        ? `task-${taskId}`
        : `task-${taskId}-${randomUUID()}`

      logger.info({ taskId, name: task.name, sessionId }, '[task-scheduler] Executing task')

      // 逻辑：标记为运行中。
      this.runningTasks.set(taskId, { sessionId, startedAt, abortController })
      updateTask(taskId, {
        lastRunAt: startedAt,
        lastStatus: 'running',
        lastError: null,
        runCount: task.runCount + 1,
      }, workspaceRoot, projectRoot ?? undefined)

      // 逻辑：设置超时控制。
      const timeoutId = setTimeout(() => {
        abortController.abort()
      }, task.timeoutMs || 600_000)

      try {
        const instruction = typeof task.payload?.message === 'string'
          ? task.payload.message
          : `执行自动任务：${task.name}`

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
          requestSignal: abortController.signal,
        })

        // 逻辑：消费 SSE 流直到完成。
        if (response.body) {
          const reader = response.body.getReader()
          try {
            while (true) {
              const { done } = await reader.read()
              if (done) break
            }
          } finally {
            reader.releaseLock()
          }
        }
      } finally {
        clearTimeout(timeoutId)
      }

      // 逻辑：执行成功，更新状态。
      updateTask(taskId, {
        lastStatus: 'ok',
        lastError: null,
        consecutiveErrors: 0,
      }, workspaceRoot, projectRoot ?? undefined)

      appendRunLog(taskId, {
        trigger: 'scheduled',
        status: 'ok',
        agentSessionId: sessionId,
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(startedAt).getTime(),
      }, projectRoot ?? workspaceRoot)

      // 逻辑：单次任务执行后自动禁用。
      if (task.schedule?.type === 'once') {
        updateTask(taskId, { enabled: false }, workspaceRoot, projectRoot ?? undefined)
        this.unregisterTask(taskId)
      }
    } catch (err) {
      logger.error({ taskId, err }, '[task-scheduler] Task execution failed')
      try {
        const task = getTask(taskId, workspaceRoot, projectRoot ?? undefined)
        updateTask(taskId, {
          lastRunAt: new Date().toISOString(),
          lastStatus: 'error',
          lastError: err instanceof Error ? err.message : String(err),
          runCount: (task?.runCount ?? 0) + 1,
          consecutiveErrors: (task?.consecutiveErrors ?? 0) + 1,
        }, workspaceRoot, projectRoot ?? undefined)

        appendRunLog(taskId, {
          trigger: 'scheduled',
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
          agentSessionId: sessionId || undefined,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - new Date(startedAt).getTime(),
        }, projectRoot ?? workspaceRoot)
      } catch {
        // ignore update failure
      }
    } finally {
      this.runningTasks.delete(taskId)
    }
  }

  /** Simple cron expression matcher (minute-level). */
  private shouldRunCron(cronExpr: string, _timezone?: string | null): boolean {
    const now = new Date()
    const parts = cronExpr.trim().split(/\s+/)
    if (parts.length < 5) return false

    const minute = now.getMinutes()
    const hour = now.getHours()
    const dayOfMonth = now.getDate()
    const month = now.getMonth() + 1
    const dayOfWeek = now.getDay()

    return (
      matchCronField(parts[0]!, minute) &&
      matchCronField(parts[1]!, hour) &&
      matchCronField(parts[2]!, dayOfMonth) &&
      matchCronField(parts[3]!, month) &&
      matchCronField(parts[4]!, dayOfWeek)
    )
  }
}

/** Match a single cron field against a value. */
function matchCronField(field: string, value: number): boolean {
  if (field === '*') return true
  if (field.startsWith('*/')) {
    const step = Number.parseInt(field.slice(2), 10)
    return step > 0 && value % step === 0
  }
  const values = field.split(',').map((v) => Number.parseInt(v.trim(), 10))
  return values.includes(value)
}

export const taskScheduler = new TaskScheduler()