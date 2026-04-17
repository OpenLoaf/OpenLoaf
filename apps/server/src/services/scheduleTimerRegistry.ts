/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { getOpenLoafDataRootDir } from '@openloaf/config'
import { Cron } from 'croner'
import { logger } from '@/common/logger'
import { listTasks, type TaskConfig } from './scheduleConfigService'
import { scheduleOrchestrator } from './scheduleOrchestrator'

type TimerEntry = {
  taskId: string
  timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>
  type: 'timeout' | 'interval'
}

/**
 * ScheduleTimerRegistry is responsible only for registering/unregistering timers.
 * When a timer fires, it delegates execution to ScheduleOrchestrator.
 */
class ScheduleTimerRegistry {
  private timers = new Map<string, TimerEntry>()
  private cronJobs = new Map<string, Cron>()
  private started = false

  /** Load all enabled scheduled tasks and register timers. */
  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    try {
      const globalRoot = getOpenLoafDataRootDir()
      const tasks = listTasks(globalRoot)
      const enabled = tasks.filter((t) => t.enabled && t.triggerMode === 'scheduled')
      for (const task of enabled) {
        this.registerTask(task)
      }
      logger.info(
        `[task-scheduler] Started with ${enabled.length} scheduled tasks`,
      )
    } catch (err) {
      logger.error({ err }, '[task-scheduler] Failed to start')
    }
  }

  /** Stop all timers and cron jobs. */
  stop(): void {
    for (const entry of this.timers.values()) {
      if (entry.type === 'timeout') {
        clearTimeout(entry.timer as ReturnType<typeof setTimeout>)
      } else {
        clearInterval(entry.timer as ReturnType<typeof setInterval>)
      }
    }
    this.timers.clear()

    for (const job of this.cronJobs.values()) {
      job.stop()
    }
    this.cronJobs.clear()
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
          void scheduleOrchestrator.enqueue(task.id)
        }, delay)
        this.timers.set(task.id, { taskId: task.id, timer, type: 'timeout' })
        break
      }
      case 'interval': {
        if (!schedule.intervalMs || schedule.intervalMs <= 0) return
        const timer = setInterval(() => {
          void scheduleOrchestrator.enqueue(task.id)
        }, schedule.intervalMs)
        this.timers.set(task.id, { taskId: task.id, timer, type: 'interval' })
        break
      }
      case 'cron': {
        if (!schedule.cronExpr) return
        try {
          const job = new Cron(schedule.cronExpr, {
            timezone: schedule.timezone ?? undefined,
          }, () => {
            void scheduleOrchestrator.enqueue(task.id)
          })
          this.cronJobs.set(task.id, job)
        } catch (err) {
          logger.error({ taskId: task.id, cronExpr: schedule.cronExpr, err },
            '[task-scheduler] Invalid cron expression, skipping task')
        }
        break
      }
    }
  }

  /** Unregister a task timer or cron job. */
  unregisterTask(taskId: string): void {
    const entry = this.timers.get(taskId)
    if (entry) {
      if (entry.type === 'timeout') {
        clearTimeout(entry.timer as ReturnType<typeof setTimeout>)
      } else {
        clearInterval(entry.timer as ReturnType<typeof setInterval>)
      }
      this.timers.delete(taskId)
    }

    const cronJob = this.cronJobs.get(taskId)
    if (cronJob) {
      cronJob.stop()
      this.cronJobs.delete(taskId)
    }
  }

  /** Validate a cron expression. Returns null if valid, error message if invalid. */
  validateCronExpr(cronExpr: string, timezone?: string | null): string | null {
    try {
      const job = new Cron(cronExpr, {
        timezone: timezone ?? undefined,
      })
      job.stop()
      return null
    } catch (err) {
      return err instanceof Error ? err.message : String(err)
    }
  }
}

export const scheduleTimerRegistry = new ScheduleTimerRegistry()
