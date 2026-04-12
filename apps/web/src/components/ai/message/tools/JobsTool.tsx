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

import { useTranslation } from 'react-i18next'
import {
  CheckCircle2Icon,
  CircleDotIcon,
  ListIcon,
  LoaderCircleIcon,
  SkullIcon,
  XCircleIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@openloaf/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@openloaf/ui/tooltip'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@openloaf/ui/collapsible'
import {
  asPlainObject,
  getToolKind,
  isToolStreaming,
  normalizeToolInput,
  type AnyToolPart,
} from './shared/tool-utils'

// ─── Types ───────────────────────────────────────────────────────────

type TaskSummary = {
  id: string
  kind: string
  status: string
  description: string
  startTime?: number
  endTime?: number
  exitCode?: number | null
  command?: string
  outputPath?: string
  agentId?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────

function resolveKillInput(part: AnyToolPart) {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  const taskId = typeof inputObj?.task_id === 'string' ? inputObj.task_id : ''
  return { taskId }
}

function resolveJobsOutput(part: AnyToolPart): { tasks: TaskSummary[]; count: number } {
  const raw = part.output
  if (raw == null) return { tasks: [], count: 0 }
  const obj = asPlainObject(raw)
  if (!obj) return { tasks: [], count: 0 }
  const count = typeof obj.count === 'number' ? obj.count : 0
  const tasks = Array.isArray(obj.tasks) ? (obj.tasks as TaskSummary[]) : []
  return { tasks, count }
}

function resolveKillOutput(part: AnyToolPart): { status?: string; taskId?: string; description?: string } {
  const raw = part.output
  if (raw == null) return {}
  const obj = asPlainObject(raw)
  if (!obj) return {}
  return {
    status: typeof obj.status === 'string' ? obj.status : undefined,
    taskId: typeof obj.task_id === 'string' ? obj.task_id : undefined,
    description: typeof obj.description === 'string' ? obj.description : undefined,
  }
}

function formatDuration(startTime?: number, endTime?: number): string {
  if (startTime == null) return ''
  const end = endTime ?? Date.now()
  const ms = end - startTime
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${mins}m${rest}s` : `${mins}m`
}

const STATUS_ICON = {
  running: CircleDotIcon,
  completed: CheckCircle2Icon,
  failed: XCircleIcon,
  killed: XCircleIcon,
} as const

const STATUS_ICON_CLASS = {
  running: 'text-blue-500 dark:text-blue-400',
  completed: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-destructive',
  killed: 'text-muted-foreground',
} as const

const STATUS_BADGE_CLASS = {
  running: 'bg-blue-500/10 text-blue-600 border-transparent dark:text-blue-400',
  completed: 'bg-emerald-500/10 text-emerald-600 border-transparent dark:text-emerald-400',
  failed: 'bg-destructive/10 text-destructive border-transparent',
  killed: 'bg-muted text-muted-foreground border-transparent',
} as const

function getStatusMeta(status: string) {
  const key = status as keyof typeof STATUS_ICON
  return {
    Icon: STATUS_ICON[key] ?? CircleDotIcon,
    iconClass: STATUS_ICON_CLASS[key] ?? 'text-muted-foreground',
    badgeClass: STATUS_BADGE_CLASS[key] ?? 'bg-muted text-muted-foreground border-transparent',
  }
}

// ─── Component ──────────────────────────────────────────────────────

export default function JobsTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { t } = useTranslation('ai')
  const kind = getToolKind(part)
  const isKill = kind === 'Kill'
  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'
  const hasOutput = part.output != null
  const errorText =
    typeof part.errorText === 'string' && part.errorText.trim() ? part.errorText : undefined

  const Icon = isKill ? SkullIcon : ListIcon
  const label = isKill ? t('bgTool.kill') : t('bgTool.jobs')

  if (isKill) {
    return <KillRow part={part} className={className} />
  }

  // Inline summary for collapsed state
  let inlineSummary = ''
  const { count } = resolveJobsOutput(part)
  if (hasOutput) inlineSummary = t('bgTool.taskCount', { count })

  return (
    <Collapsible className={cn('min-w-0 text-xs', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <CollapsibleTrigger
            className={cn(
              'flex w-full items-center gap-1.5 rounded-full px-2.5 py-1',
              'transition-colors duration-150 hover:bg-muted/60',
            )}
          >
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
            {inlineSummary ? (
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/50">
                {inlineSummary}
              </span>
            ) : null}
            {streaming ? (
              <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-muted-foreground" />
            ) : hasError ? (
              <XCircleIcon className="size-3 shrink-0 text-destructive" />
            ) : hasOutput ? (
              <CheckCircle2Icon className="size-3 shrink-0 text-muted-foreground/50" />
            ) : null}
          </CollapsibleTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap font-mono text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
      <CollapsibleContent className="px-2.5 py-2 text-xs">
        <JobsContent part={part} errorText={errorText} streaming={streaming} />
      </CollapsibleContent>
    </Collapsible>
  )
}

// ─── Jobs expanded content ──────────────────────────────────────────

function JobsContent({
  part,
  errorText,
  streaming,
}: {
  part: AnyToolPart
  errorText?: string
  streaming: boolean
}) {
  const { t } = useTranslation('ai')
  const { tasks } = resolveJobsOutput(part)

  if (errorText) {
    return (
      <div className="whitespace-pre-wrap break-all rounded-2xl bg-destructive/10 p-2 text-xs text-destructive">
        {errorText}
      </div>
    )
  }

  if (tasks.length === 0 && !streaming) {
    return (
      <div className="py-0.5 text-xs text-muted-foreground">
        {t('bgTool.taskCount', { count: 0 })}
      </div>
    )
  }

  if (streaming && tasks.length === 0) {
    return (
      <div className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground">
        <LoaderCircleIcon className="size-3 animate-spin" />
        <span>{t('bgTool.executing')}</span>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} />
      ))}
    </div>
  )
}

function TaskRow({ task }: { task: TaskSummary }) {
  const { Icon, iconClass, badgeClass } = getStatusMeta(task.status)
  const duration = formatDuration(task.startTime, task.endTime)
  const desc = task.description || task.command || task.id.slice(0, 8)

  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <Icon className={cn('size-3 shrink-0', iconClass)} />
      <span
        className="min-w-0 truncate text-xs text-foreground/80"
        title={desc}
      >
        {desc}
      </span>
      <Badge variant="outline" className={cn('shrink-0 text-[10px]', badgeClass)}>
        {task.status}
      </Badge>
      {duration && (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
          {duration}
        </span>
      )}
    </div>
  )
}

// ─── Kill (non-collapsible row) ─────────────────────────────────────

function KillRow({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { t } = useTranslation('ai')
  const { taskId } = resolveKillInput(part)
  const killOut = resolveKillOutput(part)
  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'
  const errorText =
    typeof part.errorText === 'string' && part.errorText.trim() ? part.errorText : undefined

  const statusText = killOut.status
  const mappedStatus = statusText === 'killed' ? 'killed' : statusText === 'not-found' ? 'failed' : 'completed'
  const { badgeClass } = statusText ? getStatusMeta(mappedStatus) : { badgeClass: '' }

  return (
    <div
      className={cn(
        'flex w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
        className,
      )}
    >
      <SkullIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{t('bgTool.kill')}</span>
      <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/50">
        {killOut.description || (taskId ? taskId.slice(0, 8) : '')}
      </span>
      {streaming ? (
        <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-muted-foreground" />
      ) : hasError || errorText ? (
        <XCircleIcon className="size-3 shrink-0 text-destructive" />
      ) : statusText ? (
        <Badge variant="outline" className={cn('shrink-0 text-[10px]', badgeClass)}>
          {statusText}
        </Badge>
      ) : null}
    </div>
  )
}
