/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import { memo, useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/utils/trpc'
import { Button } from '@openloaf/ui/button'
import { Badge } from '@openloaf/ui/badge'
import { cn } from '@/lib/utils'
import {
  CheckCircle2,
  Circle,
  Clock,
  Loader2,
  XCircle,
  FileText,
  MessageSquare,
  ScrollText,
  Activity,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────

type TaskStatus = 'todo' | 'running' | 'review' | 'done' | 'cancelled'
type ReviewType = 'plan' | 'completion'
type Priority = 'urgent' | 'high' | 'medium' | 'low'

type ActivityLogEntry = {
  timestamp: string
  from: string
  to: string
  reviewType?: string
  reason?: string
  actor: string
}

type Tab = 'plan' | 'chat' | 'log' | 'activity'

// ─── Helpers ──────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<Priority, string> = {
  urgent: 'bg-red-500/15 text-red-600 border-red-500/20',
  high: 'bg-orange-500/15 text-orange-600 border-orange-500/20',
  medium: 'bg-blue-500/15 text-blue-600 border-blue-500/20',
  low: 'bg-zinc-500/15 text-zinc-500 border-zinc-500/20',
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-blue-500/15 text-blue-600',
  running: 'bg-amber-500/15 text-amber-600',
  review: 'bg-purple-500/15 text-purple-600',
  done: 'bg-green-500/15 text-green-600',
  cancelled: 'bg-zinc-500/15 text-zinc-500',
}

const getPriorityLabels = (t: (key: string) => string): Record<Priority, string> => ({
  urgent: t('priority.urgent'),
  high: t('priority.high'),
  medium: t('priority.medium'),
  low: t('priority.low'),
})

const getStatusLabels = (t: (key: string) => string): Record<TaskStatus, string> => ({
  todo: t('status.todo'),
  running: t('status.running'),
  review: t('status.review'),
  done: t('status.done'),
  cancelled: t('status.cancelled'),
})

const getActorLabels = (t: (key: string) => string): Record<string, string> => ({
  system: t('actorLabels.system'),
  user: t('actorLabels.user'),
  agent: t('actorLabels.agent'),
  timeout: t('actorLabels.timeout'),
})

const getTabConfig = (t: (key: string) => string): { key: Tab; label: string; icon: typeof FileText }[] => [
  { key: 'plan', label: t('tabs.plan'), icon: FileText },
  { key: 'activity', label: t('tabs.activity'), icon: Activity },
  { key: 'log', label: t('tabs.log'), icon: ScrollText },
  { key: 'chat', label: t('tabs.chat'), icon: MessageSquare },
]

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ─── Activity Timeline ───────────────────────────────────────────────

function ActivityTimeline({
  log,
  statusLabels,
  actorLabels,
  t,
}: {
  log: ActivityLogEntry[]
  statusLabels: Record<TaskStatus, string>
  actorLabels: Record<string, string>
  t: (key: string) => string
}) {
  if (log.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        {t('messages.noActivity')}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {[...log].reverse().map((entry, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="mt-1 h-2 w-2 rounded-full bg-primary" />
            {i < log.length - 1 && <div className="w-px flex-1 bg-border" />}
          </div>
          <div className="min-w-0 flex-1 pb-3">
            <div className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[entry.to as TaskStatus])}>
                {statusLabels[entry.to as TaskStatus] ?? entry.to}
              </Badge>
              {entry.reviewType && (
                <Badge variant="secondary" className="text-[10px]">
                  {entry.reviewType === 'plan' ? t('reviewType.plan') : t('reviewType.completion')}
                </Badge>
              )}
              <span className="text-muted-foreground">
                {actorLabels[entry.actor] ?? entry.actor}
              </span>
            </div>
            {entry.reason && (
              <p className="mt-1 text-xs text-muted-foreground">{entry.reason}</p>
            )}
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              {formatDateTime(entry.timestamp)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────

type TaskDetailPanelProps = {
  panelKey?: string
  tabId?: string
  taskId?: string
  projectId?: string
}

export const TaskDetailPanel = memo(function TaskDetailPanel({
  taskId,
  projectId,
}: TaskDetailPanelProps) {
  const { t } = useTranslation('tasks')
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('plan')

  const priorityLabels = useMemo(() => getPriorityLabels(t), [t])
  const statusLabels = useMemo(() => getStatusLabels(t), [t])
  const actorLabels = useMemo(() => getActorLabels(t), [t])
  const tabConfig = useMemo(() => getTabConfig(t), [t])

  const { data: task, isLoading } = useQuery(
    trpc.scheduledTask.getTaskDetail.queryOptions(
      taskId ? { id: taskId, projectId } : { id: '' },
      { enabled: !!taskId },
    ),
  )

  const resolveReviewMutation = useMutation(
    trpc.scheduledTask.resolveReview.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.scheduledTask.pathKey() }),
    }),
  )

  const cancelMutation = useMutation(
    trpc.scheduledTask.updateStatus.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.scheduledTask.pathKey() }),
    }),
  )

  const handleResolve = useCallback(
    (action: 'approve' | 'reject' | 'rework') => {
      if (!taskId) return
      resolveReviewMutation.mutate({ id: taskId, action })
    },
    [taskId, resolveReviewMutation],
  )

  const handleCancel = useCallback(() => {
    if (!taskId) return
    cancelMutation.mutate({ id: taskId, status: 'cancelled' })
  }, [taskId, cancelMutation])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('messages.taskNotFound')}
      </div>
    )
  }

  const status = (task.status ?? 'todo') as TaskStatus
  const priority = (task.priority ?? 'medium') as Priority
  const reviewType = task.reviewType as ReviewType | undefined
  const activityLog = (task.activityLog ?? []) as ActivityLogEntry[]
  const summary = task.executionSummary as {
    currentStep?: string
    totalSteps?: number
    completedSteps?: number
    lastAgentMessage?: string
  } | undefined

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-tight">{task.name}</h3>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[status])}>
              {statusLabels[status]}
            </Badge>
            <Badge variant="outline" className={cn('text-[10px]', PRIORITY_COLORS[priority])}>
              {priorityLabels[priority]}
            </Badge>
          </div>
        </div>
        {task.description && (
          <p className="mt-1 text-xs text-muted-foreground">{task.description as string}</p>
        )}
        <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>{t('detail.created')}: {formatDateTime(task.createdAt as string)}</span>
          {task.agentName && <span>{t('detail.agent')}: {task.agentName as string}</span>}
        </div>

        {/* Progress bar for running tasks */}
        {status === 'running' && summary?.totalSteps && summary.completedSteps !== undefined && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{summary.currentStep ?? t('messages.executingRunning')}</span>
              <span>{summary.completedSteps}/{summary.totalSteps}</span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(summary.completedSteps / summary.totalSteps) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        {tabConfig.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-4 py-2 text-xs font-medium transition-colors',
              activeTab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
            onClick={() => setActiveTab(key)}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'plan' && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            {summary?.lastAgentMessage ? (
              <p className="text-sm whitespace-pre-wrap">{summary.lastAgentMessage}</p>
            ) : (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                {status === 'todo' ? t('messages.notStarted') : t('messages.noPlanContent')}
              </div>
            )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            {t('messages.chatGeneratedOnExecution')}
          </div>
        )}

        {activeTab === 'log' && (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            {t('messages.logGeneratedOnExecution')}
          </div>
        )}

        {activeTab === 'activity' && (
          <ActivityTimeline log={activityLog} statusLabels={statusLabels} actorLabels={actorLabels} t={t} />
        )}
      </div>

      {/* Action bar */}
      {(status === 'review' || status === 'todo' || status === 'running') && (
        <div className="flex items-center justify-between border-t px-4 py-2">
          <div className="flex gap-2">
            {status === 'review' && reviewType === 'plan' && (
              <>
                <Button size="sm" className="h-7 text-xs" onClick={() => handleResolve('approve')}>
                  {t('detail.confirmPlan')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => handleResolve('reject')}
                >
                  {t('actions.reject')}
                </Button>
              </>
            )}
            {status === 'review' && reviewType === 'completion' && (
              <>
                <Button size="sm" className="h-7 text-xs" onClick={() => handleResolve('approve')}>
                  {t('actions.pass')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => handleResolve('rework')}
                >
                  {t('actions.rework')}
                </Button>
              </>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={handleCancel}
          >
            <XCircle className="mr-1 h-3.5 w-3.5" />
            {t('detail.cancelTask')}
          </Button>
        </div>
      )}
    </div>
  )
})
