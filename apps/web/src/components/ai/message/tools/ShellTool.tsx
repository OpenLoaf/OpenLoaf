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

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2Icon, LoaderCircleIcon, TerminalIcon, XCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatRuntime } from '@/hooks/use-chat-runtime'
import { useChatSession } from '../../context'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@openloaf/ui/tooltip'
import {
  Collapsible,
  CollapsibleTrigger,
} from '@openloaf/ui/collapsible'
import {
  ToolOutputCode,
  ToolOutputContent,
  ToolOutputError,
  ToolOutputLoading,
  ToolOutputText,
} from './shared/ToolOutput'
import {
  asPlainObject,
  formatCommand,
  getApprovalId,
  isApprovalPending,
  isToolStreaming,
  normalizeToolInput,
  safeStringify,
  type AnyToolPart,
} from './shared/tool-utils'
import {
  detectStackTrace,
  detectTestResults,
  type ParsedTestResults,
} from './shared/shell-parsers'
import {
  StackTrace,
  StackTraceHeader,
  StackTraceError,
  StackTraceErrorType,
  StackTraceErrorMessage,
  StackTraceActions,
  StackTraceCopyButton,
  StackTraceExpandButton,
  StackTraceContent,
  StackTraceFrames,
} from '@/components/ai-elements/stack-trace'
import {
  TestResults,
  TestResultsHeader,
  TestResultsSummary as TestResultsSummaryComponent,
  TestResultsDuration,
  TestResultsProgress,
} from '@/components/ai-elements/test-results'
import ToolApprovalActions from './shared/ToolApprovalActions'

/** Extract command string from shell tool input. */
function resolveCommand(part: AnyToolPart): string {
  const input = normalizeToolInput(part.input)
  const inputObj = asPlainObject(input)
  if (!inputObj) return ''
  if (inputObj.command != null) return formatCommand(inputObj.command)
  if (typeof inputObj.cmd === 'string') return inputObj.cmd.trim()
  return ''
}

/**
 * Extract output text from shell tool output.
 * - shell (array) returns JSON: {"output": "...", "metadata": {...}}
 * - shell-command returns plain text blocks
 */
function resolveOutput(part: AnyToolPart): {
  output: string
  exitCode?: number
  duration?: number
} {
  const raw = part.output
  if (raw == null) return { output: '' }

  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>
        const output = typeof parsed.output === 'string' ? parsed.output : ''
        const meta = asPlainObject(parsed.metadata)
        return {
          output,
          exitCode:
            typeof meta?.exit_code === 'number' ? meta.exit_code : undefined,
          duration:
            typeof meta?.duration_seconds === 'number'
              ? meta.duration_seconds
              : undefined,
        }
      } catch {
        // fallback
      }
    }
    const exitMatch = trimmed.match(/Exit code:\s*(\d+)/)
    const outputMatch = trimmed.match(/Output:\n([\s\S]*)$/)
    if (exitMatch || outputMatch) {
      return {
        output: outputMatch?.[1]?.trim() ?? trimmed,
        exitCode: exitMatch ? Number(exitMatch[1]) : undefined,
      }
    }
    return { output: trimmed }
  }

  const obj = asPlainObject(raw)
  if (obj) {
    const output = typeof obj.output === 'string' ? obj.output : safeStringify(raw)
    const meta = asPlainObject(obj.metadata)
    return {
      output,
      exitCode:
        typeof meta?.exit_code === 'number' ? meta.exit_code : undefined,
      duration:
        typeof meta?.duration_seconds === 'number'
          ? meta.duration_seconds
          : undefined,
    }
  }

  return { output: safeStringify(raw) }
}

function formatDuration(duration: number): string {
  return duration < 1
    ? `${Math.round(duration * 1000)}ms`
    : `${Math.round(duration * 10) / 10}s`
}

