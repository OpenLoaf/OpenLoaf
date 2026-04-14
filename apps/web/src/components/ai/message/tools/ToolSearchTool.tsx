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
import {
  CheckCircle2Icon,
  LoaderCircleIcon,
  WrenchIcon,
  XCircleIcon,
} from 'lucide-react'
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
import { ToolOutputContent, ToolOutputError, ToolOutputLoading } from './shared/ToolOutput'
import {
  asPlainObject,
  isToolStreaming,
  normalizeToolInput,
  safeStringify,
  type AnyToolPart,
} from './shared/tool-utils'

type ToolSearchOutput = {
  tools: Array<{ id: string; name?: string; description?: string }>
  notFound: string[]
  message?: string
}

function parseOutput(raw: unknown): ToolSearchOutput | null {
  if (!raw) return null
  let data: unknown = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed.startsWith('{')) return null
    try {
      data = JSON.parse(trimmed)
    } catch {
      return null
    }
  }
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  const toolsRaw = Array.isArray(obj.tools) ? obj.tools : []
  const tools = toolsRaw
    .map((t) => {
      const it = (t ?? {}) as Record<string, unknown>
      const id = typeof it.id === 'string' ? it.id : ''
      const name = typeof it.name === 'string' ? it.name : undefined
      const description = typeof it.description === 'string' ? it.description : undefined
      return { id, name, description }
    })
    .filter((t) => t.id)
  const notFound = Array.isArray(obj.notFound)
    ? obj.notFound.filter((v): v is string => typeof v === 'string')
    : []
  const message = typeof obj.message === 'string' ? obj.message : undefined
  return { tools, notFound, message }
}

export default function ToolSearchTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  const query =
    inputObj && typeof inputObj.names === 'string' ? inputObj.names.trim() : ''

  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'
  const errorText =
    typeof part.errorText === 'string' && part.errorText.trim()
      ? part.errorText
      : undefined

  const parsed = React.useMemo(() => parseOutput(part.output), [part.output])
  const loadedCount = parsed?.tools.length ?? 0
  const notFoundCount = parsed?.notFound.length ?? 0
  const isAllNotFound = loadedCount === 0 && notFoundCount > 0

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
            <WrenchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              ToolSearch
            </span>
            {query ? (
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/50">
                {query}
              </span>
            ) : (
              <span className="min-w-0 flex-1" />
            )}
            {loadedCount > 0 ? (
              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {loadedCount} 已加载
              </span>
            ) : null}
            {notFoundCount > 0 ? (
              <span className="shrink-0 text-[10px] text-destructive/70">
                {notFoundCount} 未找到
              </span>
            ) : null}
            {streaming ? (
              <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-muted-foreground" />
            ) : hasError || isAllNotFound ? (
              <XCircleIcon className="size-3 shrink-0 text-destructive" />
            ) : loadedCount > 0 ? (
              <CheckCircle2Icon className="size-3 shrink-0 text-muted-foreground/50" />
            ) : null}
          </CollapsibleTrigger>
        </TooltipTrigger>
        {query ? (
          <TooltipContent side="top" className="max-w-sm break-all font-mono text-xs">
            {query}
          </TooltipContent>
        ) : null}
      </Tooltip>
      <ToolOutputContent>
        {parsed ? (
          <div className="flex flex-col gap-1.5">
            {loadedCount > 0 ? (
              <div>
                <div className="mb-0.5 text-[10px] text-muted-foreground/60">已加载</div>
                <div className="flex flex-wrap gap-1">
                  {parsed.tools.map((tool) => (
                    <Tooltip key={tool.id}>
                      <TooltipTrigger asChild>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full bg-muted/60 px-2 py-0.5',
                            'font-mono text-[10px] text-foreground',
                          )}
                        >
                          {tool.id}
                        </span>
                      </TooltipTrigger>
                      {tool.description ? (
                        <TooltipContent side="top" className="max-w-sm text-xs">
                          {tool.description}
                        </TooltipContent>
                      ) : null}
                    </Tooltip>
                  ))}
                </div>
              </div>
            ) : null}
            {notFoundCount > 0 ? (
              <div>
                <div className="mb-0.5 text-[10px] text-muted-foreground/60">未找到</div>
                <div className="flex flex-wrap gap-1">
                  {parsed.notFound.map((name) => (
                    <span
                      key={name}
                      className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 font-mono text-[10px] text-destructive"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {parsed.message ? (
              <div className="text-[10px] text-muted-foreground/60">{parsed.message}</div>
            ) : null}
          </div>
        ) : errorText || hasError ? (
          <ToolOutputError message={errorText || '查询失败'} />
        ) : streaming ? (
          <ToolOutputLoading label="加载中..." />
        ) : (
          <div className="py-0.5 text-[11px] text-muted-foreground/60">
            {safeStringify(part.output)}
          </div>
        )}
      </ToolOutputContent>
    </Collapsible>
  )
}
