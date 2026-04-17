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

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/utils/trpc'
import { useLayoutState } from '@/hooks/use-layout-state'
import { Button } from '@openloaf/ui/button'
import { Input } from '@openloaf/ui/input'
import { Badge } from '@openloaf/ui/badge'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@openloaf/ui/context-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@openloaf/ui/popover'
import { Checkbox } from '@openloaf/ui/checkbox'
import { cn } from '@/lib/utils'
import {
  ArrowLeftRight,
  CheckCircle2,
  Circle,
  Clock,
  Filter,
  KanbanSquare,
  List,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { ScheduledTaskDialog } from './ScheduledTaskDialog'

// ─── Types ────────────────────────────────────────────────────────────

type TaskStatus = 'todo' | 'running' | 'review' | 'done' | 'cancelled'
type ReviewType = 'plan' | 'completion'
type Priority = 'urgent' | 'high' | 'medium' | 'low'
type TriggerMode = 'manual' | 'scheduled' | 'condition'

type TaskSchedule =
  | { type: 'once'; scheduleAt: string }
  | { type: 'interval'; intervalMs: number }
  | { type: 'cron'; cronExpression: string }

type TaskConfig = {
  id: string
  name: string
  description?: string
  status: TaskStatus
  reviewType?: ReviewType
  priority?: Priority
  triggerMode: TriggerMode
  schedule?: TaskSchedule
  agentName?: string
  enabled: boolean
  createdAt: string
  updatedAt: string
  completedAt?: string
  autoExecute: boolean
  executionSummary?: {
    currentStep?: string
    totalSteps?: number
    completedSteps?: number
    lastAgentMessage?: string
  }
  activityLog: Array<{
    timestamp: string
    from: string
    to: string
    reviewType?: string
    reason?: string
    actor: string
  }>
  [key: string]: unknown
}

type ViewMode = 'kanban' | 'list'

// ─── Helpers ──────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<Priority, string> = {
  urgent: 'bg-secondary text-destructive border-transparent',
  high: 'bg-secondary text-muted-foreground border-transparent',
  medium: 'bg-secondary text-foreground border-transparent',
  low: 'bg-secondary text-muted-foreground border-transparent',
}

const TRIGGER_COLORS: Record<TriggerMode, string> = {
  manual: 'bg-secondary text-muted-foreground border-transparent',
  scheduled: 'bg-secondary text-muted-foreground border-transparent',
  condition: 'bg-secondary text-muted-foreground border-transparent',
}

const PRIORITY_FILTER_COLORS: Record<Priority, { active: string; inactive: string }> = {
  urgent: {
    active: 'bg-destructive text-white',
    inactive: 'bg-secondary text-destructive hover:bg-accent',
  },
  high: {
    active: 'bg-muted-foreground text-white',
    inactive: 'bg-secondary text-muted-foreground hover:bg-accent',
  },
  medium: {
    active: 'bg-foreground text-white',
    inactive: 'bg-secondary text-foreground hover:bg-accent',
  },
  low: {
    active: 'bg-muted-foreground text-white',
    inactive: 'bg-secondary text-muted-foreground hover:bg-accent/80',
  },
}

const TRIGGER_FILTER_COLORS: Record<TriggerMode, { active: string; inactive: string }> = {
  manual: {
    active: 'bg-muted-foreground text-white',
    inactive: 'bg-secondary text-muted-foreground hover:bg-accent',
  },
  scheduled: {
    active: 'bg-muted-foreground text-white',
    inactive: 'bg-secondary text-muted-foreground hover:bg-accent',
  },
  condition: {
    active: 'bg-muted-foreground text-white',
    inactive: 'bg-secondary text-muted-foreground hover:bg-accent',
  },
}

const getPriorityLabels = (t: (key: string) => string): Record<Priority, string> => ({
  urgent: t('priority.urgent'),
  high: t('priority.high'),
  medium: t('priority.medium'),
  low: t('priority.low'),
})

const getTriggerLabels = (t: (key: string) => string): Record<TriggerMode, string> => ({
  manual: t('triggerMode.manual'),
  scheduled: t('triggerMode.scheduled'),
  condition: t('triggerMode.condition'),
})

