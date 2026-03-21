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

import { memo, useMemo, useCallback } from 'react'
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
import {
  MessageStreamMarkdown,
  MESSAGE_STREAM_MARKDOWN_CLASSNAME,
} from '@/components/ai/message/markdown/MessageStreamMarkdown'

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

// ─── Helpers ──────────────────────────────────────────────────────────

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-secondary text-foreground',
  running: 'bg-secondary text-muted-foreground',
  review: 'bg-secondary text-muted-foreground',
  done: 'bg-secondary text-muted-foreground',
  cancelled: 'bg-secondary text-muted-foreground',
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
  readOnly: true,
}

const READ_ONLY_TOOLS = {
  toolParts: {} as Record<string, any>,
  upsertToolPart: noop,
  markToolStreaming: noop,
  queueToolApprovalPayload: noop,
  clearToolApprovalPayload: noop,
  continueAfterToolApprovals: noop,
}

// ─── Right: Agent Message List ────────────────────────────────────────

function AgentOutputContent({
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
      include: { messages: true, siblingNav: true },
      includeToolOutput: true,
    }),
    enabled: !!sessionId,
    staleTime: status === 'running' ? 5_000 : 30_000,
    refetchInterval: status === 'running' ? 5_000 : false,
  })

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {status === 'todo' ? t('messages.notStarted') : t('messages.noPlanContent')}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const allMessages = (chatView?.messages ?? []) as UIMessage[]

  if (allMessages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {status === 'running' ? t('messages.executingRunning') : t('messages.noPlanContent')}
      </div>
    )
  }

  // Skip the first human message — it's the task instruction, shown in the left sidebar
  const firstIsUser = allMessages[0]?.role === 'user'
  const messages = firstIsUser ? allMessages.slice(1) : allMessages
  const leafMessageId = (chatView as any)?.leafMessageId ?? allMessages[allMessages.length - 1]?.id ?? null
  const branchMessageIds = (chatView as any)?.branchMessageIds ?? []
  const siblingNav = (chatView as any)?.siblingNav ?? {}

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
          branchMessageIds,
          siblingNav,
        }}>
          <ChatToolProvider value={READ_ONLY_TOOLS}>
            <MessageList projectId={projectId} />
          </ChatToolProvider>
        </ChatSessionProvider>
      </ChatActionsProvider>
    </ChatStateProvider>
  )
}

// ─── Left: History Timeline ───────────────────────────────────────────

