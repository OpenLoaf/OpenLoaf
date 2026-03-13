/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useMemo } from 'react'
import { skipToken, useQuery } from '@tanstack/react-query'
import dayjs from '@openloaf/ui/calendar/lib/configs/dayjs-config'
import type { CalendarEvent as UiCalendarEvent } from '@openloaf/ui/calendar/components/types'
import { trpc } from '@/utils/trpc'

type TaskStatus = 'todo' | 'running' | 'review' | 'done' | 'cancelled'

/** Background colors for task events by status (light / dark handled via CSS). */
const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'var(--ol-blue)',
  running: 'var(--ol-amber)',
  review: 'var(--ol-purple)',
  done: 'var(--ol-green)',
  cancelled: 'var(--ol-text-auxiliary)',
}

export function useCalendarTasks({
  selectedProjectIds,
  showTasks,
}: {
  selectedProjectIds: Set<string>
  showTasks: boolean
}) {
  const { data: tasks = [] } = useQuery(
    trpc.scheduledTask.list.queryOptions(
      showTasks ? {} : skipToken,
      { staleTime: 60_000 },
    ),
  )

  const taskEvents = useMemo<UiCalendarEvent[]>(() => {
    if (!showTasks || tasks.length === 0) return []

    const results: UiCalendarEvent[] = []
    for (const task of tasks) {
      // Filter by selected projects (global-scope tasks always shown)
      if (task.scope === 'project' && task.projectId && !selectedProjectIds.has(task.projectId)) {
        continue
      }

      // Skip recurring tasks (cron / interval) in v1
      if (task.schedule?.type === 'cron' || task.schedule?.type === 'interval') {
        continue
      }

      // Determine task date
      let taskDate: dayjs.Dayjs | null = null
      if (task.triggerMode === 'scheduled' && task.schedule?.type === 'once' && task.schedule.scheduleAt) {
        taskDate = dayjs(task.schedule.scheduleAt)
      } else {
        taskDate = dayjs(task.createdAt)
      }

      if (!taskDate || !taskDate.isValid()) continue

      const status = task.status as TaskStatus
      const color = TASK_STATUS_COLORS[status] ?? TASK_STATUS_COLORS.todo

      results.push({
        id: `task-${task.id}`,
        title: task.name,
        start: taskDate.startOf('day'),
        end: taskDate.endOf('day'),
        allDay: true,
        color: '#ffffff',
        backgroundColor: color,
        data: {
          source: 'task',
          kind: 'task',
          taskId: task.id,
          status: task.status,
          priority: task.priority,
          projectId: task.projectId,
          readOnly: true,
        },
      })
    }
    return results
  }, [tasks, selectedProjectIds, showTasks])

  return { taskEvents, taskCount: taskEvents.length }
}