const getStatusColumns = (t: (key: string) => string): { status: TaskStatus; label: string; icon: typeof Circle }[] => [
  { status: 'todo', label: t('status.todo'), icon: Circle },
  { status: 'running', label: t('status.running'), icon: Loader2 },
  { status: 'review', label: t('status.review'), icon: Clock },
  { status: 'done', label: t('status.done'), icon: CheckCircle2 },
]

const STATUS_FLAT_COLORS: Record<TaskStatus, { icon: string; badge: string; bg: string }> = {
  todo: {
    icon: 'text-foreground',
    badge: 'bg-secondary text-foreground',
    bg: 'bg-secondary/30',
  },
  running: {
    icon: 'text-muted-foreground',
    badge: 'bg-secondary text-muted-foreground',
    bg: 'bg-secondary/30',
  },
  review: {
    icon: 'text-muted-foreground',
    badge: 'bg-secondary text-muted-foreground',
    bg: 'bg-secondary/30',
  },
  done: {
    icon: 'text-muted-foreground',
    badge: 'bg-secondary text-muted-foreground',
    bg: 'bg-secondary/30',
  },
  cancelled: {
    icon: 'text-muted-foreground',
    badge: 'bg-secondary text-muted-foreground',
    bg: 'bg-secondary/30',
  },
}

/** Valid drag-to-status transitions per source status. */
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  todo: ['cancelled'],
  running: ['cancelled'],
  review: ['done', 'cancelled'],
  done: [],
  cancelled: [],
}

