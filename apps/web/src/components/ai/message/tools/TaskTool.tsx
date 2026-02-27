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
import { Badge } from '@openloaf/ui/badge'
import { Button } from '@openloaf/ui/button'
import { cn } from '@/lib/utils'
import { CheckCircle2, Circle, Clock, ExternalLink, Loader2, XCircle } from 'lucide-react'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { useTabs } from '@/hooks/use-tabs'
import { useWorkspace } from '@/components/workspace/workspaceContext'
import type { AnyToolPart } from './shared/tool-utils'
import { normalizeToolInput, isToolStreaming } from './shared/tool-utils'

// ─── Types ────────────────────────────────────────────────────────────

type TaskStatus = 'todo' | 'running' | 'review' | 'done' | 'cancelled'
type Priority = 'urgent' | 'high' | 'medium' | 'low'

type ScheduleInput = {
  type?: 'once' | 'interval' | 'cron'
  scheduleAt?: string
  intervalMs?: number
  cronExpr?: string
}

type CreateTaskInput = {
  actionName?: string
  title?: string
  description?: string
  priority?: Priority
  schedule?: ScheduleInput
  skipPlanConfirm?: boolean
  agentName?: string
}

type CreateTaskOutput = {
  taskId?: string
  status?: TaskStatus
  name?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<Priority, string> = {
  urgent: 'bg-red-500/15 text-red-600',
  high: 'bg-orange-500/15 text-orange-600',
  medium: 'bg-blue-500/15 text-blue-600',
  low: 'bg-zinc-500/15 text-zinc-500',
}

const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: '紧急',
  high: '高',
  medium: '中',
  low: '低',
}

const STATUS_ICONS: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  running: Loader2,
  review: Clock,
  done: CheckCircle2,
  cancelled: XCircle,
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '待办',
  running: '进行中',
  review: '审批',
  done: '已完成',
  cancelled: '已取消',
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'text-blue-600',
  running: 'text-amber-600',
  review: 'text-purple-600',
  done: 'text-green-600',
  cancelled: 'text-zinc-500',
}

function formatScheduleLabel(schedule?: ScheduleInput): string | null {
  if (!schedule?.type) return null
  switch (schedule.type) {
    case 'once':
      return schedule.scheduleAt
        ? `定时 · ${new Date(schedule.scheduleAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
        : '定时'
    case 'interval': {
      if (!schedule.intervalMs) return '周期'
      const ms = schedule.intervalMs
      if (ms >= 3600000) return `每 ${Math.round(ms / 3600000)} 小时`
      if (ms >= 60000) return `每 ${Math.round(ms / 60000)} 分钟`
      return `每 ${Math.round(ms / 1000)} 秒`
    }
    case 'cron':
      return schedule.cronExpr ? `cron: ${schedule.cronExpr}` : 'cron'
    default:
      return null
  }
}

// ─── Component ───────────────────────────────────────────────────────

export default function TaskTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { workspace } = useWorkspace()
  const pushStackItem = useTabRuntime((state) => state.pushStackItem)
  const { activeTabId } = useTabs()
  const streaming = isToolStreaming(part)

  const input = useMemo(() => {
    const raw = normalizeToolInput(part.input)
    return (raw && typeof raw === 'object' ? raw : {}) as CreateTaskInput
  }, [part.input])

  const output = useMemo(() => {
    if (!part.output) return null
    try {
      const parsed = typeof part.output === 'string' ? JSON.parse(part.output) : part.output
      return (parsed && typeof parsed === 'object' ? parsed : null) as CreateTaskOutput | null
    } catch {
      return null
    }
  }, [part.output])

  const taskId = output?.taskId
  const status = (output?.status ?? 'todo') as TaskStatus
  const priority = (input.priority ?? 'medium') as Priority
  const title = input.title ?? output?.name ?? '后台任务'

  const handleViewDetail = useCallback(() => {
    if (!taskId || !activeTabId) return
    pushStackItem(activeTabId, {
      id: `task-detail:${taskId}`,
      sourceKey: `task-detail:${taskId}`,
      component: 'task-detail',
      title: title,
      params: {
        taskId,
        workspaceId: workspace?.id,
      },
    })
  }, [taskId, activeTabId, pushStackItem, title, workspace?.id])

  const StatusIcon = STATUS_ICONS[status]

  return (
    <div className={cn('w-full min-w-0 rounded-lg border bg-card p-3', className)}>
      {/* Header */}
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <StatusIcon className={cn('h-3.5 w-3.5', STATUS_COLORS[status], status === 'running' && 'animate-spin')} />
        <span>{streaming ? '正在创建任务...' : '任务已创建'}</span>
      </div>

      {/* Title */}
      <h4 className="mb-1.5 text-sm font-medium leading-tight">{title}</h4>

      {/* Description */}
      {input.description && (
        <p className="mb-2 text-xs text-muted-foreground line-clamp-2">{input.description}</p>
      )}

      {/* Tags */}
      <div className="mb-2 flex flex-wrap gap-1">
        <Badge variant="outline" className={cn('text-[10px]', PRIORITY_COLORS[priority])}>
          {PRIORITY_LABELS[priority]}
        </Badge>
        <Badge variant="outline" className={cn('text-[10px]', STATUS_COLORS[status])}>
          {STATUS_LABELS[status]}
        </Badge>
        {input.schedule?.type && (
          <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-600">
            {formatScheduleLabel(input.schedule) ?? '定时'}
          </Badge>
        )}
        {input.agentName && (
          <Badge variant="secondary" className="text-[10px]">
            {input.agentName}
          </Badge>
        )}
      </div>

      {/* Actions */}
      {taskId && !streaming && (
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-xs"
            onClick={handleViewDetail}
          >
            <ExternalLink className="mr-1 h-3 w-3" />
            查看详情
          </Button>
        </div>
      )}

      {/* Error */}
      {part.errorText && (
        <div className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          {part.errorText}
        </div>
      )}
    </div>
  )
}
