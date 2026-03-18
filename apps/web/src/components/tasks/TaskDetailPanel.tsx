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
import type { UIMessage } from '@ai-sdk/react'
import { trpc } from '@/utils/trpc'
import { Button } from '@openloaf/ui/button'
import { Badge } from '@openloaf/ui/badge'
import { cn } from '@/lib/utils'
import {
  CheckCircle2,
  Loader2,
  XCircle,
  ScrollText,
  Activity,
  Play,
  Bot,
} from 'lucide-react'
import {
  ChatStateProvider,
  ChatActionsProvider,
  ChatSessionProvider,
  ChatToolProvider,
} from '@/components/ai/context'
import MessageList from '@/components/ai/message/MessageList'

// ─── Types ────────────────────────────────────────────────────────────

type TaskStatus = 'todo' | 'running' | 'review' | 'done' | 'cancelled'
type ReviewType = 'plan' | 'completion'

type ActivityLogEntry = {
  timestamp: string
  from: string
  to: string
  reviewType?: string
  reason?: string
  actor: string
}

type Tab = 'output' | 'runs' | 'activity'

// ─── Helpers ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-ol-blue/15 text-ol-blue',
  running: 'bg-ol-amber/15 text-ol-amber',
  review: 'bg-ol-purple/15 text-ol-purple',
  done: 'bg-ol-green/15 text-ol-green',
  cancelled: 'bg-ol-text-auxiliary/15 text-ol-text-auxiliary',
}

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

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

// ─── No-op actions for read-only chat context ─────────────────────────

const noop = () => {}
const noopAsync = () => Promise.resolve(false)
const READ_ONLY_ACTIONS = {
  sendMessage: noop as any,
  regenerate: noop as any,
  addToolApprovalResponse: noop as any,
  clearError: noop,
  stopGenerating: noop,
  updateMessage: noop,
  newSession: noop,
  selectSession: noop,
  switchSibling: noop,
  retryAssistantMessage: noop,
  resendUserMessage: noop,
  deleteMessageSubtree: noopAsync as any,
  setPendingCloudMessage: noop,
  sendPendingCloudMessage: noop,
}

const READ_ONLY_TOOLS = {
  toolParts: {} as Record<string, any>,
  upsertToolPart: noop,
  markToolStreaming: noop,
  queueToolApprovalPayload: noop,
  clearToolApprovalPayload: noop,
  continueAfterToolApprovals: noop,
}

// ─── Agent Output Tab ─────────────────────────────────────────────────

function AgentOutputTab({
  sessionId,
  status,
  projectId,
  t,
}: {
  sessionId?: string
  status: TaskStatus
  projectId?: string
  t: (key: string) => string
}) {
  const { data: chatView, isLoading } = useQuery({
    ...trpc.chat.getChatView.queryOptions({
      sessionId: sessionId ?? '',
      window: { limit: 200 },
      include: { messages: true, siblingNav: false },
      includeToolOutput: true,
    }),
    enabled: !!sessionId,
    staleTime: status === 'running' ? 5_000 : 30_000,
    refetchInterval: status === 'running' ? 5_000 : false,
  })

  if (!sessionId) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        {status === 'todo' ? t('messages.notStarted') : t('messages.noPlanContent')}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const messages = (chatView?.messages ?? []) as UIMessage[]

  if (messages.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        {status === 'running' ? t('messages.executingRunning') : t('messages.noPlanContent')}
      </div>
    )
  }

  const leafMessageId = (chatView as any)?.leafMessageId ?? messages[messages.length - 1]?.id ?? null

  return (
    <ChatStateProvider value={{
      messages,
      status: 'ready',
      error: undefined,
      isHistoryLoading: false,
      stepThinking: false,
      pendingCloudMessage: null,
    }}>
      <ChatActionsProvider value={READ_ONLY_ACTIONS}>
        <ChatSessionProvider value={{
          sessionId: sessionId ?? '',
          projectId,
          leafMessageId,
          branchMessageIds: [],
          siblingNav: {},
        }}>
          <ChatToolProvider value={READ_ONLY_TOOLS}>
            <MessageList projectId={projectId} />
          </ChatToolProvider>
        </ChatSessionProvider>
      </ChatActionsProvider>
    </ChatStateProvider>
  )
}

// ─── Run Logs Tab ─────────────────────────────────────────────────────

