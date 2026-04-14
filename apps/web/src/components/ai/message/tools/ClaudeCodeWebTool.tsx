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

import { CheckCircle2Icon, GlobeIcon, LoaderCircleIcon, SearchIcon, XCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
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
import { asPlainObject, isToolStreaming, normalizeToolInput, safeStringify, type AnyToolPart } from './shared/tool-utils'

type WebKind = 'webfetch' | 'websearch'

function resolveWebInput(part: AnyToolPart, kind: WebKind): { primary: string; label: string } {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  if (!inputObj) return { primary: '', label: kind === 'webfetch' ? 'WebFetch' : 'WebSearch' }

  if (kind === 'webfetch') {
    return {
      primary: typeof inputObj.url === 'string' ? inputObj.url.trim() : '',
      label: 'WebFetch',
    }
  }

  return {
    primary: typeof inputObj.query === 'string' ? inputObj.query.trim() : '',
    label: 'WebSearch',
  }
}

export default function ClaudeCodeWebTool({
  part,
  kind,
  className,
}: {
  part: AnyToolPart
  kind: WebKind
  className?: string
}) {
  const { primary, label } = resolveWebInput(part, kind)
  const Icon = kind === 'webfetch' ? GlobeIcon : SearchIcon
  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'
  const tp = part.toolProgress

  const output = typeof part.output === 'string' ? part.output : safeStringify(part.output)
  const hasOutput = output.trim().length > 0
  const errorText =
    typeof part.errorText === 'string' && part.errorText.trim()
      ? part.errorText
      : undefined

  // Resolve status indicator based on toolProgress and streaming state
  const progressActive = tp?.status === 'active'
  const progressDone = tp?.status === 'done'
  const progressError = tp?.status === 'error'
  const showSpinner = streaming || progressActive

  return (
    <Collapsible className={cn('min-w-0 text-xs', className)} defaultOpen={progressActive}>
      <Tooltip>
        <TooltipTrigger asChild>
          <CollapsibleTrigger
            className={cn(
              'flex w-full items-center gap-1.5 rounded-full px-2.5 py-1',
              'transition-colors duration-150 hover:bg-muted/60',
            )}
          >
            <Icon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {label}
            </span>
            {primary ? (
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/50">
                {primary}
              </span>
            ) : null}
            {progressDone && !hasOutput ? (
              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {tp.summary}
              </span>
            ) : null}
            {showSpinner ? (
              <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-muted-foreground" />
            ) : hasError || progressError ? (
              <XCircleIcon className="size-3 shrink-0 text-destructive" />
            ) : hasOutput || progressDone ? (
              <CheckCircle2Icon className="size-3 shrink-0 text-muted-foreground/50" />
            ) : null}
          </CollapsibleTrigger>
        </TooltipTrigger>
        {primary ? (
          <TooltipContent side="top" className="max-w-sm break-all font-mono text-xs">
            {primary}
          </TooltipContent>
        ) : null}
      </Tooltip>
      <ToolOutputContent>
        {hasOutput ? (
          kind === 'webfetch' ? (
            <ToolOutputText text={output} />
          ) : (
            <ToolOutputCode code={output} language="json" />
          )
        ) : tp && (progressActive || progressDone) ? (
          <div className="space-y-1">
            {progressActive && tp.label ? <ToolOutputLoading label={tp.label} /> : null}
            {tp.accumulatedText ? <ToolOutputText text={tp.accumulatedText} /> : null}
            {progressDone && tp.summary ? (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                <CheckCircle2Icon className="size-3" />
                <span>{tp.summary}</span>
              </div>
            ) : null}
          </div>
        ) : errorText || progressError ? (
          <ToolOutputError message={errorText || tp?.errorText || ''} />
        ) : streaming ? (
          <ToolOutputLoading label="加载中..." />
        ) : null}
      </ToolOutputContent>
    </Collapsible>
  )
}
