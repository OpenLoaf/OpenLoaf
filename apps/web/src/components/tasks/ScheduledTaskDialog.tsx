'use client'

import { memo, useCallback, useEffect, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tenas-ai/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tenas-ai/ui/collapsible'
import { ChevronDown, Clock, Zap } from 'lucide-react'
import { ConditionConfigForm } from './ConditionConfigForm'
import { FilterTab } from '@tenas-ai/ui/filter-tab'

type TaskData = {
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

/** Apple-style grouped form section. */
function FormSection({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      {label ? <span className="px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span> : null}
      <div className="rounded-xl bg-muted/30 dark:bg-muted/20">
        {children}
      </div>
    </div>
  )
}

/** Single row inside a grouped section. */
function FormRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-3.5 py-2.5 ${last ? '' : 'border-b border-border/40'}`}>
      <Label className="shrink-0 text-[13px] font-normal">{label}</Label>
      <div className="flex-1 [&_input]:text-right [&_input]:text-[13px] [&_textarea]:text-[13px]">{children}</div>
    </div>
  )
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
  const [description, setDescription] = useState('')
  const [triggerMode, setTriggerMode] = useState<'scheduled' | 'condition'>('scheduled')
  const [scheduleType, setScheduleType] = useState<'once' | 'interval' | 'cron'>('cron')
  const [cronExpr, setCronExpr] = useState('0 9 * * *')
  const [intervalMs, setIntervalMs] = useState(3600000)
  const [scheduleAt, setScheduleAt] = useState('')
  const [timezone, setTimezone] = useState('')
  const [condition, setCondition] = useState<{
    type: 'email_received' | 'chat_keyword' | 'file_changed'
    preFilter?: Record<string, unknown>
    rule?: string
  }>({ type: 'email_received' })
  const [taskType, setTaskType] = useState<'chat' | 'summary' | 'custom'>('chat')
  const [agentName, setAgentName] = useState('')
  const [message, setMessage] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [scope, setScope] = useState<'workspace' | 'project'>('workspace')
  const [sessionMode, setSessionMode] = useState<'isolated' | 'shared'>('isolated')
  const [timeoutMs, setTimeoutMs] = useState(600000)
  const [cooldownMs, setCooldownMs] = useState(60000)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    if (task) {
      setName(task.name)
      setDescription(task.description ?? '')
      setTriggerMode((task.triggerMode as 'scheduled' | 'condition') ?? 'scheduled')
      setScheduleType((task.schedule?.type as 'once' | 'interval' | 'cron') ?? 'cron')
      setCronExpr(task.schedule?.cronExpr ?? '0 9 * * *')
      setIntervalMs(task.schedule?.intervalMs ?? 3600000)
      setScheduleAt(task.schedule?.scheduleAt ?? '')
      setTimezone(task.schedule?.timezone ?? '')
      setCondition(task.condition as typeof condition ?? { type: 'email_received' })
      setTaskType((task.taskType as 'chat' | 'summary' | 'custom') ?? 'chat')
      setAgentName(task.agentName ?? '')
      setMessage((task.payload?.message as string) ?? '')
      setEnabled(task.enabled)
      setScope((task.scope as 'workspace' | 'project') ?? 'workspace')
      setSessionMode((task.sessionMode as 'isolated' | 'shared') ?? 'isolated')
      setTimeoutMs(task.timeoutMs ?? 600000)
      setCooldownMs(task.cooldownMs ?? 60000)
    } else {
      setName('')
      setDescription('')
      setTriggerMode('scheduled')
      setScheduleType('cron')
      setCronExpr('0 9 * * *')
      setIntervalMs(3600000)
      setScheduleAt('')
      setTimezone('')
      setCondition({ type: 'email_received' })
      setTaskType('chat')
      setAgentName('')
      setMessage('')
      setEnabled(true)
      setScope(projectId ? 'project' : 'workspace')
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
    if (taskType === 'chat' && message) payload.message = message

    const scheduleData = triggerMode === 'scheduled'
      ? {
          type: scheduleType,
          cronExpr: scheduleType === 'cron' ? cronExpr : undefined,
          intervalMs: scheduleType === 'interval' ? intervalMs : undefined,
          scheduleAt: scheduleType === 'once' && scheduleAt ? new Date(scheduleAt).toISOString() : undefined,
          timezone: timezone || undefined,
        }
      : undefined
    const conditionData = triggerMode === 'condition' ? condition : undefined

    if (isEditing && task) {
      updateMutation.mutate({
        id: task.id, name, description: description || undefined,
        agentName: agentName || undefined, enabled, triggerMode,
        schedule: scheduleData, condition: conditionData,
        taskType, payload, sessionMode, timeoutMs, cooldownMs,
      })
    } else {
      createMutation.mutate({
        workspaceId, projectId, name, description: description || undefined,
        agentName: agentName || undefined, enabled, triggerMode,
        schedule: scheduleData, condition: conditionData,
        taskType, payload, sessionMode, timeoutMs, cooldownMs, scope,
      })
    }
  }, [
    isEditing, task, name, description, agentName, enabled,
    triggerMode, scheduleType, cronExpr, intervalMs, scheduleAt, timezone,
    condition, taskType, message, scope, sessionMode, timeoutMs, cooldownMs,
    projectId, workspaceId, createMutation, updateMutation,
  ])

  const isPending = createMutation.isPending || updateMutation.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] max-h-[85vh] flex flex-col rounded-2xl p-0">
        <DialogHeader className="shrink-0 px-5 pt-5 pb-0">
          <DialogTitle className="text-base font-semibold">{isEditing ? '编辑任务' : '新建自动任务'}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 px-5 py-3">
          {/* 基本信息 */}
          <FormSection>
            <FormRow label="名称">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="任务名称"
                className="border-0 bg-transparent shadow-none h-7 px-0"
              />
            </FormRow>
            <FormRow label="描述" last>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="可选"
                className="border-0 bg-transparent shadow-none h-7 px-0"
              />
            </FormRow>
          </FormSection>

          {/* 触发模式 */}
          <FormSection label="触发模式">
            <div className="flex justify-center p-2">
              <div className="flex w-fit rounded-full bg-secondary/60 p-1 dark:bg-secondary/40">
                <FilterTab
                  text="定时触发"
                  selected={triggerMode === 'scheduled'}
                  onSelect={() => setTriggerMode('scheduled')}
                  icon={<Clock className="h-3.5 w-3.5 text-blue-500" />}
                  layoutId="trigger-mode-tab"
                />
                <FilterTab
                  text="条件触发"
                  selected={triggerMode === 'condition'}
                  onSelect={() => setTriggerMode('condition')}
                  icon={<Zap className="h-3.5 w-3.5 text-amber-500" />}
                  layoutId="trigger-mode-tab"
                />
              </div>
            </div>
          </FormSection>

          {/* 定时配置 */}
          {triggerMode === 'scheduled' ? (
            <FormSection label="调度配置">
              <FormRow label="调度方式">
                <Select value={scheduleType} onValueChange={(v) => setScheduleType(v as any)}>
                  <SelectTrigger className="border-0 bg-transparent shadow-none h-7 text-[13px] justify-end gap-1 px-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="cron" className="rounded-lg text-xs">Cron 表达式</SelectItem>
                    <SelectItem value="interval" className="rounded-lg text-xs">定时重复</SelectItem>
                    <SelectItem value="once" className="rounded-lg text-xs">单次执行</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
              {scheduleType === 'cron' ? (
                <FormRow label="Cron" last>
                  <Input
                    value={cronExpr}
                    onChange={(e) => setCronExpr(e.target.value)}
                    placeholder="0 9 * * *"
                    className="border-0 bg-transparent shadow-none h-7 px-0 font-mono text-xs"
                  />
                </FormRow>
              ) : null}
              {scheduleType === 'interval' ? (
                <FormRow label="间隔（分钟）" last>
                  <Input
                    type="number"
                    min={1}
                    value={Math.round(intervalMs / 60000)}
                    onChange={(e) => setIntervalMs(Number(e.target.value) * 60000)}
                    className="border-0 bg-transparent shadow-none h-7 px-0"
                  />
                </FormRow>
              ) : null}
              {scheduleType === 'once' ? (
                <FormRow label="执行时间" last>
                  <Input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    className="border-0 bg-transparent shadow-none h-7 px-0 text-xs"
                  />
                </FormRow>
              ) : null}
            </FormSection>
          ) : (
            <FormSection label="条件配置">
              <div className="p-3">
                <ConditionConfigForm value={condition} onChange={setCondition} />
              </div>
            </FormSection>
          )}

          {/* 执行配置 */}
          <FormSection label="执行">
            <FormRow label="任务类型">
              <Select value={taskType} onValueChange={(v) => setTaskType(v as any)}>
                <SelectTrigger className="border-0 bg-transparent shadow-none h-7 text-[13px] justify-end gap-1 px-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="chat" className="rounded-lg text-xs">对话任务</SelectItem>
                  <SelectItem value="summary" className="rounded-lg text-xs">日汇总</SelectItem>
                  <SelectItem value="custom" className="rounded-lg text-xs">自定义</SelectItem>
                </SelectContent>
              </Select>
            </FormRow>
            <FormRow label="Agent" last={taskType !== 'chat'}>
              <Input
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="默认"
                className="border-0 bg-transparent shadow-none h-7 px-0"
              />
            </FormRow>
            {taskType === 'chat' ? (
              <div className="px-3.5 py-2.5">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="触发后发送给 Agent 的指令..."
                  rows={2}
                  className="border-0 bg-transparent shadow-none resize-none text-[13px] px-0"
                />
              </div>
            ) : null}
          </FormSection>

          {/* 作用域（仅新建） */}
          {!isEditing ? (
            <FormSection>
              <FormRow label="作用域" last>
                <Select value={scope} onValueChange={(v) => setScope(v as any)}>
                  <SelectTrigger className="border-0 bg-transparent shadow-none h-7 text-[13px] justify-end gap-1 px-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="workspace" className="rounded-lg text-xs">工作空间</SelectItem>
                    <SelectItem value="project" className="rounded-lg text-xs">项目</SelectItem>
                  </SelectContent>
                </Select>
              </FormRow>
            </FormSection>
          ) : null}

          {/* 高级设置 */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between px-1 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
              >
                高级设置
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <FormSection>
                <FormRow label="会话模式">
                  <Select value={sessionMode} onValueChange={(v) => setSessionMode(v as any)}>
                    <SelectTrigger className="border-0 bg-transparent shadow-none h-7 text-[13px] justify-end gap-1 px-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="isolated" className="rounded-lg text-xs">独立会话</SelectItem>
                      <SelectItem value="shared" className="rounded-lg text-xs">共享会话</SelectItem>
                    </SelectContent>
                  </Select>
                </FormRow>
                <FormRow label="超时（秒）">
                  <Input
                    type="number"
                    min={10}
                    value={Math.round(timeoutMs / 1000)}
                    onChange={(e) => setTimeoutMs(Number(e.target.value) * 1000)}
                    className="border-0 bg-transparent shadow-none h-7 px-0"
                  />
                </FormRow>
                <FormRow label="冷却（秒）" last>
                  <Input
                    type="number"
                    min={0}
                    value={Math.round(cooldownMs / 1000)}
                    onChange={(e) => setCooldownMs(Number(e.target.value) * 1000)}
                    className="border-0 bg-transparent shadow-none h-7 px-0"
                  />
                </FormRow>
              </FormSection>
            </CollapsibleContent>
          </Collapsible>
        </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/40 px-5 py-3 gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-lg"
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name.trim() || isPending}
            className="rounded-lg bg-blue-500 text-white shadow-none hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            {isPending ? '保存中...' : isEditing ? '保存' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})
