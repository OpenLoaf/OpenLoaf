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
import { TrafficLights } from '@openloaf/ui/traffic-lights'
import { cn } from '@/lib/utils'
import {
  Archive,
  CalendarClock,
  CheckSquare,
  ExternalLink,
  ListTodo,
  Play,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { useTabs } from '@/hooks/use-tabs'
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
  label: string
  color: string
  badgeColor: string
}> = {
  create: {
    icon: ListTodo,
    label: '创建任务',
    color: 'text-[#1a73e8] dark:text-sky-300',
    badgeColor: 'bg-[#e8f0fe] text-[#1a73e8] border-transparent dark:bg-sky-900/40 dark:text-sky-300',
  },
  cancel: {
    icon: XCircle,
    label: '取消任务',
    color: 'text-[#d93025] dark:text-red-300',
    badgeColor: 'bg-[#fce8e6] text-[#d93025] border-transparent dark:bg-red-900/40 dark:text-red-300',
  },
  delete: {
    icon: Trash2,
    label: '删除任务',
    color: 'text-[#d93025] dark:text-red-300',
    badgeColor: 'bg-[#fce8e6] text-[#d93025] border-transparent dark:bg-red-900/40 dark:text-red-300',
  },
  run: {
    icon: Play,
    label: '启动任务',
    color: 'text-[#188038] dark:text-emerald-300',
    badgeColor: 'bg-[#e6f4ea] text-[#188038] border-transparent dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  resolve: {
    icon: CheckSquare,
    label: '审批任务',
    color: 'text-[#9334e6] dark:text-violet-300',
    badgeColor: 'bg-[#f3e8fd] text-[#9334e6] border-transparent dark:bg-violet-900/40 dark:text-violet-300',
  },
  archive: {
    icon: Archive,
    label: '归档任务',
    color: 'text-[#5f6368] dark:text-slate-400',
    badgeColor: 'bg-[#f1f3f4] text-[#5f6368] border-transparent dark:bg-slate-800/40 dark:text-slate-400',
  },
  cancelAll: {
    icon: XCircle,
    label: '批量取消',
    color: 'text-[#d93025] dark:text-red-300',
    badgeColor: 'bg-[#fce8e6] text-[#d93025] border-transparent dark:bg-red-900/40 dark:text-red-300',
  },
  deleteAll: {
    icon: Trash2,
    label: '批量删除',
    color: 'text-[#d93025] dark:text-red-300',
    badgeColor: 'bg-[#fce8e6] text-[#d93025] border-transparent dark:bg-red-900/40 dark:text-red-300',
  },
  archiveAll: {
    icon: Archive,
    label: '批量归档',
    color: 'text-[#5f6368] dark:text-slate-400',
    badgeColor: 'bg-[#f1f3f4] text-[#5f6368] border-transparent dark:bg-slate-800/40 dark:text-slate-400',
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<Priority, string> = {
  urgent: 'bg-[#fce8e6] text-[#d93025] border-transparent dark:bg-red-900/40 dark:text-red-300',
  high: 'bg-[#fef7e0] text-[#e37400] border-transparent dark:bg-amber-900/40 dark:text-amber-300',
  medium: 'bg-[#e8f0fe] text-[#1a73e8] border-transparent dark:bg-sky-900/40 dark:text-sky-300',
  low: 'bg-[#f1f3f4] text-[#5f6368] border-transparent dark:bg-slate-800/40 dark:text-slate-400',
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

const STATUS_BADGE_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-[#e8f0fe] text-[#1a73e8] border-transparent dark:bg-sky-900/40 dark:text-sky-300',
  running: 'bg-[#fef7e0] text-[#e37400] border-transparent dark:bg-amber-900/40 dark:text-amber-300',
  review: 'bg-[#f3e8fd] text-[#9334e6] border-transparent dark:bg-violet-900/40 dark:text-violet-300',
  done: 'bg-[#e6f4ea] text-[#188038] border-transparent dark:bg-emerald-900/40 dark:text-emerald-300',
  cancelled: 'bg-[#f1f3f4] text-[#5f6368] border-transparent dark:bg-slate-800/40 dark:text-slate-400',
}

const RESOLVE_ACTION_LABELS: Record<string, string> = {
  approve: '通过',
  reject: '拒绝',
  rework: '返工',
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
  const pushStackItem = useTabRuntime((state) => state.pushStackItem)
  const { activeTabId } = useTabs()
  const streaming = isToolStreaming(part)

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

  const windowState = isError
    ? 'error'
    : streaming
      ? 'running'
      : output
        ? 'success'
        : 'idle'

  const handleOpenTaskBoard = useCallback(() => {
    if (!activeTabId) return
    pushStackItem(activeTabId, {
      id: 'scheduled-tasks-page',
      sourceKey: 'scheduled-tasks-page',
      component: 'scheduled-tasks-page',
      title: '任务看板',
    })
  }, [activeTabId, pushStackItem])

  const toolName = getToolName(part)

  // ── Derive display fields ──────────────────────────────────────────

  // Title
  let title: string
  if (action === 'create') {
    title = input.title ?? output?.task?.name ?? '后台任务'
  } else if (isBatch) {
    title = config.label
  } else {
    title = output?.task?.name ?? input.taskId ?? config.label
  }

  // Determine status for badge
  const taskStatus = output?.task?.status ?? output?.newStatus as TaskStatus | undefined

  // Schedule label (create only)
  const scheduleLabel = action === 'create' ? formatScheduleLabel(input.schedule) : null
  const hasSchedule = action === 'create' && Boolean(input.schedule?.type)
  const DisplayIcon = hasSchedule ? CalendarClock : ActionIcon

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div className="overflow-hidden rounded-lg border bg-card text-card-foreground">
        {/* macOS 风格标题栏 */}
        <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2">
          <TrafficLights state={windowState} />
          <span className="flex-1" />
          <DisplayIcon className={cn('size-3', config.color, 'opacity-60')} />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {toolName}
          </span>
        </div>

        {/* 内容区 */}
        <div className="px-3 py-3">
          {/* 标题 */}
          <h4 className="text-sm font-medium leading-tight">{title}</h4>

          {/* 描述 (create) */}
          {action === 'create' && input.description && (
            <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{input.description}</p>
          )}

          {/* 审批动作说明 (resolve) */}
          {action === 'resolve' && input.resolveAction && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              审批动作：{RESOLVE_ACTION_LABELS[input.resolveAction] ?? input.resolveAction}
              {input.reason ? ` — ${input.reason}` : ''}
            </p>
          )}

          {/* 取消原因 (cancel) */}
          {action === 'cancel' && input.reason && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              原因：{input.reason}
            </p>
          )}

          {/* 批量操作结果 */}
          {isBatch && output && output.ok && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {output.message}
            </p>
          )}

          {/* 错误信息 */}
          {(part.errorText || (output?.ok === false && output?.error)) && (
            <div className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              {part.errorText || output?.error}
            </div>
          )}

          {/* 底部：标签 + 查看看板 */}
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {/* Action badge */}
            <Badge variant="outline" className={cn('text-[10px]', config.badgeColor)}>
              {config.label}
            </Badge>

            {/* Priority badge (create only) */}
            {action === 'create' && (
              <Badge variant="outline" className={cn('text-[10px]', PRIORITY_COLORS[input.priority ?? 'medium'])}>
                {PRIORITY_LABELS[input.priority ?? 'medium']}
              </Badge>
            )}

            {/* Status badge */}
            {taskStatus && STATUS_LABELS[taskStatus] && (
              <Badge variant="outline" className={cn('text-[10px]', STATUS_BADGE_COLORS[taskStatus])}>
                {STATUS_LABELS[taskStatus]}
              </Badge>
            )}

            {/* Schedule badge (create) */}
            {scheduleLabel && (
              <Badge
                variant="outline"
                className="bg-[#fef7e0] text-[10px] text-[#e37400] border-transparent dark:bg-amber-900/40 dark:text-amber-300"
              >
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

            {/* 查看看板按钮 */}
            {!streaming && (
              <button
                type="button"
                onClick={handleOpenTaskBoard}
                className="ml-auto inline-flex items-center gap-1 rounded-full border border-transparent bg-[#e8f0fe] px-2.5 py-1 text-[11px] font-medium text-[#1a73e8] transition-colors duration-150 hover:bg-[#d2e3fc] dark:bg-sky-900/40 dark:text-sky-300 dark:hover:bg-sky-900/60"
              >
                <ExternalLink className="size-3" />
                查看看板
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
