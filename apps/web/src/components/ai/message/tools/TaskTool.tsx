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

import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@openloaf/ui/badge'
import { Button } from '@openloaf/ui/button'
import { cn } from '@/lib/utils'
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  Circle,
  Clock,
  ExternalLink,
  ListTodo,
  Loader2,
  Play,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useLayoutState } from '@/hooks/use-layout-state'
import { useOptionalChatSession } from '@/components/ai/context/ChatSessionContext'
import type { AnyToolPart } from './shared/tool-utils'
import { getToolName, normalizeToolInput, isToolStreaming } from './shared/tool-utils'

// ─── Types ────────────────────────────────────────────────────────────

type TaskAction =
  | 'create'
  | 'cancel'
  | 'delete'
  | 'run'
  | 'resolve'
  | 'archive'
  | 'cancelAll'
  | 'deleteAll'
  | 'archiveAll'

type TaskStatus = 'todo' | 'running' | 'review' | 'done' | 'cancelled'
type Priority = 'urgent' | 'high' | 'medium' | 'low'

type ScheduleInput = {
  type?: 'once' | 'interval' | 'cron'
  scheduleAt?: string
  intervalMs?: number
  cronExpr?: string
}

type TaskManageInput = {
  actionName?: string
  action?: TaskAction
  title?: string
  description?: string
  priority?: Priority
  schedule?: ScheduleInput
  skipPlanConfirm?: boolean
  agentName?: string
  taskId?: string
  resolveAction?: 'approve' | 'reject' | 'rework'
  reason?: string
}

type TaskManageOutput = {
  ok?: boolean
  taskId?: string
  task?: {
    id?: string
    name?: string
    status?: TaskStatus
  }
  message?: string
  error?: string
  cancelled?: number
  deleted?: number
  archived?: number
  total?: number
  newStatus?: string
  resolveAction?: string
}

// ─── Action Config ────────────────────────────────────────────────────

const ACTION_CONFIG: Record<TaskAction, {
  icon: typeof ListTodo
  labelKey: string
  color: string
  badgeColor: string
}> = {
  create: {
    icon: ListTodo,
    labelKey: 'taskAction.create',
    color: 'text-ol-blue',
    badgeColor: 'bg-ol-blue-bg text-ol-blue border-transparent',
  },
  cancel: {
    icon: XCircle,
    labelKey: 'taskAction.cancel',
    color: 'text-ol-red',
    badgeColor: 'bg-ol-red-bg text-ol-red border-transparent',
  },
  delete: {
    icon: Trash2,
    labelKey: 'taskAction.delete',
    color: 'text-ol-red',
    badgeColor: 'bg-ol-red-bg text-ol-red border-transparent',
  },
  run: {
    icon: Play,
    labelKey: 'taskAction.run',
    color: 'text-ol-green',
    badgeColor: 'bg-ol-green-bg text-ol-green border-transparent',
  },
  resolve: {
    icon: CheckSquare,
    labelKey: 'taskAction.resolve',
    color: 'text-ol-purple',
    badgeColor: 'bg-ol-purple-bg text-ol-purple border-transparent',
  },
  archive: {
    icon: Archive,
    labelKey: 'taskAction.archive',
    color: 'text-ol-text-auxiliary',
    badgeColor: 'bg-ol-surface-muted text-ol-text-auxiliary border-transparent',
  },
  cancelAll: {
    icon: XCircle,
    labelKey: 'taskAction.cancelAll',
    color: 'text-ol-red',
    badgeColor: 'bg-ol-red-bg text-ol-red border-transparent',
  },
  deleteAll: {
    icon: Trash2,
    labelKey: 'taskAction.deleteAll',
    color: 'text-ol-red',
    badgeColor: 'bg-ol-red-bg text-ol-red border-transparent',
  },
  archiveAll: {
    icon: Archive,
    labelKey: 'taskAction.archiveAll',
    color: 'text-ol-text-auxiliary',
    badgeColor: 'bg-ol-surface-muted text-ol-text-auxiliary border-transparent',
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<Priority, string> = {
  urgent: 'bg-ol-red-bg text-ol-red border-transparent',
  high: 'bg-ol-amber-bg text-ol-amber border-transparent',
  medium: 'bg-ol-blue-bg text-ol-blue border-transparent',
  low: 'bg-ol-surface-muted text-ol-text-auxiliary border-transparent',
}

const STATUS_BADGE_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-ol-blue-bg text-ol-blue border-transparent',
  running: 'bg-ol-amber-bg text-ol-amber border-transparent',
  review: 'bg-ol-purple-bg text-ol-purple border-transparent',
  done: 'bg-ol-green-bg text-ol-green border-transparent',
  cancelled: 'bg-ol-surface-muted text-ol-text-auxiliary border-transparent',
}

const STATUS_ICONS: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  running: Loader2,
  review: Clock,
  done: CheckCircle2,
  cancelled: XCircle,
}

