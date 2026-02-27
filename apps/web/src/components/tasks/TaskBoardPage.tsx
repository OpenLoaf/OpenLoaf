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

import { memo, useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/utils/trpc'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { useTabs } from '@/hooks/use-tabs'
import { Button } from '@openloaf/ui/button'
import { Input } from '@openloaf/ui/input'
import { Badge } from '@openloaf/ui/badge'
import { cn } from '@/lib/utils'
import {
  CheckCircle2,
  Circle,
  Clock,
  Filter,
  KanbanSquare,
  List,
  Loader2,
  Play,
  Plus,
  Search,
  X,
  FileText,
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
import { TaskTemplateDialog } from './TaskTemplateDialog'
import { useWorkspace } from '@/components/workspace/workspaceContext'

// ─── Types ────────────────────────────────────────────────────────────

type TaskStatus = 'todo' | 'running' | 'review' | 'done' | 'cancelled'
type ReviewType = 'plan' | 'completion'
type Priority = 'urgent' | 'high' | 'medium' | 'low'
type TriggerMode = 'manual' | 'scheduled' | 'condition'

type TaskConfig = {
  id: string
  name: string
  description?: string
  status: TaskStatus
  reviewType?: ReviewType
  priority?: Priority
  triggerMode: TriggerMode
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

const TRIGGER_LABELS: Record<TriggerMode, string> = {
  manual: '手动',
  scheduled: '定时',
  condition: '条件',
}

const STATUS_COLUMNS: { status: TaskStatus; label: string; icon: typeof Circle }[] = [
  { status: 'todo', label: '待办', icon: Circle },
  { status: 'running', label: '进行中', icon: Loader2 },
  { status: 'review', label: '审批', icon: Clock },
  { status: 'done', label: '已完成', icon: CheckCircle2 },
]

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

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
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
  const priority = task.priority ?? 'medium'
  const summary = task.executionSummary
  const isDraggable = VALID_TRANSITIONS[task.status]?.length > 0

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: !isDraggable,
  })

  return (
    <div
      ref={setNodeRef}
      {...(isDraggable ? { ...listeners, ...attributes } : {})}
      className={cn(
        'group cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition-colors hover:bg-accent/50',
        isDragging && 'opacity-50',
        isDraggable && 'touch-none',
      )}
      onClick={() => onOpenDetail(task.id)}
    >
      {/* Header: title + priority */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium leading-tight line-clamp-2">{task.name}</h4>
        <Badge variant="outline" className={cn('shrink-0 text-[10px]', PRIORITY_COLORS[priority])}>
          {PRIORITY_LABELS[priority]}
        </Badge>
      </div>

      {/* Tags row */}
      <div className="mb-2 flex flex-wrap gap-1">
        <Badge variant="secondary" className="text-[10px]">
          {TRIGGER_LABELS[task.triggerMode]}
        </Badge>
        {task.agentName && (
          <Badge variant="secondary" className="text-[10px]">
            {task.agentName}
          </Badge>
        )}
        {task.status === 'review' && task.reviewType === 'plan' && (
          <Badge variant="default" className="bg-amber-500/15 text-amber-600 text-[10px]">
            计划确认
          </Badge>
        )}
        {task.status === 'review' && task.reviewType === 'completion' && (
          <Badge variant="default" className="bg-green-500/15 text-green-600 text-[10px]">
            完成审查
          </Badge>
        )}
      </div>

      {/* Execution summary (running) */}
      {task.status === 'running' && summary && (
        <div className="mb-2">
          {summary.totalSteps && summary.completedSteps !== undefined && (
            <div className="mb-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{summary.currentStep ?? '执行中...'}</span>
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
                确认
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs"
                onClick={() => onResolveReview(task.id, 'reject')}
              >
                拒绝
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
                通过
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs"
                onClick={() => onResolveReview(task.id, 'rework')}
              >
                返工
              </Button>
            </>
          )}
        </div>
      )}

      {/* Footer: time + cancel */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {formatTimeAgo(task.updatedAt)}
        </span>
        {(task.status === 'todo' || task.status === 'running' || task.status === 'review') && (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); onCancel(task.id) }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
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
}: {
  status: TaskStatus
  label: string
  icon: typeof Circle
  tasks: TaskConfig[]
  onResolveReview: (id: string, action: 'approve' | 'reject' | 'rework') => void
  onCancel: (id: string) => void
  onOpenDetail: (id: string) => void
}) {
  const isRunning = status === 'running'
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { status },
  })

  return (
    <div className="flex min-w-[240px] flex-1 flex-col">
      <div className="mb-3 flex items-center gap-2 px-1">
        <Icon className={cn('h-4 w-4', isRunning && 'animate-spin')} />
        <span className="text-sm font-medium">{label}</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">
          {tasks.length}
        </Badge>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-1 flex-col gap-2 overflow-y-auto rounded-lg bg-muted/30 p-2 transition-all',
          isOver && 'ring-2 ring-primary/50',
        )}
      >
        {tasks.length === 0 && (
          <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
            暂无任务
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

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="搜索任务..."
          className="h-8 w-48 pl-7 text-xs"
        />
      </div>
      <div className="flex items-center gap-1">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {(['urgent', 'high', 'medium', 'low'] as Priority[]).map((p) => (
          <Badge
            key={p}
            variant={priorityFilter.includes(p) ? 'default' : 'outline'}
            className="cursor-pointer text-[10px]"
            onClick={() => togglePriority(p)}
          >
            {PRIORITY_LABELS[p]}
          </Badge>
        ))}
      </div>
      <div className="flex items-center gap-1">
        {(['manual', 'scheduled', 'condition'] as TriggerMode[]).map((t) => (
          <Badge
            key={t}
            variant={triggerFilter.includes(t) ? 'default' : 'outline'}
            className="cursor-pointer text-[10px]"
            onClick={() => toggleTrigger(t)}
          >
            {TRIGGER_LABELS[t]}
          </Badge>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────

export default function TaskBoardPage() {
  const { workspace } = useWorkspace()
  const queryClient = useQueryClient()
  const pushStackItem = useTabRuntime((state) => state.pushStackItem)
  const { activeTabId } = useTabs()
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<Priority[]>([])
  const [triggerFilter, setTriggerFilter] = useState<TriggerMode[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)

  const workspaceId = workspace?.id ?? ''

  const { data: tasks = [], isLoading } = useQuery(
    trpc.scheduledTask.list.queryOptions({ workspaceId }),
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

  const updateStatusMutation = useMutation(
    trpc.scheduledTask.updateStatus.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: [['scheduledTask']] }),
    }),
  )

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

      updateStatusMutation.mutate({ id: task.id, status: targetStatus })
    },
    [updateStatusMutation],
  )

  const onResolveReview = useCallback(
    (id: string, action: 'approve' | 'reject' | 'rework') => {
      resolveReviewMutation.mutate({ id, action })
    },
    [resolveReviewMutation],
  )

  const onCancel = useCallback(
    (id: string) => {
      cancelMutation.mutate({ id, status: 'cancelled' })
    },
    [cancelMutation],
  )

  const onOpenDetail = useCallback(
    (id: string) => {
      if (!activeTabId) return
      const task = (tasks as TaskConfig[]).find((t) => t.id === id)
      pushStackItem(activeTabId, {
        id: `task-detail:${id}`,
        sourceKey: `task-detail:${id}`,
        component: 'task-detail',
        title: task?.name ?? '任务详情',
        params: { taskId: id, workspaceId },
      })
    },
    [activeTabId, pushStackItem, tasks, workspaceId],
  )

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

  if (!workspace) return null

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">任务</h2>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            priorityFilter={priorityFilter}
            onPriorityFilterChange={setPriorityFilter}
            triggerFilter={triggerFilter}
            onTriggerFilterChange={setTriggerFilter}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border">
            <Button
              variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 rounded-r-none px-2"
              onClick={() => setViewMode('kanban')}
            >
              <KanbanSquare className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 rounded-l-none px-2"
              onClick={() => setViewMode('list')}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
          <Button size="sm" className="h-7" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            新建任务
          </Button>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setTemplateDialogOpen(true)}>
            <FileText className="mr-1 h-3.5 w-3.5" />
            从模板创建
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
              {STATUS_COLUMNS.map(({ status, label, icon }) => (
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
              ))}
            </div>
            <DragOverlay>
              {activeTask ? (
                <div className="w-[240px] rounded-lg border bg-card p-3 shadow-lg opacity-90">
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
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
                onClick={() => onOpenDetail(task.id)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{task.name}</span>
                    <Badge
                      variant="outline"
                      className={cn('text-[10px]', PRIORITY_COLORS[task.priority ?? 'medium'])}
                    >
                      {PRIORITY_LABELS[task.priority ?? 'medium']}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {TRIGGER_LABELS[task.triggerMode as TriggerMode]}
                    </Badge>
                  </div>
                  {task.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-1">
                      {task.description}
                    </p>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={cn('text-[10px]', {
                    'bg-blue-500/15 text-blue-600': task.status === 'todo',
                    'bg-amber-500/15 text-amber-600': task.status === 'running',
                    'bg-purple-500/15 text-purple-600': task.status === 'review',
                    'bg-green-500/15 text-green-600': task.status === 'done',
                    'bg-zinc-500/15 text-zinc-500': task.status === 'cancelled',
                  })}
                >
                  {STATUS_COLUMNS.find((c) => c.status === task.status)?.label ?? task.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {formatTimeAgo(task.updatedAt)}
                </span>
              </div>
            ))}
            {filteredTasks.length === 0 && (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                暂无任务
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialog for creating new tasks */}
      <ScheduledTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: [['scheduledTask']] })}
        workspaceId={workspaceId}
        task={null}
      />
      <TaskTemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        workspaceId={workspaceId}
      />
    </div>
  )
}
