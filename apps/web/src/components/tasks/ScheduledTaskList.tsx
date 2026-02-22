'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/utils/trpc'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tenas-ai/ui/table'
import { Button } from '@tenas-ai/ui/button'
import { Switch } from '@tenas-ai/ui/switch'
import { Badge } from '@tenas-ai/ui/badge'
import {
  Clock,
  FileText,
  Layers,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tenas-ai/ui/dropdown-menu'
import { ScheduledTaskDialog } from './ScheduledTaskDialog'
import { TaskRunLogPanel } from './TaskRunLogPanel'
import { FilterTab } from '@tenas-ai/ui/filter-tab'

type TaskConfig = {
  id: string
  name: string
  agentName?: string
  enabled: boolean
  triggerMode: string
  schedule?: {
    type: string
    cronExpr?: string
    intervalMs?: number
    scheduleAt?: string
    timezone?: string
  }
  condition?: {
    type: string
    preFilter?: Record<string, unknown>
    rule?: string
  }
  payload?: Record<string, unknown>
  sessionMode: string
  timeoutMs: number
  cooldownMs?: number
  lastRunAt?: string | null
  lastStatus?: string | null
  lastError?: string | null
  runCount: number
  consecutiveErrors: number
  createdAt: string
  updatedAt: string
  scope: string
  filePath: string
}

type FilterTab = 'all' | 'scheduled' | 'condition'

type ScheduledTaskListProps = {
  workspaceId: string
  projectId?: string
  showProjectColumn?: boolean
}

function formatTrigger(task: TaskConfig): { label: string; icon: typeof Clock } {
  if (task.triggerMode === 'condition') {
    const typeLabels: Record<string, string> = {
      email_received: '收到邮件',
      chat_keyword: '聊天关键词',
      file_changed: '文件变更',
    }
    return { label: typeLabels[task.condition?.type ?? ''] ?? '条件触发', icon: Zap }
  }
  const schedule = task.schedule
  if (!schedule) return { label: '-', icon: Clock }
  if (schedule.type === 'once' && schedule.scheduleAt) {
    return { label: `单次 ${new Date(schedule.scheduleAt).toLocaleString()}`, icon: Clock }
  }
  if (schedule.type === 'interval' && schedule.intervalMs) {
    const mins = Math.round(schedule.intervalMs / 60000)
    if (mins < 60) return { label: `每 ${mins} 分钟`, icon: Clock }
    const hours = Math.round(mins / 60)
    if (hours < 24) return { label: `每 ${hours} 小时`, icon: Clock }
    return { label: `每 ${Math.round(hours / 24)} 天`, icon: Clock }
  }
  if (schedule.type === 'cron' && schedule.cronExpr) {
    return { label: formatCronLabel(schedule.cronExpr), icon: Clock }
  }
  return { label: schedule.type, icon: Clock }
}

function formatCronLabel(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return expr
  const [minuteRaw, hourRaw, dom, , dow] = parts
  const minute = Number(minuteRaw)
  const hour = Number(hourRaw)
  if (Number.isNaN(minute) || Number.isNaN(hour)) return expr
  const time = `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`
  if (dom === '*' && dow === '*') {
    return `每天 ${time}`
  }
  if (dom === '*' && /^\d+$/.test(dow ?? '')) {
    const labelMap: Record<string, string> = {
      '0': '周日',
      '1': '周一',
      '2': '周二',
      '3': '周三',
      '4': '周四',
      '5': '周五',
      '6': '周六',
      '7': '周日',
    }
    return `每${labelMap[dow] ?? '周'} ${time}`
  }
  if (/^\d+$/.test(dom ?? '') && dow === '*') {
    return `每月${dom}日 ${time}`
  }
  return expr
}

function statusPill(status: string | null | undefined): { label: string; bg: string; fg: string } {
  switch (status) {
    case 'ok': return { label: '成功', bg: 'bg-emerald-50 dark:bg-emerald-950/40', fg: 'text-emerald-600 dark:text-emerald-400' }
    case 'error': return { label: '失败', bg: 'bg-rose-50 dark:bg-rose-950/40', fg: 'text-rose-600 dark:text-rose-400' }
    case 'skipped': return { label: '跳过', bg: 'bg-amber-50 dark:bg-amber-950/40', fg: 'text-amber-600 dark:text-amber-400' }
    default: return { label: '-', bg: '', fg: 'text-muted-foreground' }
  }
}

function formatTime(date: string | null | undefined): string {
  if (!date) return '-'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

export const ScheduledTaskList = memo(function ScheduledTaskList({
  workspaceId,
  projectId,
  showProjectColumn = false,
}: ScheduledTaskListProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskConfig | null>(null)
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [logTaskId, setLogTaskId] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const invalidateList = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.scheduledTask.list.pathKey() }),
    [queryClient],
  )
  const listQuery = useQuery(
    trpc.scheduledTask.list.queryOptions({ workspaceId, projectId }),
  )
  const allTasks = useMemo(() => listQuery.data ?? [], [listQuery.data])
  const tasks = useMemo(() => {
    if (filterTab === 'all') return allTasks
    return allTasks.filter((t) => t.triggerMode === filterTab)
  }, [allTasks, filterTab])
  const scheduledCount = useMemo(() => allTasks.filter((t) => t.triggerMode === 'scheduled').length, [allTasks])
  const conditionCount = useMemo(() => allTasks.filter((t) => t.triggerMode === 'condition').length, [allTasks])

  const updateMutation = useMutation(
    trpc.scheduledTask.update.mutationOptions({ onSuccess: invalidateList }),
  )
  const deleteMutation = useMutation(
    trpc.scheduledTask.delete.mutationOptions({ onSuccess: invalidateList }),
  )
  const runMutation = useMutation(
    trpc.scheduledTask.run.mutationOptions(),
  )

  const handleToggleEnabled = useCallback(
    (task: TaskConfig) => {
      updateMutation.mutate({
        id: task.id,
        enabled: !task.enabled,
        projectId: projectId || undefined,
      })
    },
    [updateMutation, projectId],
  )
  const handleDelete = useCallback(
    (task: TaskConfig) => {
      if (!window.confirm(`确定删除任务「${task.name}」？`)) return
      deleteMutation.mutate({ id: task.id, projectId: projectId || undefined })
    },
    [deleteMutation, projectId],
  )
  const handleRun = useCallback(
    (task: TaskConfig) => { runMutation.mutate({ id: task.id, projectId: projectId || undefined }) },
    [runMutation, projectId],
  )
  const handleEdit = useCallback((task: TaskConfig) => {
    setEditingTask(task)
    setDialogOpen(true)
  }, [])
  const handleCreate = useCallback(() => {
    setEditingTask(null)
    setDialogOpen(true)
  }, [])
  const handleDialogClose = useCallback(() => {
    setDialogOpen(false)
    setEditingTask(null)
  }, [])
  const handleDialogSuccess = useCallback(() => {
    setDialogOpen(false)
    setEditingTask(null)
    invalidateList()
  }, [invalidateList])

  const colSpan = 5

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold">自动任务</span>
          <span className="text-[12px] text-muted-foreground">按计划或条件触发，向 Agent 发送指令。</span>
        </div>
        <Button
          size="sm"
          className="h-8 rounded-full bg-[var(--btn-primary-bg,#0b57d0)] text-white shadow-none hover:bg-[var(--btn-primary-bg-hover,#0a4cbc)] dark:bg-sky-600 dark:hover:bg-sky-500"
          onClick={handleCreate}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          新建
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex w-fit rounded-full border border-border/40 bg-muted/30 p-1">
          <FilterTab
            text="全部"
            selected={filterTab === 'all'}
            onSelect={() => setFilterTab('all')}
            icon={<Layers className="h-3.5 w-3.5 text-violet-500" />}
            count={allTasks.length}
          />
          <FilterTab
            text="定时"
            selected={filterTab === 'scheduled'}
            onSelect={() => setFilterTab('scheduled')}
            icon={<Clock className="h-3.5 w-3.5 text-blue-500" />}
            count={scheduledCount}
          />
          <FilterTab
            text="条件"
            selected={filterTab === 'condition'}
            onSelect={() => setFilterTab('condition')}
            icon={<Zap className="h-3.5 w-3.5 text-amber-500" />}
            count={conditionCount}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border/40 overflow-hidden bg-background">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="w-[220px] text-[12px] font-medium text-muted-foreground">任务</TableHead>
              <TableHead className="text-[12px] font-medium text-muted-foreground">触发</TableHead>
              <TableHead className="text-[12px] font-medium text-muted-foreground">指令</TableHead>
              <TableHead className="text-[12px] font-medium text-muted-foreground">状态</TableHead>
              <TableHead className="w-[180px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-10 text-center text-xs text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-10 text-center text-xs text-muted-foreground">
                  暂无自动任务
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => {
                const status = statusPill(task.lastStatus)
                const trigger = formatTrigger(task)
                const TriggerIcon = trigger.icon
                const instruction = typeof task.payload?.message === 'string' ? task.payload.message : ''
                return (
                  <TableRow key={task.id} className="hover:bg-muted/20">
                    <TableCell>
                      <div className="flex items-start gap-2.5">
                        <Switch
                          checked={task.enabled}
                          onCheckedChange={() => handleToggleEnabled(task)}
                          className="mt-0.5 scale-[0.75] data-[state=checked]:bg-emerald-500"
                        />
                        <div>
                          <div className={`text-[13px] font-medium ${task.enabled ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                            {task.name}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {task.agentName ? `Agent：${task.agentName}` : 'Agent：默认'}
                            {showProjectColumn ? ` · Tab：${task.scope === 'project' ? '项目' : '工作区'}` : ''}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                        <TriggerIcon className="h-3 w-3 text-muted-foreground/60" />
                        {trigger.label}
                      </div>
                    </TableCell>
                    <TableCell>
                      {instruction ? (
                        <span className="block max-w-[260px] truncate text-[12px] text-muted-foreground" title={instruction}>
                          {instruction}
                        </span>
                      ) : (
                        <span className="text-[12px] text-muted-foreground/40">未设置</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {status.label !== '-' ? (
                          <Badge variant="secondary" className={`${status.bg} ${status.fg}`}>
                            {status.label}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground/60">未运行</Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground">{formatTime(task.lastRunAt)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          onClick={() => handleRun(task)}
                        >
                          <Play className="h-3.5 w-3.5" />
                          运行
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full"
                          onClick={() => handleEdit(task)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          编辑
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36 rounded-xl">
                            <DropdownMenuItem onClick={() => setLogTaskId(task.id)} className="rounded-lg text-xs">
                              <FileText className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                              执行日志
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(task)} className="rounded-lg text-xs text-rose-500 focus:text-rose-500">
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ScheduledTaskDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        onSuccess={handleDialogSuccess}
        workspaceId={workspaceId}
        projectId={projectId}
        task={editingTask}
      />

      <TaskRunLogPanel
        open={Boolean(logTaskId)}
        onOpenChange={(open) => { if (!open) setLogTaskId(null) }}
        taskId={logTaskId ?? ''}
        workspaceId={workspaceId}
        projectId={projectId}
      />
    </div>
  )
})

export default ScheduledTaskList