function RunLogsTab({
  taskId,
  projectId,
  t,
}: {
  taskId: string
  projectId?: string
  t: (key: string) => string
}) {
  const { data: logs = [], isLoading } = useQuery(
    trpc.scheduledTask.runLogs.queryOptions(
      { taskId, projectId, limit: 50 },
      { enabled: !!taskId },
    ),
  )

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        {t('messages.logGeneratedOnExecution')}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {logs.map((log: any, idx: number) => {
        const isOk = log.status === 'ok'
        const isLast = idx === logs.length - 1
        return (
          <div key={log.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                isOk ? 'bg-ol-green-bg' : 'bg-ol-red-bg',
              )}>
                {isOk
                  ? <CheckCircle2 className="h-3 w-3 text-ol-green" />
                  : <XCircle className="h-3 w-3 text-ol-red" />
                }
              </div>
              {!isLast && <div className="my-1 w-px flex-1 bg-border/40" />}
            </div>
            <div className="flex-1 pb-3">
              <div className="flex items-center justify-between">
                <span className={cn('text-xs font-medium', isOk ? 'text-ol-green' : 'text-ol-red')}>
                  {isOk ? t('schedule.statusLabels.ok') : t('schedule.statusLabels.error')}
                </span>
                <span className="text-[11px] text-muted-foreground/60">
                  {formatDuration(log.durationMs)}
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {formatDateTime(log.startedAt)}
              </div>
              {log.error && (
                <div className="mt-1.5 break-all rounded-lg bg-ol-red-bg px-2.5 py-1.5 text-[11px] text-ol-red">
                  {log.error}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
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
  const [activeTab, setActiveTab] = useState<Tab>('output')

  const statusLabels = useMemo(() => getStatusLabels(t), [t])
  const actorLabels = useMemo(() => getActorLabels(t), [t])

  const tabConfig: { key: Tab; label: string; icon: typeof Bot }[] = useMemo(() => [
    { key: 'output', label: 'Agent', icon: Bot },
    { key: 'runs', label: t('tabs.log'), icon: ScrollText },
    { key: 'activity', label: t('tabs.activity'), icon: Activity },
  ], [t])

  const { data: task, isLoading } = useQuery(
    trpc.scheduledTask.getTaskDetail.queryOptions(
      taskId ? { id: taskId, projectId } : { id: '' },
      { enabled: !!taskId },
    ),
  )

  // Get the latest run log to find the agent session ID
  const { data: runLogs = [] } = useQuery(
    trpc.scheduledTask.runLogs.queryOptions(
      { taskId: taskId ?? '', projectId, limit: 1 },
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

  const runMutation = useMutation(
    trpc.scheduledTask.run.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.scheduledTask.pathKey() }),
    }),
  )

  const handleResolve = useCallback(
    (action: 'approve' | 'reject' | 'rework') => {
      if (!taskId) return
      resolveReviewMutation.mutate({ id: taskId, action, projectId })
    },
    [taskId, projectId, resolveReviewMutation],
  )

  const handleCancel = useCallback(() => {
    if (!taskId) return
    cancelMutation.mutate({ id: taskId, status: 'cancelled', projectId })
  }, [taskId, projectId, cancelMutation])

  const handleRun = useCallback(() => {
    if (!taskId) return
    runMutation.mutate({ id: taskId, projectId })
  }, [taskId, projectId, runMutation])

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
  const reviewType = task.reviewType as ReviewType | undefined
  const activityLog = (task.activityLog ?? []) as ActivityLogEntry[]
  const summary = task.executionSummary as {
    currentStep?: string
    totalSteps?: number
    completedSteps?: number
    lastAgentMessage?: string
  } | undefined

  // Resolve agent session ID: from task config or latest run log
  const agentSessionId = (task as any).sessionId
    || (runLogs.length > 0 ? (runLogs[0] as any)?.agentSessionId : undefined)

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Progress bar for running tasks */}
      {status === 'running' && summary?.totalSteps && summary.completedSteps !== undefined && (
        <div className="border-b px-4 py-2">
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
      <div className={cn(
        'flex-1 overflow-hidden',
        activeTab === 'output' ? 'flex flex-col' : 'overflow-auto p-4',
      )}>
        {activeTab === 'output' && (
          <AgentOutputTab
            sessionId={agentSessionId}
            status={status}
            projectId={projectId}
            t={t}
          />
        )}

        {activeTab === 'runs' && taskId && (
          <RunLogsTab
            taskId={taskId}
            projectId={projectId}
            t={t}
          />
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
            {status === 'todo' && (
              <Button
                size="sm"
                className="h-7 rounded-md bg-ol-blue-bg px-3 text-xs font-medium text-ol-blue shadow-none hover:bg-ol-blue-bg-hover"
                onClick={handleRun}
                disabled={runMutation.isPending}
              >
                <Play className="mr-1 h-3 w-3" />
                {t('schedule.run')}
              </Button>
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
