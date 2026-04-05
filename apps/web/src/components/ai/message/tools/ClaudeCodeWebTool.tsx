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

import { GlobeIcon, LoaderCircleIcon, SearchIcon, XCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
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
import { CodeBlock } from '@/components/ai-elements/code-block'
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

  const output = typeof part.output === 'string' ? part.output : safeStringify(part.output)
  const hasOutput = output.trim().length > 0
  const errorText =
    typeof part.errorText === 'string' && part.errorText.trim()
      ? part.errorText
      : undefined

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
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {label}
            </span>
            {primary ? (
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/50">
                {primary}
              </span>
            ) : null}
            {streaming ? (
              <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-muted-foreground" />
            ) : hasError ? (
              <XCircleIcon className="size-3 shrink-0 text-destructive" />
            ) : null}
          </CollapsibleTrigger>
        </TooltipTrigger>
        {primary ? (
          <TooltipContent side="top" className="max-w-sm break-all font-mono text-xs">
            {primary}
          </TooltipContent>
        ) : null}
      </Tooltip>
      <CollapsibleContent className="px-2.5 py-2 text-xs">
        {hasOutput ? (
          <CodeBlock
            code={output}
            language="json"
            className="max-h-[320px] overflow-auto"
          />
        ) : errorText ? (
          <div className="whitespace-pre-wrap break-all rounded-2xl bg-destructive/10 p-2 text-xs text-destructive">
            {errorText}
          </div>
        ) : streaming ? (
          <div className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground">
            <LoaderCircleIcon className="size-3 animate-spin" />
            <span>加载中...</span>
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  )
}
