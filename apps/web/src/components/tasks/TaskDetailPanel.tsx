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

import { memo, useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/utils/trpc'
import { useWorkspace } from '@/components/workspace/workspaceContext'
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

const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: '紧急',
  high: '高',
  medium: '中',
  low: '低',
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '待办',
  running: '进行中',
  review: '审批',
  done: '已完成',
  cancelled: '已取消',
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-blue-500/15 text-blue-600',
  running: 'bg-amber-500/15 text-amber-600',
  review: 'bg-purple-500/15 text-purple-600',
  done: 'bg-green-500/15 text-green-600',
  cancelled: 'bg-zinc-500/15 text-zinc-500',
}

const ACTOR_LABELS: Record<string, string> = {
  system: '系统',
  user: '用户',
  agent: 'Agent',
  timeout: '超时',
}

const TAB_CONFIG: { key: Tab; label: string; icon: typeof FileText }[] = [
  { key: 'plan', label: '计划', icon: FileText },
  { key: 'activity', label: '活动', icon: Activity },
  { key: 'log', label: '日志', icon: ScrollText },
  { key: 'chat', label: '对话', icon: MessageSquare },
]

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ─── Activity Timeline ───────────────────────────────────────────────

function ActivityTimeline({ log }: { log: ActivityLogEntry[] }) {
  if (log.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        暂无活动记录
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
                {STATUS_LABELS[entry.to as TaskStatus] ?? entry.to}
              </Badge>
              {entry.reviewType && (
                <Badge variant="secondary" className="text-[10px]">
                  {entry.reviewType === 'plan' ? '计划确认' : '完成审查'}
                </Badge>
              )}
              <span className="text-muted-foreground">
                {ACTOR_LABELS[entry.actor] ?? entry.actor}
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
  workspaceId?: string
}

export const TaskDetailPanel = memo(function TaskDetailPanel({
  taskId,
  workspaceId,
}: TaskDetailPanelProps) {
  const { workspace } = useWorkspace()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('plan')
  const wsId = workspaceId ?? workspace?.id ?? ''

  const { data: task, isLoading } = useQuery(
    trpc.scheduledTask.getTaskDetail.queryOptions(
      taskId ? { id: taskId, workspaceId: wsId } : { id: '', workspaceId: wsId },
      { enabled: !!taskId },
    ),
  )

  const resolveReviewMutation = useMutation(
    trpc.scheduledTask.resolveReview.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [['scheduledTask']] }),
    }),
  )

  const cancelMutation = useMutation(
    trpc.scheduledTask.updateStatus.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [['scheduledTask']] }),
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
        任务不存在
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
              {STATUS_LABELS[status]}
            </Badge>
            <Badge variant="outline" className={cn('text-[10px]', PRIORITY_COLORS[priority])}>
              {PRIORITY_LABELS[priority]}
            </Badge>
          </div>
        </div>
        {task.description && (
          <p className="mt-1 text-xs text-muted-foreground">{task.description as string}</p>
        )}
        <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>创建: {formatDateTime(task.createdAt as string)}</span>
          {task.agentName && <span>Agent: {task.agentName as string}</span>}
        </div>

        {/* Progress bar for running tasks */}
        {status === 'running' && summary?.totalSteps && summary.completedSteps !== undefined && (
          <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{summary.currentStep ?? '执行中...'}</span>
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
        {TAB_CONFIG.map(({ key, label, icon: Icon }) => (
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
                {status === 'todo' ? '任务尚未开始执行' : '暂无计划内容'}
              </div>
            )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            对话记录将在任务执行时生成
          </div>
        )}

        {activeTab === 'log' && (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            执行日志将在任务执行时生成
          </div>
        )}

        {activeTab === 'activity' && <ActivityTimeline log={activityLog} />}
      </div>

      {/* Action bar */}
      {(status === 'review' || status === 'todo' || status === 'running') && (
        <div className="flex items-center justify-between border-t px-4 py-2">
          <div className="flex gap-2">
            {status === 'review' && reviewType === 'plan' && (
              <>
                <Button size="sm" className="h-7 text-xs" onClick={() => handleResolve('approve')}>
                  确认计划
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => handleResolve('reject')}
                >
                  拒绝
                </Button>
              </>
            )}
            {status === 'review' && reviewType === 'completion' && (
              <>
                <Button size="sm" className="h-7 text-xs" onClick={() => handleResolve('approve')}>
                  通过
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => handleResolve('rework')}
                >
                  返工
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
            取消任务
          </Button>
        </div>
      )}
    </div>
  )
})
