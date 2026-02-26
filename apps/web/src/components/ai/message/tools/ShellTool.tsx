'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { TrafficLights } from '@openloaf/ui/traffic-lights'
import {
  Terminal,
  TerminalActions,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalStatus,
  TerminalTitle,
} from '@/components/ai-elements/terminal'
import {
  asPlainObject,
  formatCommand,
  getApprovalId,
  getToolName,
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

export default function ShellTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const command = resolveCommand(part)
  const isStreaming = isToolStreaming(part)
  const hasError =
    typeof part.errorText === 'string' && part.errorText.trim().length > 0
  const { output, exitCode, duration } = resolveOutput(part)
  const displayOutput = hasError ? (part.errorText ?? '') : output
  const title = getToolName(part)
  const toolKind = typeof part.toolName === 'string' && part.toolName.trim()
    ? part.toolName
    : part.type?.startsWith('tool-')
      ? part.type.slice('tool-'.length)
      : part.type ?? ''
  const showToolKind = Boolean(toolKind) && title !== toolKind
  const approvalId = getApprovalId(part)
  const isPending = isApprovalPending(part)
  const hasOutput = displayOutput.length > 0 || isStreaming

  const stackTrace = React.useMemo(
    () => (displayOutput ? detectStackTrace(displayOutput) : null),
    [displayOutput],
  )
  const testResults = React.useMemo(
    () => (displayOutput ? detectTestResults(displayOutput) : null),
    [displayOutput],
  )

  // 逻辑：窗口状态映射
  const windowState = hasError
    ? 'error' as const
    : isStreaming
      ? 'running' as const
      : exitCode === 0 || part.state === 'output-available'
        ? 'success' as const
        : 'idle' as const

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div className="overflow-hidden rounded-lg border bg-card text-card-foreground">
        {/* macOS 风格标题栏 */}
        <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2">
          <TrafficLights state={windowState} />
          <span className="flex-1 truncate text-[10px] text-muted-foreground/60">
            {showToolKind ? toolKind : title}
          </span>
          {showToolKind ? (
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {title}
            </span>
          ) : null}
        </div>

        {/* 命令区域 */}
        {command ? (
          <div className="border-b bg-muted/20 px-3 py-2">
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="text-emerald-500">$</span>
              <span className="flex-1 break-all text-amber-700 dark:text-amber-400">{command}</span>
              <div className="flex shrink-0 items-center gap-2 text-[10px] text-muted-foreground">
                {exitCode != null && !isStreaming ? (
                  <span className={exitCode === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}>
                    exit {exitCode}
                  </span>
                ) : null}
                {duration != null && !isStreaming ? (
                  <span>
                    {duration < 1
                      ? `${Math.round(duration * 1000)}ms`
                      : `${Math.round(duration * 10) / 10}s`}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => void navigator.clipboard.writeText(command)}
              >
                <svg className="size-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>
          </div>
        ) : null}

        {/* 审批区域 */}
        {isPending && approvalId ? (
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-xs text-muted-foreground">确认执行此命令？</span>
            <ToolApprovalActions approvalId={approvalId} size="default" />
          </div>
        ) : null}

        {/* 输出区域 */}
        {hasOutput ? (
          <div className="p-0">
            {testResults ? (
              <div className="p-3">
                <ShellTestResults results={testResults} />
              </div>
            ) : stackTrace ? (
              <div className="p-0">
                <ShellStackTrace trace={stackTrace} />
              </div>
            ) : (
              <Terminal
                output={displayOutput}
                isStreaming={isStreaming}
                className="rounded-none border-0 bg-transparent text-foreground text-xs"
              >
                <TerminalContent className="max-h-64 px-3 py-2 font-mono text-xs" />
              </Terminal>
            )}
          </div>
        ) : null}
      </div>
    </div>
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
    <TestResults summary={results} className="rounded-none border-0 text-xs">
      <TestResultsHeader className="px-3 py-2">
        <TestResultsSummaryComponent />
        <TestResultsDuration />
      </TestResultsHeader>
      <TestResultsProgress className="px-3 py-2" />
    </TestResults>
  )
}
