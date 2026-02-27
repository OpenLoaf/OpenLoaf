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
import type { TaskStatus, ReviewType, ExecutionSummary } from './taskConfigService'

export type TaskStatusChangeEvent = {
  taskId: string
  status: TaskStatus
  previousStatus: TaskStatus
  reviewType?: ReviewType
  title: string
  updatedAt: string
}

export type TaskSummaryUpdateEvent = {
  taskId: string
  summary: ExecutionSummary
}

class TaskEventBus extends EventEmitter {
  emitStatusChange(event: TaskStatusChangeEvent) {
    this.emit('statusChange', event)
  }

  onStatusChange(listener: (event: TaskStatusChangeEvent) => void) {
    this.on('statusChange', listener)
    return () => {
      this.off('statusChange', listener)
    }
  }

  emitSummaryUpdate(event: TaskSummaryUpdateEvent) {
    this.emit('summaryUpdate', event)
  }

  onSummaryUpdate(listener: (event: TaskSummaryUpdateEvent) => void) {
    this.on('summaryUpdate', listener)
    return () => {
      this.off('summaryUpdate', listener)
    }
  }
}

export const taskEventBus = new TaskEventBus()
