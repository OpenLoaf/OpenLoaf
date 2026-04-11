/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { EventEmitter } from 'events'
import type { TaskStatus, ReviewType, ExecutionSummary } from './scheduleConfigService'

export type ScheduleStatusChangeEvent = {
  taskId: string
  status: TaskStatus
  previousStatus: TaskStatus
  reviewType?: ReviewType
  title: string
  updatedAt: string
  sourceSessionId?: string
}

export type ScheduleSummaryUpdateEvent = {
  taskId: string
  summary: ExecutionSummary
}

export type ScheduleReportEvent = {
  taskId: string
  sourceSessionId: string
  status: 'completed' | 'failed'
  title: string
  summary: string
  agentName?: string
}

class ScheduleEventBus extends EventEmitter {
  emitStatusChange(event: ScheduleStatusChangeEvent) {
    this.emit('statusChange', event)
  }

  onStatusChange(listener: (event: ScheduleStatusChangeEvent) => void) {
    this.on('statusChange', listener)
    return () => {
      this.off('statusChange', listener)
    }
  }

  emitSummaryUpdate(event: ScheduleSummaryUpdateEvent) {
    this.emit('summaryUpdate', event)
  }

  onSummaryUpdate(listener: (event: ScheduleSummaryUpdateEvent) => void) {
    this.on('summaryUpdate', listener)
    return () => {
      this.off('summaryUpdate', listener)
    }
  }

  emitScheduleReport(event: ScheduleReportEvent) {
    this.emit('scheduleReport', event)
  }

  onScheduleReport(listener: (event: ScheduleReportEvent) => void) {
    this.on('scheduleReport', listener)
    return () => {
      this.off('scheduleReport', listener)
    }
  }
}

export const scheduleEventBus = new ScheduleEventBus()
