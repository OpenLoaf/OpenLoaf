/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useEffect, useRef } from 'react'
import { useQuery, skipToken } from '@tanstack/react-query'
import { toast } from 'sonner'
import { trpc } from '@/utils/trpc'
import { isElectronEnv } from '@/utils/is-electron-env'
import { useWorkspace } from '@/components/workspace/workspaceContext'

type TaskSummary = {
  id: string
  name: string
  status: string
  reviewType?: string
}

/**
 * Hook that polls task status and shows toast notifications when tasks
 * transition to review or done status.
 */
export function useTaskNotifications() {
  const { workspace } = useWorkspace()
  const prevTasksRef = useRef<Map<string, string>>(new Map())

  const { data: tasks } = useQuery(
    trpc.scheduledTask.list.queryOptions(
      workspace ? { workspaceId: workspace.id } : skipToken,
      { refetchInterval: 15000 },
    ),
  )

  useEffect(() => {
    if (!tasks || !Array.isArray(tasks)) return

    const prevMap = prevTasksRef.current
    const nextMap = new Map<string, string>()

    for (const task of tasks as TaskSummary[]) {
      const key = `${task.status}:${task.reviewType ?? ''}`
      nextMap.set(task.id, key)

      const prevKey = prevMap.get(task.id)
      if (!prevKey || prevKey === key) continue

      // Status changed — show notification
      if (task.status === 'review') {
        const msg =
          task.reviewType === 'plan'
            ? `任务「${task.name}」计划已生成，等待确认`
            : `任务「${task.name}」执行完成，等待审查`
        toast(msg, { duration: 8000 })
        if (isElectronEnv()) {
          window.openloafElectron?.showNotification?.({
            title: '任务状态更新',
            body: msg,
            taskId: task.id,
          })
        }
      } else if (task.status === 'done') {
        const msg = `任务「${task.name}」已完成`
        toast.success(msg, { duration: 5000 })
        if (isElectronEnv()) {
          window.openloafElectron?.showNotification?.({
            title: '任务完成',
            body: msg,
            taskId: task.id,
          })
        }
      } else if (task.status === 'cancelled') {
        const msg = `任务「${task.name}」已取消`
        toast.error(msg, { duration: 5000 })
        if (isElectronEnv()) {
          window.openloafElectron?.showNotification?.({
            title: '任务取消',
            body: msg,
            taskId: task.id,
          })
        }
      }
    }

    prevTasksRef.current = nextMap

    // Listen for Electron notification clicks to navigate to task
    const handleNotificationClick = (e: Event) => {
      const detail = (e as CustomEvent<{ taskId?: string }>).detail
      if (detail?.taskId) {
        // Navigate to task board — dispatch custom event for TaskBoardPage to handle
        window.dispatchEvent(
          new CustomEvent('openloaf:task:navigate', { detail: { taskId: detail.taskId } })
        )
      }
    }
    window.addEventListener('openloaf:notification:click', handleNotificationClick)
    return () => {
      window.removeEventListener('openloaf:notification:click', handleNotificationClick)
    }
  }, [tasks])
}