/** Check if a status transition is allowed via drag. */
function isValidTransition(from: TaskStatus, to: TaskStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

function formatTimeAgo(dateStr: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return t('messages.justNow')
  if (minutes < 60) return t('messages.minutesAgo', { minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('messages.hoursAgo', { hours })
  const days = Math.floor(hours / 24)
  return t('messages.daysAgo', { days })
}

function formatFullDate(dateStr: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr

  // 格式化为 "2026-03-05 14:30:25"
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/\//g, '-')
}

function formatSchedule(schedule: TaskSchedule | undefined, t: (key: string, opts?: Record<string, unknown>) => string): string | null {
  if (!schedule) return null

  if (schedule.type === 'once') {
    const date = new Date(schedule.scheduleAt)
    if (Number.isNaN(date.getTime())) return schedule.scheduleAt

    // 格式化为 "3月5日 08:00"
    return date.toLocaleString('zh-CN', {
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  if (schedule.type === 'interval') {
    const hours = schedule.intervalMs / (1000 * 60 * 60)
    const days = hours / 24

    if (days >= 1 && days % 1 === 0) {
      return days === 1 ? t('schedule.daily') : t('schedule.everyNDays', { days })
    }
    if (hours >= 1 && hours % 1 === 0) {
      return t('schedule.everyNHours', { hours })
    }
    const minutes = schedule.intervalMs / (1000 * 60)
    return t('schedule.everyNMinutes', { minutes })
  }

  if (schedule.type === 'cron') {
    return schedule.cronExpression
  }

  return null
}


// ─── Task Card ────────────────────────────────────────────────────────

const TaskCard = memo(function TaskCard({
  task,
  onResolveReview,
  onCancel,
  onOpenDetail,
}: {
  task: TaskConfig
  onResolveReview: (id: string, action: 'approve' | 'reject' | 'rework') => void
  onCancel: (id: string) => void
  onOpenDetail: (id: string) => void
}) {
  const { t } = useTranslation('tasks')
  const PRIORITY_LABELS = getPriorityLabels(t)
  const TRIGGER_LABELS = getTriggerLabels(t)
  const priority = task.priority ?? 'medium'
  const summary = task.executionSummary
  const isDraggable = VALID_TRANSITIONS[task.status]?.length > 0
  const canCancel = task.status === 'todo' || task.status === 'running' || task.status === 'review'

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !isDraggable,
  })

  const isDone = task.status === 'done'
  const isCancelled = task.status === 'cancelled'
  const isFinished = isDone || isCancelled

  const cardContent = (
    <div
      ref={setNodeRef}
      {...(isDraggable ? { ...listeners, ...attributes } : {})}
      className={cn(
        'group cursor-pointer rounded-3xl border bg-card p-3 shadow-none transition-colors hover:bg-accent/50',
        isDragging && 'opacity-50',
        isDraggable && 'touch-none',
        isFinished && 'opacity-70',
      )}
      onClick={() => onOpenDetail(task.id)}
    >
      {/* Header: title + priority */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {isDone ? (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : isCancelled ? (
            <XCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : null}
          <h4 className={cn('text-sm font-medium leading-tight line-clamp-2', isFinished && 'line-through decoration-muted-foreground/40')}>{task.name}</h4>
        </div>
        <Badge variant="outline" className={cn('shrink-0 text-[10px]', PRIORITY_COLORS[priority])}>
          {PRIORITY_LABELS[priority]}
        </Badge>
      </div>

      {/* Description */}
      {task.description && (
        <p className="mb-2 text-xs text-muted-foreground line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Tags row */}
      <div className="mb-2 flex flex-wrap gap-1">
        <Badge variant="outline" className={cn('text-[10px]', TRIGGER_COLORS[task.triggerMode as TriggerMode])}>
          {TRIGGER_LABELS[task.triggerMode]}
        </Badge>
        {task.triggerMode === 'scheduled' && task.schedule && (
          <Badge variant="secondary" className="text-[10px] bg-secondary text-muted-foreground border-transparent">
            {task.schedule.type === 'once' ? (
              <>{t('taskLabels.scheduleOnce')}</>
            ) : (
              <><Repeat className="mr-0.5 h-2.5 w-2.5" />{t('taskLabels.schedulePeriod')}</>
            )}
          </Badge>
        )}
        {task.schedule && formatSchedule(task.schedule, t) && (
          <Badge variant="secondary" className="text-[10px] bg-secondary text-muted-foreground border-transparent">
            <Clock className="mr-1 h-2.5 w-2.5" />
            {formatSchedule(task.schedule, t)}
          </Badge>
        )}
        {task.agentName && (
          <Badge variant="secondary" className="text-[10px]">
            {task.agentName}
          </Badge>
        )}
        {task.status === 'review' && task.reviewType === 'plan' && (
          <Badge variant="default" className="bg-muted-foreground/15 text-muted-foreground text-[10px]">
            {t('reviewType.plan')}
          </Badge>
        )}
        {task.status === 'review' && task.reviewType === 'completion' && (
          <Badge variant="default" className="bg-muted-foreground/15 text-muted-foreground text-[10px]">
            {t('reviewType.completion')}
          </Badge>
        )}
      </div>

      {/* Execution summary (running) */}
      {task.status === 'running' && summary && (
        <div className="mb-2">
          {summary.totalSteps && summary.completedSteps !== undefined && (
            <div className="mb-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{summary.currentStep ?? t('messages.executingRunning')}</span>
                <span>{summary.completedSteps}/{summary.totalSteps}</span>
              </div>
              <div className="mt-1 h-1 w-full rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(summary.completedSteps / summary.totalSteps) * 100}%` }}
                />
              </div>
            </div>
          )}
          {summary.lastAgentMessage && (
            <p className="text-[10px] text-muted-foreground line-clamp-1">
              {summary.lastAgentMessage}
            </p>
          )}
        </div>
      )}

      {/* Review actions */}
      {task.status === 'review' && (
        <div className="mt-2 flex gap-1" onClick={(e) => e.stopPropagation()}>
          {task.reviewType === 'plan' && (
            <>
              <Button
                size="sm"
                variant="default"
                className="h-6 text-xs"
                onClick={() => onResolveReview(task.id, 'approve')}
              >
                {t('actions.confirm')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs"
                onClick={() => onResolveReview(task.id, 'reject')}
              >
                {t('actions.reject')}
              </Button>
            </>
          )}
          {task.reviewType === 'completion' && (
            <>
              <Button
                size="sm"
                variant="default"
                className="h-6 text-xs"
                onClick={() => onResolveReview(task.id, 'approve')}
              >
                {t('actions.pass')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs"
                onClick={() => onResolveReview(task.id, 'rework')}
              >
                {t('actions.rework')}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{cardContent}</ContextMenuTrigger>
      <ContextMenuContent className="w-40">
        <ContextMenuItem
          icon={XCircle}
          variant="destructive"
          disabled={!canCancel}
          onSelect={() => onCancel(task.id)}
        >
          {t('task.delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})

// ─── Kanban Column ────────────────────────────────────────────────────

function KanbanColumn({
  status,
  label,
  icon: Icon,
  tasks,
  onResolveReview,
  onCancel,
  onOpenDetail,
  headerExtra,
}: {
  status: TaskStatus
  label: string
  icon: typeof Circle
  tasks: TaskConfig[]
  onResolveReview: (id: string, action: 'approve' | 'reject' | 'rework') => void
  onCancel: (id: string) => void
  onOpenDetail: (id: string) => void
  headerExtra?: React.ReactNode
}) {
  const { t } = useTranslation('tasks')
  const colors = STATUS_FLAT_COLORS[status]
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { status },
  })

  return (
    <div className="flex min-w-[240px] flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2 px-1">
        <Icon className={cn('h-4 w-4', colors.icon)} />
        <span className="text-sm font-medium">{label}</span>
        {headerExtra}
        <Badge variant="secondary" className={cn('ml-auto border-0 text-[10px]', colors.badge)}>
          {tasks.length}
        </Badge>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-1 flex-col gap-2 overflow-y-auto rounded-3xl p-2 transition-all',
          colors.bg,
          isOver && 'ring-2 ring-primary/50',
        )}
      >
        {tasks.length === 0 && (
          <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
            {t('messages.noTasks')}
          </div>
        )}
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onResolveReview={onResolveReview}
            onCancel={onCancel}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Filter Bar ───────────────────────────────────────────────────────

function FilterBar({
  search,
  onSearchChange,
  priorityFilter,
  onPriorityFilterChange,
  triggerFilter,
  onTriggerFilterChange,
}: {
  search: string
  onSearchChange: (v: string) => void
  priorityFilter: Priority[]
  onPriorityFilterChange: (v: Priority[]) => void
  triggerFilter: TriggerMode[]
  onTriggerFilterChange: (v: TriggerMode[]) => void
}) {
  const { t: tl } = useTranslation('tasks')
  const PRIORITY_LABELS = getPriorityLabels(tl)
  const TRIGGER_LABELS = getTriggerLabels(tl)
  const togglePriority = (p: Priority) => {
    if (priorityFilter.includes(p)) {
      onPriorityFilterChange(priorityFilter.filter((x) => x !== p))
    } else {
      onPriorityFilterChange([...priorityFilter, p])
    }
  }

  const toggleTrigger = (t: TriggerMode) => {
    if (triggerFilter.includes(t)) {
      onTriggerFilterChange(triggerFilter.filter((x) => x !== t))
    } else {
      onTriggerFilterChange([...triggerFilter, t])
    }
  }

  const priorityCount = priorityFilter.length
  const triggerCount = triggerFilter.length

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={tl('messages.searchPlaceholder')}
          className="h-7 w-44 rounded-3xl border-transparent bg-secondary pl-8 text-xs text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring"
        />
      </div>

      {/* Priority filter dropdown */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1 rounded-3xl px-2.5 py-1 text-[11px] font-medium transition-colors duration-150',
              'border border-transparent',
              priorityCount > 0
                ? 'bg-secondary text-foreground hover:bg-accent'
                : 'bg-secondary text-muted-foreground hover:bg-accent/80',
            )}
          >
            <Filter className="h-3 w-3" />
            {tl('filter.priority')}
            {priorityCount > 0 && (
              <span className="ml-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-white/25 px-1 text-[10px]">
                {priorityCount}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-40 p-1.5">
          {(['urgent', 'high', 'medium', 'low'] as Priority[]).map((p) => {
            const isActive = priorityFilter.includes(p)
            const colors = PRIORITY_FILTER_COLORS[p]
            return (
              <label
                key={p}
                className="flex cursor-pointer items-center gap-2 rounded-3xl px-2 py-1.5 text-xs transition-colors hover:bg-accent"
              >
                <Checkbox
                  checked={isActive}
                  onCheckedChange={() => togglePriority(p)}
                  className="h-3.5 w-3.5"
                />
                <span
                  className={cn(
                    'rounded-3xl px-2 py-0.5 text-[11px] font-medium',
                    isActive ? colors.active : colors.inactive,
                  )}
                >
                  {PRIORITY_LABELS[p]}
                </span>
              </label>
            )
          })}
        </PopoverContent>
      </Popover>

      {/* Trigger mode filter dropdown */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-1 rounded-3xl px-2.5 py-1 text-[11px] font-medium transition-colors duration-150',
              'border border-transparent',
              triggerCount > 0
                ? 'bg-secondary text-muted-foreground hover:bg-accent'
                : 'bg-secondary text-muted-foreground hover:bg-accent/80',
            )}
          >
            <Filter className="h-3 w-3" />
            {tl('filter.triggerMode')}
            {triggerCount > 0 && (
              <span className="ml-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-white/25 px-1 text-[10px]">
                {triggerCount}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-40 p-1.5">
          {(['manual', 'scheduled', 'condition'] as TriggerMode[]).map((t) => {
            const isActive = triggerFilter.includes(t)
            const colors = TRIGGER_FILTER_COLORS[t]
            return (
              <label
                key={t}
                className="flex cursor-pointer items-center gap-2 rounded-3xl px-2 py-1.5 text-xs transition-colors hover:bg-accent"
              >
                <Checkbox
                  checked={isActive}
                  onCheckedChange={() => toggleTrigger(t)}
                  className="h-3.5 w-3.5"
                />
                <span
                  className={cn(
                    'rounded-3xl px-2 py-0.5 text-[11px] font-medium',
                    isActive ? colors.active : colors.inactive,
                  )}
                >
                  {TRIGGER_LABELS[t]}
                </span>
              </label>
            )
          })}
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────

export default function TaskBoardPage({
  projectId,
}: {
  projectId?: string
}) {
  const { t } = useTranslation('tasks')
  const PRIORITY_LABELS = getPriorityLabels(t)
  const TRIGGER_LABELS = getTriggerLabels(t)
  const queryClient = useQueryClient()
  const pushStackItem = useLayoutState((state) => state.pushStackItem)
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<Priority[]>([])
  const [triggerFilter, setTriggerFilter] = useState<TriggerMode[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)

  const priorityLabels = useMemo(() => getPriorityLabels(t), [t])
  const triggerLabels = useMemo(() => getTriggerLabels(t), [t])
  const statusColumns = useMemo(() => getStatusColumns(t), [t])

  const { data: tasks = [], isLoading, refetch } = useQuery(
    trpc.scheduledTask.list.queryOptions(
      { projectId },
      { refetchInterval: 60_000, staleTime: 0, refetchOnMount: 'always' },
    ),
  )

  // 手动刷新功能
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await refetch()
    } finally {
      setIsRefreshing(false)
    }
  }, [refetch])

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

  const updateStatusMutation = useMutation(
    trpc.scheduledTask.updateStatus.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.scheduledTask.pathKey() }),
    }),
  )

  const deleteMutation = useMutation(
    trpc.scheduledTask.delete.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.scheduledTask.pathKey() }),
    }),
  )

  const [isClearingDone, setIsClearingDone] = useState(false)

  const handleClearDone = useCallback(async () => {
    const doneTasks = (tasks as TaskConfig[]).filter(
      (t) => t.status === 'done' || t.status === 'cancelled',
    )
    if (doneTasks.length === 0) return
    setIsClearingDone(true)
    try {
      for (const task of doneTasks) {
        await deleteMutation.mutateAsync({ id: task.id, projectId })
      }
    } finally {
      setIsClearingDone(false)
    }
  }, [tasks, deleteMutation, projectId])

  // DnD sensors
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 5 },
  })
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  })
  const sensors = useSensors(mouseSensor, touchSensor)

  const [activeTask, setActiveTask] = useState<TaskConfig | null>(null)

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const task = event.active.data.current?.task as TaskConfig | undefined
    setActiveTask(task ?? null)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTask(null)
      const { active, over } = event
      if (!over) return

      const task = active.data.current?.task as TaskConfig | undefined
      const targetStatus = over.data.current?.status as TaskStatus | undefined
      if (!task || !targetStatus) return
      if (task.status === targetStatus) return
      if (!isValidTransition(task.status, targetStatus)) return

      updateStatusMutation.mutate({ id: task.id, status: targetStatus, projectId })
    },
    [updateStatusMutation, projectId],
  )

  const onResolveReview = useCallback(
    (id: string, action: 'approve' | 'reject' | 'rework') => {
      resolveReviewMutation.mutate({ id, action, projectId })
    },
    [resolveReviewMutation, projectId],
  )

  const onCancel = useCallback(
    (id: string) => {
      cancelMutation.mutate({ id, status: 'cancelled', projectId })
    },
    [cancelMutation, projectId],
  )

  const onOpenDetail = useCallback(
    (id: string) => {
      const task = (tasks as TaskConfig[]).find((taskItem) => taskItem.id === id)
      pushStackItem({
        id: `task-detail:${id}`,
        sourceKey: `task-detail:${id}`,
        component: 'task-detail',
        title: task?.name ?? t('messages.detailTitle'),
        params: { taskId: id, projectId },
      })
    },
    [pushStackItem, tasks, projectId, t],
  )

  const activateAiChat = useCallback(() => {
    useLayoutState.getState().setRightChatCollapsed(false)
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('openloaf:chat-prefill-input', {
          detail: { text: t('messages.chatPrefill') },
        }),
      )
    }, 300)
  }, [t])

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let result = tasks as TaskConfig[]

    if (search) {
      const lower = search.toLowerCase()
      result = result.filter((t) => t.name.toLowerCase().includes(lower))
    }

    if (priorityFilter.length > 0) {
      result = result.filter((t) => priorityFilter.includes(t.priority ?? 'medium'))
    }

    if (triggerFilter.length > 0) {
      result = result.filter((t) => triggerFilter.includes(t.triggerMode as TriggerMode))
    }

    return result
  }, [tasks, search, priorityFilter, triggerFilter])

  // Group by status for Kanban
  const groupedTasks = useMemo(() => {
    const groups: Record<TaskStatus, TaskConfig[]> = {
      todo: [],
      running: [],
      review: [],
      done: [],
      cancelled: [],
    }
    for (const task of filteredTasks) {
      const status = task.status as TaskStatus
      if (groups[status]) groups[status].push(task)
    }
    return groups
  }, [filteredTasks])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          priorityFilter={priorityFilter}
          onPriorityFilterChange={setPriorityFilter}
          triggerFilter={triggerFilter}
          onTriggerFilterChange={setTriggerFilter}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-3xl px-2.5 text-xs font-medium text-muted-foreground shadow-none transition-colors duration-150 hover:bg-accent"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
          </Button>
          {(groupedTasks.done.length > 0 || groupedTasks.cancelled.length > 0) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 rounded-3xl px-2.5 text-xs font-medium text-muted-foreground shadow-none transition-colors duration-150 hover:bg-accent hover:text-destructive"
              onClick={handleClearDone}
              disabled={isClearingDone}
            >
              {isClearingDone ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-3.5 w-3.5" />
              )}
              {t('messages.clearDone')}
            </Button>
          )}
          <div className="flex gap-0.5 rounded-3xl bg-secondary p-0.5">
            <button
              type="button"
              className={cn(
                'rounded-3xl p-1.5 transition-colors duration-150',
                viewMode === 'kanban'
                  ? 'bg-background text-foreground shadow-none'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setViewMode('kanban')}
            >
              <KanbanSquare className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={cn(
                'rounded-3xl p-1.5 transition-colors duration-150',
                viewMode === 'list'
                  ? 'bg-background text-foreground shadow-none'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setViewMode('list')}
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
          <Button
            size="sm"
            className="h-7 rounded-3xl border-transparent bg-secondary px-3 text-xs font-medium text-foreground shadow-none transition-colors duration-150 hover:bg-accent"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('task.new')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-3xl bg-secondary px-3 text-xs font-medium text-muted-foreground shadow-none transition-colors duration-150 hover:bg-accent"
            onClick={activateAiChat}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {t('messages.createWithAi')}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : viewMode === 'kanban' ? (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex h-full gap-4">
              {statusColumns.map(({ status, label, icon }) => {
                // 最后一列（done）支持切换为 cancelled
                if (status === 'done') {
                  const finalStatus = showCancelled ? 'cancelled' : 'done'
                  const finalLabel = showCancelled ? t('status.cancelled') : label
                  const FinalIcon = showCancelled ? XCircle : icon
                  return (
                    <KanbanColumn
                      key="done-cancelled"
                      status={finalStatus}
                      label={finalLabel}
                      icon={FinalIcon}
                      tasks={groupedTasks[finalStatus] ?? []}
                      onResolveReview={onResolveReview}
                      onCancel={onCancel}
                      onOpenDetail={onOpenDetail}
                      headerExtra={
                        <button
                          type="button"
                          className="rounded-3xl p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          onClick={() => setShowCancelled((v) => !v)}
                          title={showCancelled ? t('status.done') : t('status.cancelled')}
                        >
                          <ArrowLeftRight className="h-3 w-3" />
                        </button>
                      }
                    />
                  )
                }
                return (
                  <KanbanColumn
                    key={status}
                    status={status}
                    label={label}
                    icon={icon}
                    tasks={groupedTasks[status] ?? []}
                    onResolveReview={onResolveReview}
                    onCancel={onCancel}
                    onOpenDetail={onOpenDetail}
                  />
                )
              })}
            </div>
            <DragOverlay>
              {activeTask ? (
                <div className="w-[240px] rounded-3xl border bg-card p-3 shadow-lg opacity-90">
                  <h4 className="text-sm font-medium line-clamp-2">{activeTask.name}</h4>
                  <Badge variant="outline" className={cn('mt-1 text-[10px]', PRIORITY_COLORS[activeTask.priority ?? 'medium'])}>
                    {PRIORITY_LABELS[activeTask.priority ?? 'medium']}
                  </Badge>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          /* List view - simplified table */
          <div className="space-y-2">
            {filteredTasks.map((task) => {
              const listDone = task.status === 'done'
              const listCancelled = task.status === 'cancelled'
              const listFinished = listDone || listCancelled
              return (
              <div
                key={task.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-3xl border p-3 transition-colors hover:bg-accent/50',
                  listFinished && 'opacity-70',
                )}
                onClick={() => onOpenDetail(task.id)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {listDone ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : listCancelled ? (
                      <XCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : null}
                    <span className={cn('text-sm font-medium', listFinished && 'line-through decoration-muted-foreground/40')}>{task.name}</span>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px]', PRIORITY_COLORS[task.priority ?? 'medium'])}
                    >
                      {PRIORITY_LABELS[task.priority ?? 'medium']}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {TRIGGER_LABELS[task.triggerMode as TriggerMode]}
                    </Badge>
                    {task.triggerMode === 'scheduled' && task.schedule && (
                      <Badge variant="secondary" className="text-[10px] bg-secondary text-muted-foreground border-transparent">
                        {task.schedule.type === 'once' ? (
                          <>{t('taskLabels.scheduleOnce')}</>
                        ) : (
                          <><Repeat className="mr-0.5 h-2.5 w-2.5" />{t('taskLabels.schedulePeriod')}</>
                        )}
                      </Badge>
                    )}
                  </div>
                  {task.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                      {task.description}
                    </p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px]',
                    task.status === 'todo'
                      ? 'bg-foreground/15 text-foreground'
                      : 'bg-muted-foreground/15 text-muted-foreground',
                  )}
                >
                  {statusColumns.find((c) => c.status === task.status)?.label ?? task.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {formatTimeAgo(task.updatedAt, t)}
                </span>
              </div>
              )
            })}
            {filteredTasks.length === 0 && (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                {t('messages.noTasks')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialog for creating new tasks */}
      <ScheduledTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: trpc.scheduledTask.pathKey() })}
        projectId={projectId}
        task={null}
      />
    </div>
  )
}
