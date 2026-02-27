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
import { CalendarClock, ExternalLink, ListTodo } from 'lucide-react'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { useTabs } from '@/hooks/use-tabs'
import type { AnyToolPart } from './shared/tool-utils'
import { getToolName, normalizeToolInput, isToolStreaming } from './shared/tool-utils'

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
  const isError = Boolean(part.errorText)

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
  const scheduleLabel = formatScheduleLabel(input.schedule)
  const hasSchedule = Boolean(input.schedule?.type)
  const TaskIcon = hasSchedule ? CalendarClock : ListTodo

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div className="overflow-hidden rounded-lg border bg-card text-card-foreground">
        {/* macOS 风格标题栏 */}
        <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2">
          <TrafficLights state={windowState} />
          <span className="flex-1" />
          <TaskIcon className="size-3 text-muted-foreground/60" />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {toolName}
          </span>
        </div>

        {/* 内容区 */}
        <div className="px-3 py-3">
          {/* 标题 */}
          <h4 className="text-sm font-medium leading-tight">{title}</h4>

          {/* 描述 */}
          {input.description && (
            <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{input.description}</p>
          )}

          {/* 错误信息 */}
          {part.errorText && (
            <div className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              {part.errorText}
            </div>
          )}

          {/* 底部：所有标签 + 查看看板 */}
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <Badge variant="outline" className={cn('text-[10px]', PRIORITY_COLORS[priority])}>
              {PRIORITY_LABELS[priority]}
            </Badge>
            <Badge variant="outline" className={cn('text-[10px]', STATUS_BADGE_COLORS[status])}>
              {STATUS_LABELS[status]}
            </Badge>
            {scheduleLabel && (
              <Badge
                variant="outline"
                className="bg-[#fef7e0] text-[10px] text-[#e37400] border-transparent dark:bg-amber-900/40 dark:text-amber-300"
              >
                {scheduleLabel}
              </Badge>
            )}
            {input.agentName && (
              <Badge variant="secondary" className="text-[10px]">
                {input.agentName}
              </Badge>
            )}
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