export default function ShellTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { t } = useTranslation('ai')
  const { tabId } = useChatSession()
  const toolCallId = typeof part.toolCallId === 'string' ? part.toolCallId : ''
  const command = resolveCommand(part)
  const streaming = isToolStreaming(part)
  const hasErrorText =
    typeof part.errorText === 'string' && part.errorText.trim().length > 0
  const hasError =
    hasErrorText ||
    part.state === 'output-error' ||
    part.state === 'output-denied'
  const { output, exitCode, duration } = resolveOutput(part)
  const displayOutput = hasErrorText ? (part.errorText ?? '') : output
  const approvalId = getApprovalId(part)
  const isPending = isApprovalPending(part)
  const hasOutput = displayOutput.length > 0
  // 直接从 Zustand 订阅 toolProgress，绕过 context/rAF 链路，确保实时更新
  const zustandTp = useChatRuntime((state) => {
    if (!tabId || !toolCallId) return undefined
    const snapshot = state.toolPartsByTabId[tabId]?.[toolCallId]
    return snapshot?.toolProgress as AnyToolPart['toolProgress'] | undefined
  })
  const tp = zustandTp ?? part.toolProgress
  const progressActive = tp?.status === 'active'
  const progressDone = tp?.status === 'done'
  const progressError = tp?.status === 'error'

  // 受控展开状态：streaming / progress 期间自动展开，用户手动操作仍生效
  const [userOpen, setUserOpen] = React.useState(false)
  const forceOpen = streaming || progressActive
  const effectiveOpen = forceOpen || userOpen || hasOutput

  const stackTrace = React.useMemo(
    () => (displayOutput ? detectStackTrace(displayOutput) : null),
    [displayOutput],
  )
  const testResults = React.useMemo(
    () => (displayOutput ? detectTestResults(displayOutput) : null),
    [displayOutput],
  )

  const tooltipText = [
    command && `$ ${command}`,
    duration != null && formatDuration(duration),
  ].filter(Boolean).join('\n')

  // 审批状态：使用 PlanTool 风格的整合卡片（命令 + 确认按钮连成一张带边框的卡片）
  if (isPending && approvalId) {
    return (
      <div
        className={cn(
          'min-w-0 overflow-hidden rounded-xl border border-border/60 bg-muted/10',
          className,
        )}
      >
        {command ? (
          <div className="flex max-h-[120px] items-start gap-2 overflow-auto px-3 py-2 font-mono text-xs">
            <span className="sticky top-0 shrink-0 text-muted-foreground">$</span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap break-all text-foreground/90">
              {command}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
            <TerminalIcon className="size-3.5" />
            <span>{t('toolNames.Bash')}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-t border-border/30 px-3 py-2">
          <span className="shrink-0 text-xs text-muted-foreground">{t('tool.confirmExec')}</span>
          <ToolApprovalActions approvalId={approvalId} size="sm" />
        </div>
      </div>
    )
  }

  return (
    <Collapsible className={cn('min-w-0 text-xs', className)} open={effectiveOpen} onOpenChange={setUserOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <CollapsibleTrigger
            className={cn(
              'flex w-full items-center gap-1.5 rounded-full px-2.5 py-1',
              'transition-colors duration-150 hover:bg-muted/60',
            )}
          >
            <TerminalIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-xs font-medium text-muted-foreground">{t('toolNames.Bash')}</span>
            {command ? (
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/50">
                {command}
              </span>
            ) : null}
            {progressDone && !hasOutput ? (
              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {tp.summary}
              </span>
            ) : duration != null && !streaming ? (
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
                {formatDuration(duration)}
              </span>
            ) : null}
            {streaming || progressActive ? (
              <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-muted-foreground" />
            ) : hasError || progressError ? (
              <XCircleIcon className="size-3 shrink-0 text-destructive" />
            ) : hasOutput || progressDone ? (
              <CheckCircle2Icon className="size-3 shrink-0 text-muted-foreground/50" />
            ) : null}
          </CollapsibleTrigger>
        </TooltipTrigger>
        {tooltipText ? (
          <TooltipContent
            side="top"
            className="max-w-sm max-h-[200px] overflow-auto whitespace-pre-wrap break-all font-mono text-xs"
          >
            {tooltipText}
          </TooltipContent>
        ) : null}
      </Tooltip>
      <ToolOutputContent>
        {testResults ? (
          <div className="rounded-lg bg-muted/50 p-1.5">
            <ShellTestResults results={testResults} />
          </div>
        ) : stackTrace ? (
          <div className="overflow-hidden rounded-lg bg-muted/50">
            <ShellStackTrace trace={stackTrace} />
          </div>
        ) : hasError && hasErrorText ? (
          <ToolOutputError message={displayOutput} />
        ) : hasOutput ? (
          <ToolOutputCode code={displayOutput} language="bash" />
        ) : tp && (progressActive || progressDone) ? (
          <div className="space-y-1">
            {tp.accumulatedText ? (
              <ToolOutputText text={tp.accumulatedText} />
            ) : progressActive ? (
              <ToolOutputLoading label={tp.label || '执行中...'} />
            ) : null}
            {progressDone && tp.summary ? (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                <CheckCircle2Icon className="size-3" />
                <span>{tp.summary}</span>
              </div>
            ) : null}
          </div>
        ) : progressError ? (
          <ToolOutputError message={tp?.errorText || '执行失败'} />
        ) : streaming ? (
          <ToolOutputLoading label="执行中..." />
        ) : null}
      </ToolOutputContent>
    </Collapsible>
  )
}

/** Render stack trace using StackTrace component. */
function ShellStackTrace({ trace }: { trace: string }) {
  return (
    <StackTrace trace={trace} defaultOpen className="rounded-none border-0 text-[11px]">
      <StackTraceHeader className="px-3 py-1.5 gap-1.5 [&_svg]:size-2.5">
        <StackTraceError className="gap-1">
          <StackTraceErrorType className="text-[11px]" />
          <StackTraceErrorMessage className="text-[11px]" />
        </StackTraceError>
        <StackTraceActions className="[&_button]:size-5 [&_button_svg]:size-2.5">
          <StackTraceCopyButton />
          <StackTraceExpandButton />
        </StackTraceActions>
      </StackTraceHeader>
      <StackTraceContent maxHeight={300} className="text-[11px] [&_code]:text-[11px]">
        <StackTraceFrames showInternalFrames={false} />
      </StackTraceContent>
    </StackTrace>
  )
}

/** Render test results using TestResults component. */
function ShellTestResults({ results }: { results: ParsedTestResults }) {
  return (
    <TestResults summary={results} className="rounded-none border-0 bg-transparent text-xs">
      <TestResultsHeader className="px-1 py-1">
        <TestResultsSummaryComponent />
        <TestResultsDuration />
      </TestResultsHeader>
      <TestResultsProgress className="px-1 py-1" />
    </TestResults>
  )
}