const RESOLVE_ACTION_KEYS: Record<string, string> = {
  approve: 'actions.pass',
  reject: 'actions.reject',
  rework: 'actions.rework',
}

// ─── Component ───────────────────────────────────────────────────────

export default function TaskTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { t } = useTranslation('tasks')
  const pushStackItem = useLayoutState((state) => state.pushStackItem)
  const chatSession = useOptionalChatSession()
  const projectId = chatSession?.projectId
  const streaming = isToolStreaming(part)

  const formatScheduleLabel = useCallback((schedule?: ScheduleInput): string | null => {
    if (!schedule?.type) return null
    switch (schedule.type) {
      case 'once':
        return schedule.scheduleAt
          ? `${t('taskLabels.scheduleOnce')} · ${new Date(schedule.scheduleAt).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
          : t('taskLabels.scheduleOnce')
      case 'interval': {
        if (!schedule.intervalMs) return t('taskLabels.schedulePeriod')
        const ms = schedule.intervalMs
        if (ms >= 3600000) return t('taskLabels.scheduleHours', { n: Math.round(ms / 3600000) })
        if (ms >= 60000) return t('taskLabels.scheduleMinutes', { n: Math.round(ms / 60000) })
        return t('taskLabels.scheduleSeconds', { n: Math.round(ms / 1000) })
      }
      case 'cron':
        return schedule.cronExpr ? `cron: ${schedule.cronExpr}` : 'cron'
      default:
        return null
    }
  }, [t])

  const input = useMemo(() => {
    const raw = normalizeToolInput(part.input)
    return (raw && typeof raw === 'object' ? raw : {}) as TaskManageInput
  }, [part.input])

  const output = useMemo<TaskManageOutput | null>(() => {
    if (!part.output) return null
    try {
      const parsed = typeof part.output === 'string' ? JSON.parse(part.output) : part.output
      return (parsed && typeof parsed === 'object' ? parsed : null) as TaskManageOutput | null
    } catch {
      return null
    }
  }, [part.output])

  // 向后兼容：旧的 create-task 工具没有 action 字段，默认为 create
  const action: TaskAction = input.action ?? 'create'
  const config = ACTION_CONFIG[action] ?? ACTION_CONFIG.create
  const ActionIcon = config.icon
  const isError = Boolean(part.errorText) || (output?.ok === false)
  const isBatch = action === 'cancelAll' || action === 'deleteAll' || action === 'archiveAll'

  const handleOpenTaskBoard = useCallback(() => {
    pushStackItem({
      id: 'scheduled-tasks-page',
      sourceKey: 'scheduled-tasks-page',
      component: 'scheduled-tasks-page',
      title: t('task.board'),
      params: projectId ? { projectId } : undefined,
    })
  }, [pushStackItem, t, projectId])

  const handleOpenTaskDetail = useCallback(() => {
    const taskId = output?.task?.id ?? output?.taskId
    if (!taskId) return
    pushStackItem({
      id: `task-detail:${taskId}`,
      sourceKey: `task-detail:${taskId}`,
      component: 'task-detail',
      title: output?.task?.name ?? t('taskLabels.background'),
      params: { taskId, projectId },
    })
  }, [pushStackItem, output, t, projectId])

  const toolName = getToolName(part)

  // ── Derive display fields ──────────────────────────────────────────

  const actionLabel = t(config.labelKey)

  // Title: 对于 create 操作，直接显示任务名称，不显示 "创建XXX的周期任务"
  let title: string
  if (action === 'create') {
    title = input.title ?? output?.task?.name ?? t('taskLabels.background')
  } else if (isBatch) {
    title = actionLabel
  } else {
    title = output?.task?.name ?? input.taskId ?? actionLabel
  }

  // Determine status for badge
  const taskStatus = output?.task?.status ?? output?.newStatus as TaskStatus | undefined
  const StatusIcon = taskStatus ? STATUS_ICONS[taskStatus] : Circle

  // Schedule label (create only)
  const scheduleLabel = action === 'create' ? formatScheduleLabel(input.schedule) : null
  const hasSchedule = action === 'create' && Boolean(input.schedule?.type)

  return (
    <div className={cn('w-full min-w-0', className)}>
      {/* 任务卡片样式 - 可点击 */}
      <div
        className="max-w-sm cursor-pointer overflow-hidden rounded-lg border bg-card p-3 shadow-none transition-colors hover:bg-accent/50"
        onClick={!streaming ? handleOpenTaskBoard : undefined}
      >
        {/* Header: 状态图标 + 标题 + 优先级 */}
        <div className="mb-2 flex items-start gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {taskStatus && (
              <StatusIcon
                className={cn(
                  'h-4 w-4 shrink-0',
                  taskStatus === 'running' && 'animate-spin',
                  taskStatus === 'todo' && 'text-ol-blue',
                  taskStatus === 'running' && 'text-ol-amber',
                  taskStatus === 'review' && 'text-ol-purple',
                  taskStatus === 'done' && 'text-ol-green',
                  taskStatus === 'cancelled' && 'text-ol-text-auxiliary',
                )}
              />
            )}
            <h4 className="text-sm font-medium leading-tight line-clamp-2 flex-1">{title}</h4>
          </div>
          {action === 'create' && (
            <Badge variant="outline" className={cn('shrink-0 text-[10px]', PRIORITY_COLORS[input.priority ?? 'medium'])}>
              {t(`priority.${input.priority ?? 'medium'}`)}
            </Badge>
          )}
        </div>

        {/* 描述 (create) - 不再显示，因为标题已经是任务名称 */}
        {action === 'create' && input.description && input.description !== title && (
          <p className="mb-2 text-xs text-muted-foreground line-clamp-2">{input.description}</p>
        )}

        {/* Tags row */}
        <div className="flex flex-wrap gap-1">
          {/* Action badge */}
          <Badge variant="outline" className={cn('text-[10px]', config.badgeColor)}>
            {actionLabel}
          </Badge>

          {/* Status badge */}
          {taskStatus && (
            <Badge variant="outline" className={cn('text-[10px]', STATUS_BADGE_COLORS[taskStatus])}>
              {t(`status.${taskStatus}`)}
            </Badge>
          )}

          {/* Schedule badge (create) */}
          {scheduleLabel && (
            <Badge
              variant="outline"
              className="bg-ol-amber-bg text-[10px] text-ol-amber border-transparent"
            >
              <CalendarClock className="mr-1 h-3 w-3" />
              {scheduleLabel}
            </Badge>
          )}

          {/* Agent badge (create) */}
          {action === 'create' && input.agentName && (
            <Badge variant="secondary" className="text-[10px]">
              {input.agentName}
            </Badge>
          )}

          {/* Batch count */}
          {isBatch && output && typeof (output.cancelled ?? output.deleted ?? output.archived) === 'number' && (
            <Badge variant="secondary" className="text-[10px]">
              {output.cancelled ?? output.deleted ?? output.archived}/{output.total ?? '?'}
            </Badge>
          )}
        </div>

        {/* 审批动作说明 (resolve) */}
        {action === 'resolve' && input.resolveAction && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('taskLabels.resolveAction')}{t(RESOLVE_ACTION_KEYS[input.resolveAction] ?? '') || input.resolveAction}
            {input.reason ? ` — ${input.reason}` : ''}
          </p>
        )}

        {/* 取消原因 (cancel) */}
        {action === 'cancel' && input.reason && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('taskLabels.cancelReason')}{input.reason}
          </p>
        )}

        {/* 批量操作结果 */}
        {isBatch && output && output.ok && (
          <p className="mt-2 text-xs text-muted-foreground">
            {output.message}
          </p>
        )}

        {/* 错误信息 */}
        {(part.errorText || (output?.ok === false && output?.error)) && (
          <div className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {part.errorText || output?.error}
          </div>
        )}
      </div>
    </div>
  )
}
