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
import { SearchIcon, LoaderCircleIcon, XCircleIcon } from 'lucide-react'
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
} from './shared/ToolOutput'
import {
  asPlainObject,
  getDisplayPath,
  isToolStreaming,
  normalizeToolInput,
  safeStringify,
  type AnyToolPart,
  type ToolVariant,
} from './shared/tool-utils'
import { useChatSession } from '@/components/ai/context'
import { useProject } from '@/hooks/use-project'

/**
 * Grep/ripgrep 后端会把结果包裹在 <truncated-output path="..."> ... </truncated-output>
 * 标签中（超长时标识截断）。前端展示时剥离标签，只显示命中内容，并返回是否截断。
 */
function stripTruncatedWrapper(text: string): { body: string; truncated: boolean } {
  if (!text) return { body: text, truncated: false }
  const trimmed = text.trim()
  const match = trimmed.match(
    /^<truncated-output\b[^>]*>([\s\S]*?)<\/truncated-output>\s*$/,
  )
  if (!match) return { body: text, truncated: false }
  return { body: match[1].replace(/^\n+/, '').replace(/\n+$/, ''), truncated: true }
}

function resolveGrepInput(part: AnyToolPart) {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  const pattern = typeof inputObj?.pattern === 'string' ? inputObj.pattern.trim() : ''
  const path = typeof inputObj?.path === 'string' ? inputObj.path.trim() : ''
  const include = typeof inputObj?.include === 'string' ? inputObj.include.trim() : ''
  return { pattern, path, include }
}

export default function GrepTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
  variant?: ToolVariant
  messageId?: string
}) {
  const { pattern, path, include } = resolveGrepInput(part)
  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'

  const { t } = useTranslation('ai')
  const { projectId } = useChatSession()
  const projectQuery = useProject(projectId)
  const projectRootUri = projectQuery.data?.project?.rootUri ?? undefined

  const displayPath = getDisplayPath(path, projectRootUri)
  const secondary = [displayPath, include].filter(Boolean).join(' ')
  const inlineText = [pattern, secondary].filter(Boolean).join(' in ')
  const tooltipText = [
    pattern && `pattern: ${pattern}`,
    displayPath && `path: ${displayPath}`,
    include && `include: ${include}`,
  ].filter(Boolean).join('\n')

  const rawOutput =
    typeof part.output === 'string' ? part.output : safeStringify(part.output)
  const { body: output, truncated } = stripTruncatedWrapper(rawOutput)
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
            <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-xs font-medium text-muted-foreground">{t('toolNames.Grep', { defaultValue: 'Grep' })}</span>
            {inlineText ? (
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/50">
                {inlineText}
              </span>
            ) : null}
            {streaming ? (
              <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-muted-foreground" />
            ) : hasError ? (
              <XCircleIcon className="size-3 shrink-0 text-destructive" />
            ) : null}
          </CollapsibleTrigger>
        </TooltipTrigger>
        {tooltipText ? (
          <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap font-mono text-xs">
            {tooltipText}
          </TooltipContent>
        ) : null}
      </Tooltip>
      <ToolOutputContent>
        {hasOutput ? (
          <div className="space-y-0.5">
            <ToolOutputCode code={output} language="text" />
            {truncated ? (
              <div className="px-1 text-[10px] text-muted-foreground/60">结果已截断</div>
            ) : null}
          </div>
        ) : errorText ? (
          <ToolOutputError message={errorText} />
        ) : streaming ? (
          <ToolOutputLoading label="搜索中..." />
        ) : null}
      </ToolOutputContent>
    </Collapsible>
  )
}
