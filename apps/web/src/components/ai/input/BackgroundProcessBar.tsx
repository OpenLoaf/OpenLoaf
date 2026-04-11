/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import * as React from 'react'
import { useMutation } from '@tanstack/react-query'
import { BotIcon, Loader2, TerminalIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@/utils/trpc'
import { cn } from '@/lib/utils'
import {
  selectSessionBgTasks,
  useBackgroundProcesses,
} from '@/hooks/use-background-processes'

type BackgroundProcessBarProps = {
  sessionId?: string
  className?: string
}

const RECENT_WINDOW_MS = 3000

/**
 * Pill bar shown above ChatInput when the current session has at least one
 * running or recently-finished background task. Running tasks show a spinner
 * and a kill button; terminal states fade out after RECENT_WINDOW_MS.
 *
 * State source: `useBackgroundProcesses` (a zustand store updated by
 * ChatCoreProvider's onSessionUpdate subscription).
 */
export function BackgroundProcessBar({
  sessionId,
  className,
}: BackgroundProcessBarProps) {
  const tasks = useBackgroundProcesses(
    React.useMemo(() => selectSessionBgTasks(sessionId ?? ''), [sessionId]),
  )
  const removeTask = useBackgroundProcesses((s) => s.removeTask)
  const cancelMutation = useMutation(
    trpc.chat.cancelBackgroundProcess.mutationOptions(),
  )

  // Auto-prune terminal tasks after the recent window so the bar clears itself.
  React.useEffect(() => {
    if (!sessionId) return
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const task of tasks) {
      if (task.status === 'running') continue
      const age = Date.now() - (task.endTime ?? task.startTime)
      const remaining = Math.max(RECENT_WINDOW_MS - age, 0)
      timers.push(
        setTimeout(() => removeTask(sessionId, task.id), remaining),
      )
    }
    return () => {
      for (const t of timers) clearTimeout(t)
    }
  }, [tasks, sessionId, removeTask])

  if (!sessionId || tasks.length === 0) return null

  const handleCancel = async (taskId: string) => {
    try {
      const result = await cancelMutation.mutateAsync({ taskId, sessionId })
      if (result.status === 'not-found') {
        toast.error('Task no longer exists')
      }
    } catch (err) {
      toast.error('Failed to cancel background task', {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return (
    <div
      className={cn(
        'mx-2 mb-1 flex flex-wrap items-center gap-1.5 px-1',
        className,
      )}
    >
      {tasks.map((task) => {
        const isRunning = task.status === 'running'
        const isShell = task.kind === 'shell'
        const Icon = isShell ? TerminalIcon : BotIcon
        const label = truncate(task.description || task.command || task.id, 40)
        const tooltip = buildTooltip(task)
        return (
          <div
            key={task.id}
            title={tooltip}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors duration-150',
              pillStyle(task.status),
            )}
          >
            <Icon className="h-3 w-3 shrink-0" />
            <span className="truncate max-w-[16rem]">{label}</span>
            {isRunning ? (
              <>
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                <button
                  type="button"
                  onClick={() => handleCancel(task.id)}
                  disabled={cancelMutation.isPending}
                  className="ml-0.5 rounded-full p-0.5 opacity-60 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 transition"
                  aria-label="Cancel background task"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </>
            ) : (
              <span className="text-[10px] opacity-70">
                {formatTerminalLabel(task)}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function pillStyle(status: string): string {
  switch (status) {
    case 'running':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
    case 'completed':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
    case 'failed':
      return 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
    case 'killed':
      return 'bg-zinc-200 text-zinc-600 dark:bg-zinc-500/20 dark:text-zinc-300'
    default:
      return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-500/10 dark:text-zinc-400'
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function buildTooltip(task: {
  description: string
  command?: string
  pid?: number
  startTime: number
  status: string
  exitCode?: number
}): string {
  const lines = [task.description]
  if (task.command && task.command !== task.description) lines.push(task.command)
  if (task.pid) lines.push(`pid ${task.pid}`)
  lines.push(`started ${new Date(task.startTime).toLocaleTimeString()}`)
  if (task.exitCode != null) lines.push(`exit ${task.exitCode}`)
  return lines.join('\n')
}

function formatTerminalLabel(task: {
  status: string
  exitCode?: number
}): string {
  if (task.status === 'completed') return 'done'
  if (task.status === 'failed') return `exit ${task.exitCode ?? '?'}`
  if (task.status === 'killed') return 'killed'
  return task.status
}

export default BackgroundProcessBar
