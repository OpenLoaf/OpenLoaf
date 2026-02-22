import { getWorkspaceRootPath } from '@tenas-ai/api'
import { logger } from '@/common/logger'
import { listTasks, getTask, updateTask, type TaskConfig } from './taskConfigService'
import { appendRunLog } from './taskRunLogService'

type TimerEntry = {
  taskId: string
  timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>
  type: 'timeout' | 'interval'
}

class TaskScheduler {
  private timers = new Map<string, TimerEntry>()
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

  /** Manually trigger a task. */
  async runTaskNow(taskId: string, projectRoot?: string | null): Promise<void> {
    await this.executeTask(taskId, projectRoot ?? null)
  }

  /** Execute a task and update its record. */
  private async executeTask(taskId: string, projectRoot?: string | null): Promise<void> {
    const workspaceRoot = getWorkspaceRootPath()
    const startedAt = new Date().toISOString()
    try {
      const task = getTask(taskId, workspaceRoot, projectRoot ?? undefined)
      if (!task || !task.enabled) return

      logger.info({ taskId, name: task.name }, '[task-scheduler] Executing task')

      updateTask(taskId, {
        lastRunAt: new Date().toISOString(),
        lastStatus: 'ok',
        lastError: null,
        runCount: task.runCount + 1,
      }, workspaceRoot, projectRoot ?? undefined)

      // 逻辑：当前仅记录任务执行，具体动作由后续实现补齐。
      logger.info({ taskId }, '[task-scheduler] Task executed (stub)')

      appendRunLog(taskId, {
        trigger: 'scheduled',
        status: 'ok',
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
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - new Date(startedAt).getTime(),
        }, projectRoot ?? workspaceRoot)
      } catch {
        // ignore update failure
      }
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
