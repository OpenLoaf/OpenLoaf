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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@openloaf/ui/table'
import { Button } from '@openloaf/ui/button'
import { Switch } from '@openloaf/ui/switch'
import {
  Clock,
  FileText,
  Layers,
  Loader2,
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
} from '@openloaf/ui/dropdown-menu'
import { ScheduledTaskDialog } from './ScheduledTaskDialog'
import { TaskRunLogPanel } from './TaskRunLogPanel'
import { Tabs, TabsList, TabsTrigger } from '@openloaf/ui/tabs'
import { useTabs } from '@/hooks/use-tabs'

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

type TaskFilter = 'all' | 'scheduled' | 'condition'

type ScheduledTaskListProps = {
  workspaceId: string
  projectId?: string
  showProjectColumn?: boolean
}

function formatTrigger(task: TaskConfig, t: (key: string) => string): { label: string; icon: typeof Clock } {
  if (task.triggerMode === 'condition') {
    const typeLabels: Record<string, string> = {
      email_received: t('schedule.emailReceived'),
      chat_keyword: t('schedule.chatKeyword'),
      file_changed: t('schedule.fileChanged'),
    }
    return { label: typeLabels[task.condition?.type ?? ''] ?? t('schedule.conditionTrigger'), icon: Zap }
  }
  const schedule = task.schedule
  if (!schedule) return { label: '-', icon: Clock }
  if (schedule.type === 'once' && schedule.scheduleAt) {
    return { label: `${t('task.once')} ${new Date(schedule.scheduleAt).toLocaleString()}`, icon: Clock }
  }
  if (schedule.type === 'interval' && schedule.intervalMs) {
    const mins = Math.round(schedule.intervalMs / 60000)
    if (mins < 60) return { label: t('schedule.intervalMinutes', { minutes: mins }), icon: Clock }
    const hours = Math.round(mins / 60)
    if (hours < 24) return { label: t('schedule.intervalHours', { hours }), icon: Clock }
    return { label: t('schedule.intervalDays', { days: Math.round(hours / 24) }), icon: Clock }
  }
  if (schedule.type === 'cron' && schedule.cronExpr) {
    return { label: formatCronLabel(schedule.cronExpr, t), icon: Clock }
  }
  return { label: schedule.type, icon: Clock }
}

function formatCronLabel(expr: string, t: (key: string) => string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return expr
  const [minuteRaw, hourRaw, dom, , dow] = parts
  const minute = Number(minuteRaw)
  const hour = Number(hourRaw)
  if (Number.isNaN(minute) || Number.isNaN(hour)) return expr
  const time = `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`
  if (dom === '*' && dow === '*') {
    return t('schedule.dailyAt', { time })
  }
  if (dom === '*' && /^\d+$/.test(dow ?? '')) {
    const dayLabel = t(`schedule.dayLabels.${dow}`) || t('schedule.dayLabels.0')
    return t('schedule.weeklyOn', { day: dayLabel, time })
  }
  if (/^\d+$/.test(dom ?? '') && dow === '*') {
    return t('schedule.monthlyOn', { day: dom, time })
  }
  return expr
}

