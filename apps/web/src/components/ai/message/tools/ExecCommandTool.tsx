/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n'use client'

import { cn } from '@/lib/utils'
import {
  Terminal,
  TerminalContent,
} from '@/components/ai-elements/terminal'
import { TrafficLights } from '@openloaf/ui/traffic-lights'
import {
  asPlainObject,
  getApprovalId,
  getToolName,
  isApprovalPending,
  isToolStreaming,
  normalizeToolInput,
  safeStringify,
  type AnyToolPart,
} from './shared/tool-utils'
import ToolApprovalActions from './shared/ToolApprovalActions'

/** Extract command from exec-command or write-stdin input. */
function resolveExecCommand(part: AnyToolPart): string {
  const input = normalizeToolInput(part.input)
  const inputObj = asPlainObject(input)
  if (!inputObj) return ''
  if (typeof inputObj.cmd === 'string') return inputObj.cmd.trim()
  if (typeof inputObj.chars === 'string') return inputObj.chars.trim()
  return ''
}

/** Extract output text from exec-command output. */
function resolveExecOutput(part: AnyToolPart): string {
  const raw = part.output
  if (raw == null) return ''
  if (typeof raw === 'string') {
    const outputMatch = raw.match(/Output:\n([\s\S]*)$/)
    return outputMatch?.[1]?.trim() ?? raw.trim()
  }
  return safeStringify(raw)
}

export default function ExecCommandTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const command = resolveExecCommand(part)
  const output = resolveExecOutput(part)
  const isStreaming = isToolStreaming(part)
  const hasError =
    typeof part.errorText === 'string' && part.errorText.trim().length > 0
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

  const windowState = hasError
    ? 'error' as const
    : isStreaming
      ? 'running' as const
      : part.state === 'output-available'
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
            <Terminal
              output={displayOutput}
              isStreaming={isStreaming}
              className="rounded-none border-0 bg-transparent text-foreground text-xs"
            >
              <TerminalContent className="max-h-64 px-3 py-2 font-mono text-xs" />
            </Terminal>
          </div>
        ) : null}
      </div>
    </div>
  )
}
