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
  description?: string
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
  taskType: string
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
    return { label: schedule.cronExpr, icon: Clock }
  }
  return { label: schedule.type, icon: Clock }
}

function formatTaskType(type: string): string {
  switch (type) {
    case 'chat': return '对话'
    case 'summary': return '汇总'
    case 'custom': return '自定义'
    default: return type
  }
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
    (task: TaskConfig) => { updateMutation.mutate({ id: task.id, enabled: !task.enabled }) },
    [updateMutation],
  )
  const handleDelete = useCallback(
    (task: TaskConfig) => {
      if (!window.confirm(`确定删除任务「${task.name}」？`)) return
      deleteMutation.mutate({ id: task.id })
    },
    [deleteMutation],
  )
  const handleRun = useCallback(
    (task: TaskConfig) => { runMutation.mutate({ id: task.id }) },
    [runMutation],
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

  const colSpan = (showProjectColumn ? 8 : 7)

  return (
    <div className="flex flex-col gap-4">
      {/* Tabs + 新建按钮 */}
      <div className="flex items-center justify-between">
        <div className="flex w-fit rounded-full bg-muted/60 p-1 dark:bg-muted/40">
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
        <Button
          size="sm"
          className="h-8 rounded-lg bg-blue-500 text-white shadow-none hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
          onClick={handleCreate}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          新建
        </Button>
      </div>

      {/* 表格 */}
      <div className="rounded-xl border border-border/60 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-[200px] text-xs font-medium text-muted-foreground">名称</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">触发方式</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">类型</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">Agent</TableHead>
              {showProjectColumn ? <TableHead className="text-xs font-medium text-muted-foreground">作用域</TableHead> : null}
              <TableHead className="text-xs font-medium text-muted-foreground">状态</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground">上次执行</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-12 text-center text-xs text-muted-foreground">
                  加载中...
                </TableCell>
              </TableRow>
            ) : tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <Zap className="h-8 w-8 text-muted-foreground/30" />
                    <span className="text-xs text-muted-foreground">暂无自动任务</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => {
                const status = statusPill(task.lastStatus)
                const trigger = formatTrigger(task)
                const TriggerIcon = trigger.icon
                return (
                  <TableRow key={task.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Switch
                          checked={task.enabled}
                          onCheckedChange={() => handleToggleEnabled(task)}
                          className="scale-[0.7] data-[state=checked]:bg-emerald-500"
                        />
                        <span className={`text-[13px] font-medium ${task.enabled ? 'text-foreground' : 'text-muted-foreground line-through'}`}>
                          {task.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <TriggerIcon className="h-3 w-3 text-muted-foreground/60" />
                        <span className="text-xs text-muted-foreground">{trigger.label}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-md bg-secondary/50 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {formatTaskType(task.taskType)}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {task.agentName || <span className="text-muted-foreground/40">-</span>}
                    </TableCell>
                    {showProjectColumn ? (
                      <TableCell className="text-xs text-muted-foreground">
                        {task.scope === 'project' ? '项目' : '工作空间'}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      {status.label !== '-' ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${status.bg} ${status.fg}`}>
                          {status.label}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatTime(task.lastRunAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36 rounded-xl">
                          <DropdownMenuItem onClick={() => handleRun(task)} className="rounded-lg text-xs">
                            <Play className="mr-2 h-3.5 w-3.5 text-blue-500" />
                            立即运行
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(task)} className="rounded-lg text-xs">
                            <Pencil className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                            编辑
                          </DropdownMenuItem>
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