function formatTime(date: string | null | undefined): string {
  if (!date) return '-'
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

function formatType(task: TaskConfig, t: (key: string) => string): { label: string; icon: typeof Clock } {
  if (task.triggerMode === 'condition') return { label: t('schedule.condition'), icon: Zap }
  return { label: t('task.scheduled'), icon: Clock }
}

function formatStatusLine(status: string | null | undefined, lastRunAt: string | null | undefined, t: (key: string) => string): string {
  const labelMap: Record<string, string> = {
    ok: t('schedule.statusLabels.ok'),
    error: t('schedule.statusLabels.error'),
    skipped: t('schedule.statusLabels.skipped'),
    running: t('schedule.statusLabels.running'),
  }
  const label = labelMap[status ?? ''] ?? t('schedule.statusLabels.notStarted')
  const time = lastRunAt ? formatTime(lastRunAt) : ''
  return time ? `${label} · ${time}` : label
}

function statusClass(status: string | null | undefined): string {
  switch (status) {
    case 'ok': return 'text-emerald-600 dark:text-emerald-400'
    case 'error': return 'text-rose-600 dark:text-rose-400'
    case 'skipped': return 'text-amber-600 dark:text-amber-400'
    case 'running': return 'text-blue-600 dark:text-blue-400'
    default: return 'text-muted-foreground'
  }
}

export const ScheduledTaskList = memo(function ScheduledTaskList({
  workspaceId,
  projectId,
}: ScheduledTaskListProps) {
  const { t } = useTranslation('tasks')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskConfig | null>(null)
  const [filterTab, setFilterTab] = useState<TaskFilter>('all')
  const [logTaskId, setLogTaskId] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const invalidateList = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.scheduledTask.list.pathKey() }),
    [queryClient],
  )

  const agentsQuery = useQuery(trpc.settings.getAgents.queryOptions({}))
  const agentMap = useMemo(() => {
    const map = new Map<string, { name: string; icon?: string }>()
    for (const agent of agentsQuery.data ?? []) {
      const a = agent as { folderName: string; name: string; icon?: string }
      map.set(a.folderName, { name: a.name, icon: a.icon })
    }
    return map
  }, [agentsQuery.data])

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
  const hasRunning = useMemo(() => allTasks.some((t) => t.lastStatus === 'running'), [allTasks])

  // 逻辑：有运行中的任务时，每 3 秒轮询刷新列表。
  useEffect(() => {
    if (!hasRunning) return
    const interval = setInterval(() => { void listQuery.refetch() }, 3000)
    return () => clearInterval(interval)
  }, [hasRunning, listQuery])

  const updateMutation = useMutation(
    trpc.scheduledTask.update.mutationOptions({ onSuccess: invalidateList }),
  )
  const deleteMutation = useMutation(
    trpc.scheduledTask.delete.mutationOptions({ onSuccess: invalidateList }),
  )
  const runMutation = useMutation(
    trpc.scheduledTask.run.mutationOptions({ onSuccess: invalidateList }),
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
      if (!window.confirm(t('schedule.deleteConfirm', { name: task.name }))) return
      deleteMutation.mutate({ id: task.id, projectId: projectId || undefined })
    },
    [deleteMutation, projectId, t],
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

  const addTab = useTabs((s) => s.addTab)
  const handleOpenChat = useCallback((sessionId: string) => {
    addTab({
      workspaceId,
      chatSessionId: sessionId,
      chatLoadHistory: true,
    })
  }, [addTab, workspaceId])

  const colSpan = 7

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[15px] font-semibold">{t('schedule.automaticTasks')}</span>
          <span className="text-[12px] text-muted-foreground">{t('schedule.automaticTasksDesc')}</span>
        </div>
        <Button
          size="sm"
          className="h-8 rounded-full bg-[var(--btn-primary-bg,#0b57d0)] text-white shadow-none hover:bg-[var(--btn-primary-bg-hover,#0a4cbc)] dark:bg-sky-600 dark:hover:bg-sky-500"
          onClick={handleCreate}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('task.newScheduledTask')}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between">
        <Tabs value={filterTab} onValueChange={(value) => setFilterTab(value as TaskFilter)}>
          <TabsList className="h-8 w-max rounded-full border border-border/40 bg-muted/30 p-1">
            <TabsTrigger value="all" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
              <Layers className="mr-1 h-3.5 w-3.5 text-violet-500" />
              {t('schedule.all')}
              <span className="ml-1 text-[10px] text-muted-foreground">{allTasks.length}</span>
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
              <Clock className="mr-1 h-3.5 w-3.5 text-blue-500" />
              {t('task.scheduled')}
              <span className="ml-1 text-[10px] text-muted-foreground">{scheduledCount}</span>
            </TabsTrigger>
            <TabsTrigger value="condition" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
              <Zap className="mr-1 h-3.5 w-3.5 text-amber-500" />
              {t('schedule.condition')}
              <span className="ml-1 text-[10px] text-muted-foreground">{conditionCount}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border/40 overflow-hidden bg-background">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/20 hover:bg-muted/20">
              <TableHead className="w-[220px] text-[12px] font-medium text-muted-foreground">{t('schedule.tableHeaders.task')}</TableHead>
              <TableHead className="w-[90px] text-[12px] font-medium text-muted-foreground">{t('schedule.tableHeaders.type')}</TableHead>
              <TableHead className="text-[12px] font-medium text-muted-foreground">{t('schedule.tableHeaders.trigger')}</TableHead>
              <TableHead className="text-[12px] font-medium text-muted-foreground">{t('schedule.tableHeaders.instruction')}</TableHead>
              <TableHead className="w-[110px] text-[12px] font-medium text-muted-foreground">{t('schedule.tableHeaders.scope')}</TableHead>
              <TableHead className="text-[12px] font-medium text-muted-foreground">{t('schedule.tableHeaders.status')}</TableHead>
              <TableHead className="w-[180px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-10 text-center text-xs text-muted-foreground">
                  {t('common.loading') || 'Loading...'}
                </TableCell>
              </TableRow>
            ) : tasks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="py-10 text-center text-xs text-muted-foreground">
                  {t('messages.noAutomaticTasks')}
                </TableCell>
              </TableRow>
            ) : (
              tasks.map((task) => {
                const type = formatType(task, t)
                const trigger = formatTrigger(task, t)
                const TriggerIcon = trigger.icon
                const TypeIcon = type.icon
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
                          <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1">
                            {(() => {
                              const agentInfo = task.agentName ? agentMap.get(task.agentName) : null
                              const icon = agentInfo?.icon?.trim()
                              const displayName = agentInfo?.name ?? (task.agentName || t('schedule.default'))
                              return (
                                <>
                                  {icon && /[^a-z0-9-_]/i.test(icon) ? (
                                    <span className="text-[11px] leading-none">{icon}</span>
                                  ) : null}
                                  <span>{displayName}</span>
                                </>
                              )
                            })()}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground whitespace-nowrap">
                        <TypeIcon className="h-3 w-3 text-muted-foreground/60" />
                        {type.label}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground whitespace-nowrap">
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
                        <span className="text-[12px] text-muted-foreground/40">{t('schedule.notSet')}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-[12px] text-muted-foreground whitespace-nowrap">
                        {task.scope === 'project' ? '项目' : '工作区'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`text-[12px] whitespace-nowrap ${statusClass(task.lastStatus)}`}>
                        {formatStatusLine(task.lastStatus, task.lastRunAt, t)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          disabled={task.lastStatus === 'running'}
                          onClick={() => handleRun(task)}
                        >
                          {task.lastStatus === 'running' ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                          {task.lastStatus === 'running' ? t('schedule.running') : t('schedule.run')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="rounded-full"
                          onClick={() => handleEdit(task)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t('schedule.edit')}
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
                              {t('schedule.executionLogs')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(task)} className="rounded-lg text-xs text-rose-500 focus:text-rose-500">
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              {t('schedule.delete')}
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
        onOpenChat={handleOpenChat}
      />
    </div>
  )
})

export default ScheduledTaskList
