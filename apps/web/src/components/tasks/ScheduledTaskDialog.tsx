'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { trpc } from '@/utils/trpc'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tenas-ai/ui/dialog'
import { Button } from '@tenas-ai/ui/button'
import { Input } from '@tenas-ai/ui/input'
import { Label } from '@tenas-ai/ui/label'
import { Textarea } from '@tenas-ai/ui/textarea'
import { DatePicker } from '@tenas-ai/ui/calendar/components/ui/date-picker'
import { TimePicker } from '@tenas-ai/ui/calendar/components/ui/time-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tenas-ai/ui/select'
import { ConditionConfigForm } from './ConditionConfigForm'
import { useProjects } from '@/hooks/use-projects'
import type { ProjectNode } from '@tenas-ai/api/services/projectTreeService'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@tenas-ai/ui/tabs'

type TaskData = {
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
  scope: string
  [key: string]: unknown
}

type ScheduledTaskDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  workspaceId: string
  projectId?: string
  task: TaskData | null
}

/** Project option for tab selection. */
type ProjectOption = {
  projectId: string
  title: string
  depth: number
}

/** Flatten project tree for select options. */
function flattenProjectTree(nodes: ProjectNode[] | undefined, depth = 0): ProjectOption[] {
  if (!nodes?.length) return []
  const result: ProjectOption[] = []
  for (const node of nodes) {
    result.push({ projectId: node.projectId, title: node.title, depth })
    if (node.children?.length) {
      // 逻辑：深度优先展开，保留层级信息。
      result.push(...flattenProjectTree(node.children, depth + 1))
    }
  }
  return result
}

/** Form row with label and content. */
function FormRow({
  label,
  children,
  alignTop,
}: {
  label: string
  children: React.ReactNode
  alignTop?: boolean
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3 gap-y-2 py-2.5', alignTop && 'items-start')}>
      <Label className={cn('text-sm font-medium text-foreground', alignTop && 'pt-1')}>
        {label}
      </Label>
      <div className={cn('ml-auto flex flex-wrap items-center justify-end gap-2', alignTop && 'w-full items-start')}>
        {children}
      </div>
    </div>
  )
}

type SchedulePreset = 'interval' | 'daily' | 'weekly' | 'monthly' | 'once' | 'custom'

function padTime(value: number): string {
  return `${value}`.padStart(2, '0')
}

function buildCronFromPreset(preset: SchedulePreset, time: string, weekday: string, monthDay: number): string {
  const [hourStr, minuteStr] = time.split(':')
  const hour = Number(hourStr ?? 9)
  const minute = Number(minuteStr ?? 0)
  const safeHour = Number.isNaN(hour) ? 9 : hour
  const safeMinute = Number.isNaN(minute) ? 0 : minute
  const base = `${safeMinute} ${safeHour}`
  switch (preset) {
    case 'daily':
      return `${base} * * *`
    case 'weekly':
      return `${base} * * ${weekday || '1'}`
    case 'monthly':
      return `${base} ${monthDay || 1} * *`
    default:
      return `${base} * * *`
  }
}

function parseCronPreset(expr?: string): {
  preset: SchedulePreset
  time: string
  weekday?: string
  monthDay?: number
} {
  if (!expr) return { preset: 'daily', time: '09:00' }
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return { preset: 'custom', time: '09:00' }
  const [minuteRaw, hourRaw, dom, , dow] = parts
  const minute = Number(minuteRaw)
  const hour = Number(hourRaw)
  if (Number.isNaN(minute) || Number.isNaN(hour)) return { preset: 'custom', time: '09:00' }
  const time = `${padTime(hour)}:${padTime(minute)}`
  if (dom === '*' && dow === '*') {
    return { preset: 'daily', time }
  }
  if (dom === '*' && dow !== '*' && /^\d+$/.test(dow)) {
    return { preset: 'weekly', time, weekday: dow }
  }
  if (dom !== '*' && /^\d+$/.test(dom) && dow === '*') {
    return { preset: 'monthly', time, monthDay: Number(dom) }
  }
  return { preset: 'custom', time }
}