function HistoryTimeline({
  taskId,
  projectId,
  activityLog,
  statusLabels,
  actorLabels,
  t,
}: {
  taskId: string
  projectId?: string
  activityLog: ActivityLogEntry[]
  statusLabels: Record<TaskStatus, string>
  actorLabels: Record<string, string>
  t: (key: string) => string
}) {
  const { data: logs = [], isLoading } = useQuery(
    trpc.scheduledTask.runLogs.queryOptions(
      { taskId, projectId, limit: 50 },
      { enabled: !!taskId },
    ),
  )

  const timeline = useMemo(() => {
    const items: Array<{ type: 'run' | 'activity'; timestamp: string; data: any }> = []
    for (const log of logs) {
      items.push({ type: 'run', timestamp: (log as any).startedAt ?? '', data: log })
    }
    for (const entry of activityLog) {
      items.push({ type: 'activity', timestamp: entry.timestamp, data: entry })
    }
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    return items
  }, [logs, activityLog])

  if (isLoading) {
    return (
      <div className="flex h-20 items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (timeline.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">
        {t('messages.noActivity')}
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {timeline.map((item, idx) => {
        const isLast = idx === timeline.length - 1

        if (item.type === 'run') {
          const log = item.data
          const isOk = log.status === 'ok'
          return (
            <div key={`run-${log.id}`} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <div className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                  isOk ? 'bg-secondary' : 'bg-secondary',
                )}>
                  {isOk
                    ? <CheckCircle2 className="h-2.5 w-2.5 text-muted-foreground" />
                    : <XCircle className="h-2.5 w-2.5 text-destructive" />
                  }
                </div>
                {!isLast && <div className="my-0.5 w-px flex-1 bg-border" />}
              </div>
              <div className="flex-1 pb-2.5">
                <div className="flex items-center justify-between">
                  <span className={cn('text-[11px] font-medium', isOk ? 'text-muted-foreground' : 'text-destructive')}>
                    {isOk ? t('schedule.statusLabels.ok') : t('schedule.statusLabels.error')}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDuration(log.durationMs)}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {formatDateTime(log.startedAt)}
                </div>
                {log.error && (
                  <div className="mt-1 break-all rounded-3xl bg-secondary px-2 py-1 text-[10px] text-destructive">
                    {log.error}
                  </div>
                )}
              </div>
            </div>
          )
        }

        const entry = item.data as ActivityLogEntry
        return (
          <div key={`act-${idx}`} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <div className="mt-1.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
              {!isLast && <div className="w-px flex-1 bg-border" />}
            </div>
            <div className="min-w-0 flex-1 pb-2.5">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className={cn('text-[10px] border-0 px-1.5 py-0', STATUS_COLORS[entry.to as TaskStatus])}>
                  {statusLabels[entry.to as TaskStatus] ?? entry.to}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {actorLabels[entry.actor] ?? entry.actor}
                </span>
              </div>
              {entry.reason && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">{entry.reason}</p>
              )}
              <span className="text-[10px] text-muted-foreground">
                {formatDateTime(entry.timestamp)}
              </span>
            </div>
          </div>
        )
      })}
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

  const statusLabels = useMemo(() => getStatusLabels(t), [t])
  const actorLabels = useMemo(() => getActorLabels(t), [t])

  const { data: task, isLoading } = useQuery(
    trpc.scheduledTask.getTaskDetail.queryOptions(
      taskId ? { id: taskId, projectId } : { id: '' },
      { enabled: !!taskId },
    ),
  )

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
  const agentName = (task.agentName as string) || undefined
  const description = (task.description as string)
    || ((task.payload as any)?.message as string)
    || ''
  const priority = (task.priority ?? 'medium') as string
  const triggerMode = (task.triggerMode as string) || 'manual'
  const createdAt = task.createdAt as string | undefined
  const canAct = status === 'review' || status === 'todo' || status === 'running'

  const agentSessionId = (task as any).sessionId
    || (runLogs.length > 0 ? (runLogs[0] as any)?.agentSessionId : undefined)

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* ── Left sidebar: Agent / Description / History ── */}
      <div className="flex w-80 shrink-0 flex-col border-r">
        {/* ① Agent avatar + name (centered, like agent creation page) */}
        <div className="shrink-0 border-b px-4 py-4">
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Bot className="h-6 w-6 text-muted-foreground" />
            </div>
            {agentName ? (
              <div className="text-sm font-semibold text-foreground">{agentName}</div>
            ) : null}
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className={cn(
                  'border-0 text-[10px] font-medium',
                  STATUS_COLORS[status],
                  status === 'running' && 'animate-pulse',
                )}
              >
                {statusLabels[status]}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {t(`priority.${priority}`)} &middot; {t(`triggerMode.${triggerMode}`)}
              </span>
            </div>
            {createdAt ? (
              <span className="text-[10px] text-muted-foreground">{formatDateTime(createdAt)}</span>
            ) : null}
          </div>
          {/* Actions */}
          {canAct ? (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {status === 'review' && reviewType === 'plan' && (
                <>
                  <Button
                    size="sm"
                    className="h-6 rounded-3xl bg-secondary px-3 text-[11px] font-medium text-foreground shadow-none transition-colors duration-150 hover:bg-accent"
                    onClick={() => handleResolve('approve')}
                  >
                    {t('detail.confirmPlan')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 rounded-3xl px-3 text-[11px] font-medium text-muted-foreground shadow-none hover:bg-accent"
                    onClick={() => handleResolve('reject')}
                  >
                    {t('actions.reject')}
                  </Button>
                </>
              )}
              {status === 'review' && reviewType === 'completion' && (
                <>
                  <Button
                    size="sm"
                    className="h-6 rounded-3xl bg-secondary px-3 text-[11px] font-medium text-muted-foreground shadow-none transition-colors duration-150 hover:bg-accent"
                    onClick={() => handleResolve('approve')}
                  >
                    {t('actions.pass')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 rounded-3xl px-3 text-[11px] font-medium text-muted-foreground shadow-none hover:bg-accent"
                    onClick={() => handleResolve('rework')}
                  >
                    {t('actions.rework')}
                  </Button>
                </>
              )}
              {status === 'todo' && (
                <Button
                  size="sm"
                  className="h-6 rounded-3xl bg-secondary px-3 text-[11px] font-medium text-foreground shadow-none transition-colors duration-150 hover:bg-accent"
                  onClick={handleRun}
                  disabled={runMutation.isPending}
                >
                  <Play className="mr-1 h-2.5 w-2.5" />
                  {t('schedule.run')}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 rounded-3xl px-2.5 text-[11px] text-destructive shadow-none hover:bg-secondary"
                onClick={handleCancel}
              >
                <XCircle className="mr-1 h-3 w-3" />
                {t('detail.cancelTask')}
              </Button>
            </div>
          ) : null}
        </div>

        {/* ② Task description (markdown) — main area, takes remaining space */}
        <div className="min-h-0 flex-1 overflow-y-auto border-b px-4 py-3">
          {description ? (
            <MessageStreamMarkdown
              markdown={description}
              className={cn(MESSAGE_STREAM_MARKDOWN_CLASSNAME, 'text-sm')}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {t('messages.noPlanContent')}
            </div>
          )}
        </div>

        {/* ③ History timeline — compact, pinned to bottom */}
        <div className="shrink-0 px-4 py-2.5">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('tabs.history')}
          </div>
          {taskId ? (
            <HistoryTimeline
              taskId={taskId}
              projectId={projectId}
              activityLog={activityLog}
              statusLabels={statusLabels}
              actorLabels={actorLabels}
              t={t}
            />
          ) : null}
        </div>
      </div>

      {/* ── Right: Agent message list ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AgentOutputContent
          sessionId={agentSessionId}
          status={status}
          projectId={projectId}
          t={t}
        />
      </div>
    </div>
  )
})