export const ScheduledTaskDialog = memo(function ScheduledTaskDialog({
  open,
  onOpenChange,
  onSuccess,
  workspaceId,
  projectId,
  task,
}: ScheduledTaskDialogProps) {
  const isEditing = Boolean(task)

  const [name, setName] = useState('')
  const [triggerMode, setTriggerMode] = useState<'scheduled' | 'condition'>('scheduled')
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>('daily')
  const [scheduleTime, setScheduleTime] = useState('09:00')
  const [scheduleWeekday, setScheduleWeekday] = useState('1')
  const [scheduleMonthDay, setScheduleMonthDay] = useState(1)
  const [cronExpr, setCronExpr] = useState('0 9 * * *')
  const [intervalMs, setIntervalMs] = useState(3600000)
  const [scheduleOnceDate, setScheduleOnceDate] = useState<Date | undefined>(undefined)
  const [scheduleOnceTime, setScheduleOnceTime] = useState('09:00')
  const [timezone, setTimezone] = useState('')
  const [condition, setCondition] = useState<{
    type: 'email_received' | 'chat_keyword' | 'file_changed'
    preFilter?: Record<string, unknown>
    rule?: string
  }>({ type: 'email_received' })
  const [agentName, setAgentName] = useState('')
  const [message, setMessage] = useState('')
  const [enabled, setEnabled] = useState(true)
  /** Selected tab scope for new tasks. */
  const [tabScope, setTabScope] = useState<'workspace' | 'project'>('workspace')
  /** Selected project id when tab scope is project. */
  const [targetProjectId, setTargetProjectId] = useState('')
  const [sessionMode, setSessionMode] = useState<'isolated' | 'shared'>('isolated')
  const [timeoutMs, setTimeoutMs] = useState(600000)
  const [cooldownMs, setCooldownMs] = useState(60000)
  const [activeTab, setActiveTab] = useState<'trigger' | 'action' | 'advanced'>('trigger')

  const projectsQuery = useProjects()
  const projectOptions = useMemo(
    () => flattenProjectTree(projectsQuery.data),
    [projectsQuery.data],
  )
  const resolvedProjectId = useMemo(
    () => (tabScope === 'project' ? (targetProjectId || projectId || '').trim() : ''),
    [tabScope, targetProjectId, projectId],
  )

  useEffect(() => {
    if (!open) return
    setActiveTab('trigger')
    if (task) {
      setName(task.name)
      setTriggerMode((task.triggerMode as 'scheduled' | 'condition') ?? 'scheduled')
      if (task.schedule?.type === 'interval') {
        setSchedulePreset('interval')
        setIntervalMs(task.schedule?.intervalMs ?? 3600000)
        setScheduleOnceDate(undefined)
        setScheduleOnceTime('09:00')
      } else if (task.schedule?.type === 'once') {
        const scheduleAtValue = task.schedule?.scheduleAt
        const parsedDate = scheduleAtValue ? new Date(scheduleAtValue) : undefined
        const isValid = parsedDate && !Number.isNaN(parsedDate.getTime())
        setSchedulePreset('once')
        setScheduleOnceDate(isValid ? parsedDate : undefined)
        setScheduleOnceTime(
          isValid && parsedDate
            ? `${padTime(parsedDate.getHours())}:${padTime(parsedDate.getMinutes())}`
            : '09:00',
        )
        setIntervalMs(3600000)
      } else {
        const parsed = parseCronPreset(task.schedule?.cronExpr ?? '')
        setSchedulePreset(parsed.preset)
        setScheduleTime(parsed.time)
        setScheduleWeekday(parsed.weekday ?? '1')
        setScheduleMonthDay(parsed.monthDay ?? 1)
        setCronExpr(task.schedule?.cronExpr ?? '0 9 * * *')
        setIntervalMs(3600000)
        setScheduleOnceDate(undefined)
        setScheduleOnceTime('09:00')
      }
      setTimezone(task.schedule?.timezone ?? '')
      setCondition(task.condition as typeof condition ?? { type: 'email_received' })
      setAgentName(task.agentName ?? '')
      setMessage((task.payload?.message as string) ?? '')
      setEnabled(task.enabled)
      setTabScope((task.scope as 'workspace' | 'project') ?? 'workspace')
      setTargetProjectId(projectId ?? '')
      setSessionMode((task.sessionMode as 'isolated' | 'shared') ?? 'isolated')
      setTimeoutMs(task.timeoutMs ?? 600000)
      setCooldownMs(task.cooldownMs ?? 60000)
    } else {
      setName('')
      setTriggerMode('scheduled')
      setSchedulePreset('daily')
      setScheduleTime('09:00')
      setScheduleWeekday('1')
      setScheduleMonthDay(1)
      setCronExpr('0 9 * * *')
      setIntervalMs(3600000)
      setScheduleOnceDate(undefined)
      setScheduleOnceTime('09:00')
      setTimezone('')
      setCondition({ type: 'email_received' })
      setAgentName('')
      setMessage('')
      setEnabled(true)
      // 逻辑：根据当前标签页默认作用域与项目。
      setTabScope(projectId ? 'project' : 'workspace')
      setTargetProjectId(projectId ?? '')
      setSessionMode('isolated')
      setTimeoutMs(600000)
      setCooldownMs(60000)
    }
  }, [open, task, projectId])

  const createMutation = useMutation(
    trpc.scheduledTask.create.mutationOptions({ onSuccess }),
  )
  const updateMutation = useMutation(
    trpc.scheduledTask.update.mutationOptions({ onSuccess }),
  )

  const handleSubmit = useCallback(() => {
    const payload: Record<string, unknown> = {}
    const trimmedMessage = message.trim()
    if (trimmedMessage) payload.message = trimmedMessage

    const scheduleData = triggerMode === 'scheduled'
      ? (() => {
          if (schedulePreset === 'interval') {
            return {
              type: 'interval' as const,
              intervalMs,
              timezone: timezone || undefined,
            }
          }
          if (schedulePreset === 'once') {
            let scheduleAtValue: string | undefined
            if (scheduleOnceDate) {
              const [hourStr, minuteStr] = scheduleOnceTime.split(':')
              const hour = Number(hourStr ?? 0)
              const minute = Number(minuteStr ?? 0)
              const date = new Date(scheduleOnceDate)
              date.setHours(Number.isNaN(hour) ? 0 : hour, Number.isNaN(minute) ? 0 : minute, 0, 0)
              scheduleAtValue = date.toISOString()
            }
            return {
              type: 'once' as const,
              scheduleAt: scheduleAtValue,
              timezone: timezone || undefined,
            }
          }
          const cron = schedulePreset === 'custom'
            ? cronExpr
            : buildCronFromPreset(schedulePreset, scheduleTime, scheduleWeekday, scheduleMonthDay)
          return {
            type: 'cron' as const,
            cronExpr: cron,
            timezone: timezone || undefined,
          }
        })()
      : undefined
    const conditionData = triggerMode === 'condition' ? condition : undefined

    if (isEditing && task) {
      updateMutation.mutate({
        id: task.id,
        projectId: projectId || undefined,
        name,
        agentName: agentName || undefined,
        enabled,
        triggerMode,
        schedule: scheduleData,
        condition: conditionData,
        payload,
        sessionMode,
        timeoutMs,
        cooldownMs,
      })
    } else {
      createMutation.mutate({
        workspaceId,
        projectId: resolvedProjectId || undefined,
        name,
        agentName: agentName || undefined,
        enabled,
        triggerMode,
        schedule: scheduleData,
        condition: conditionData,
        payload,
        sessionMode,
        timeoutMs,
        cooldownMs,
        scope: tabScope,
      })
    }
  }, [
    isEditing, task, name, agentName, enabled,
    triggerMode, schedulePreset, scheduleTime, scheduleWeekday, scheduleMonthDay, cronExpr, intervalMs, scheduleOnceDate, scheduleOnceTime, timezone,
    condition, message, tabScope, resolvedProjectId, sessionMode, timeoutMs, cooldownMs,
    projectId, workspaceId, createMutation, updateMutation,
  ])

  const isPending = createMutation.isPending || updateMutation.isPending
  const isProjectScope = tabScope === 'project'
  // 逻辑：项目 Tab 必须选中具体项目才能提交。
  const canSubmit = Boolean(name.trim()) && (isEditing || !isProjectScope || Boolean(resolvedProjectId))
  const inputBase = 'h-8 rounded-full border border-border/70 bg-muted/40 px-3 text-xs text-foreground shadow-none focus-visible:ring-0'
  const inlineInput = 'h-8 w-full max-w-[360px] border-0 bg-transparent text-right text-sm text-foreground shadow-none focus-visible:ring-0'
  const selectBase = 'h-8 rounded-full border border-border/70 bg-muted/40 px-3 text-xs shadow-none justify-between gap-2 focus-visible:ring-0'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px] h-[78vh] flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background p-0 shadow-[0_12px_32px_rgba(15,23,42,0.12)]">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle className="text-[16px] font-semibold">{isEditing ? '编辑任务' : '新建自动任务'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 px-6 pb-6">
            <div className="divide-y divide-border/60">
              <FormRow label="任务名称">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：每天 9 点同步日报"
                  className={cn(inlineInput, 'max-w-[360px]')}
                />
              </FormRow>
              <FormRow label="类型">
                <Tabs value={triggerMode} onValueChange={(value) => setTriggerMode(value as typeof triggerMode)}>
                  <TabsList className="h-8 w-max rounded-full border border-border/70 bg-muted/40 p-1">
                    <TabsTrigger value="scheduled" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                      定时
                    </TabsTrigger>
                    <TabsTrigger value="condition" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                      条件
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </FormRow>
              {!isEditing ? (
                <>
                  <FormRow label="影响范围">
                    <Tabs value={tabScope} onValueChange={(value) => setTabScope(value as typeof tabScope)}>
                      <TabsList className="h-8 w-max rounded-full border border-border/70 bg-muted/40 p-1">
                        <TabsTrigger value="workspace" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                          工作区
                        </TabsTrigger>
                        <TabsTrigger value="project" className="h-6 rounded-full px-2 text-xs whitespace-nowrap">
                          项目
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </FormRow>
                  {tabScope === 'project' ? (
                    <FormRow label="项目">
                      <div className="flex flex-col gap-2">
                        <Select
                          value={resolvedProjectId || undefined}
                          onValueChange={(v) => setTargetProjectId(v)}
                        >
                          <SelectTrigger className={cn(selectBase, 'w-[220px]')}>
                            <SelectValue placeholder={projectsQuery.isLoading ? '加载项目...' : '选择项目'} />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {projectOptions.length > 0 ? (
                              projectOptions.map((project) => {
                                const prefix = project.depth > 0 ? `${'-- '.repeat(project.depth)}` : ''
                                return (
                                  <SelectItem key={project.projectId} value={project.projectId} className="rounded-lg text-xs">
                                    {prefix}{project.title}
                                  </SelectItem>
                                )
                              })
                            ) : (
                              <SelectItem value="__empty__" disabled className="rounded-lg text-xs text-muted-foreground">
                                暂无项目
                              </SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        {resolvedProjectId ? null : (
                          <div className="text-[11px] text-rose-500">请选择项目</div>
                        )}
                      </div>
                    </FormRow>
                  ) : null}
                </>
              ) : null}
            </div>

            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
              <TabsList className="h-9 w-max rounded-full border border-border/70 bg-muted/40 p-1">
                <TabsTrigger value="trigger" className="h-7 rounded-full px-3 text-xs whitespace-nowrap">
                  触发方式
                </TabsTrigger>
                <TabsTrigger value="action" className="h-7 rounded-full px-3 text-xs whitespace-nowrap">
                  执行内容
                </TabsTrigger>
                <TabsTrigger value="advanced" className="h-7 rounded-full px-3 text-xs whitespace-nowrap">
                  高级设置
                </TabsTrigger>
              </TabsList>

              <TabsContent value="trigger">
                <div className="pt-2">
                  {triggerMode === 'scheduled' ? (
                    <div className="divide-y divide-border/60">
                        <FormRow label="频率">
                          <Select value={schedulePreset} onValueChange={(v) => setSchedulePreset(v as SchedulePreset)}>
                            <SelectTrigger className={cn(selectBase, 'w-[220px]')}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="interval" className="rounded-lg text-xs">间隔</SelectItem>
                              <SelectItem value="daily" className="rounded-lg text-xs">每天</SelectItem>
                              <SelectItem value="weekly" className="rounded-lg text-xs">每周</SelectItem>
                              <SelectItem value="monthly" className="rounded-lg text-xs">每月</SelectItem>
                              <SelectItem value="once" className="rounded-lg text-xs">单次</SelectItem>
                              <SelectItem value="custom" className="rounded-lg text-xs">自定义</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormRow>
                        {schedulePreset === 'interval' ? (
                          <FormRow label="间隔（分钟）">
                            <Input
                              type="number"
                              min={1}
                              value={Math.round(intervalMs / 60000)}
                              onChange={(e) => setIntervalMs(Number(e.target.value) * 60000)}
                              className={cn(inputBase, 'w-full max-w-[220px]')}
                            />
                          </FormRow>
                        ) : null}
                        {schedulePreset === 'once' ? (
                          <>
                            <FormRow label="日期">
                              <DatePicker
                                date={scheduleOnceDate}
                                onChange={setScheduleOnceDate}
                                label="选择日期"
                                className="[& button]:h-8 [& button]:rounded-full [& button]:border-border/70 [& button]:bg-muted/40 [& button]:text-xs [& button]:shadow-none w-full max-w-[220px]"
                              />
                            </FormRow>
                            <FormRow label="时间">
                              <TimePicker
                                value={scheduleOnceTime}
                                onChange={setScheduleOnceTime}
                                timeFormat="24-hour"
                                placeholder="选择时间"
                                className="h-8 w-full max-w-[200px] rounded-full border border-border/70 bg-muted/40 text-xs font-normal shadow-none"
                              />
                            </FormRow>
                          </>
                        ) : null}
                        {schedulePreset === 'daily' ? (
                          <FormRow label="执行时间">
                            <TimePicker
                              value={scheduleTime}
                              onChange={setScheduleTime}
                              timeFormat="24-hour"
                              placeholder="选择时间"
                              className="h-8 w-full max-w-[200px] rounded-full border border-border/70 bg-muted/40 text-xs font-normal shadow-none"
                            />
                          </FormRow>
                        ) : null}
                        {schedulePreset === 'weekly' ? (
                          <>
                            <FormRow label="星期">
                              <Select value={scheduleWeekday} onValueChange={(v) => setScheduleWeekday(v)}>
                                <SelectTrigger className={cn(selectBase, 'w-[180px]')}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                  <SelectItem value="1" className="rounded-lg text-xs">周一</SelectItem>
                                  <SelectItem value="2" className="rounded-lg text-xs">周二</SelectItem>
                                  <SelectItem value="3" className="rounded-lg text-xs">周三</SelectItem>
                                  <SelectItem value="4" className="rounded-lg text-xs">周四</SelectItem>
                                  <SelectItem value="5" className="rounded-lg text-xs">周五</SelectItem>
                                  <SelectItem value="6" className="rounded-lg text-xs">周六</SelectItem>
                                  <SelectItem value="0" className="rounded-lg text-xs">周日</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormRow>
                            <FormRow label="执行时间">
                              <TimePicker
                                value={scheduleTime}
                                onChange={setScheduleTime}
                                timeFormat="24-hour"
                                placeholder="选择时间"
                                className="h-8 w-full max-w-[200px] rounded-full border border-border/70 bg-muted/40 text-xs font-normal shadow-none"
                              />
                            </FormRow>
                          </>
                        ) : null}
                        {schedulePreset === 'monthly' ? (
                          <>
                            <FormRow label="日期">
                              <Input
                                type="number"
                                min={1}
                                max={28}
                                value={scheduleMonthDay}
                                onChange={(e) => setScheduleMonthDay(Number(e.target.value))}
                                className={cn(inputBase, 'w-full max-w-[140px]')}
                              />
                            </FormRow>
                            <FormRow label="执行时间">
                              <TimePicker
                                value={scheduleTime}
                                onChange={setScheduleTime}
                                timeFormat="24-hour"
                                placeholder="选择时间"
                                className="h-8 w-full max-w-[200px] rounded-full border border-border/70 bg-muted/40 text-xs font-normal shadow-none"
                              />
                            </FormRow>
                          </>
                        ) : null}
                        {schedulePreset === 'custom' ? (
                          <FormRow label="Cron">
                            <Input
                              value={cronExpr}
                              onChange={(e) => setCronExpr(e.target.value)}
                              placeholder="0 9 * * *"
                              className={cn(inputBase, 'w-full max-w-[260px] font-mono text-xs')}
                            />
                          </FormRow>
                        ) : null}
                    </div>
                  ) : (
                    <ConditionConfigForm value={condition} onChange={setCondition} />
                  )}
                </div>
              </TabsContent>

              <TabsContent value="action">
                <div className="pt-2">
                  <div className="divide-y divide-border/60">
                    <FormRow label="Agent">
                      <Input
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        placeholder="默认"
                        className={cn(inlineInput, 'max-w-[280px]')}
                      />
                    </FormRow>
                    <FormRow label="指令" alignTop>
                      <Textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="触发时发送给 Agent 的指令..."
                        rows={4}
                        className="min-h-[110px] w-full max-w-[520px] border-0 bg-transparent px-0 py-0 text-sm shadow-none resize-none placeholder:text-muted-foreground/60 focus-visible:ring-0"
                      />
                    </FormRow>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="advanced">
                <div className="pt-2">
                  <div className="divide-y divide-border/60">
                    <FormRow label="超时（分钟）">
                      <Input
                        type="number"
                        min={1}
                        value={Math.round(timeoutMs / 60000)}
                        onChange={(e) => setTimeoutMs(Number(e.target.value) * 60000)}
                        className={inputBase}
                      />
                    </FormRow>
                    <FormRow label="冷却（分钟）">
                      <Input
                        type="number"
                        min={0}
                        value={Math.round(cooldownMs / 60000)}
                        onChange={(e) => setCooldownMs(Number(e.target.value) * 60000)}
                        className={inputBase}
                      />
                    </FormRow>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/30 px-6 py-4 gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-full px-5 text-[13px] text-[var(--btn-neutral-fg,#5f6368)] hover:bg-[var(--btn-neutral-bg-hover,#e8eaed)] dark:text-slate-300 dark:hover:bg-slate-700"
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || isPending}
            className="h-9 rounded-full px-5 text-[13px] bg-[var(--btn-primary-bg,#0b57d0)] text-[var(--btn-primary-fg,#ffffff)] shadow-none hover:bg-[var(--btn-primary-bg-hover,#0a4cbc)] dark:bg-sky-600 dark:hover:bg-sky-500"
          >
            {isPending ? '保存中...' : isEditing ? '保存' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
