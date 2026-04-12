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

import { SparklesIcon, LoaderCircleIcon, XCircleIcon } from 'lucide-react'
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
import {
  asPlainObject,
  isToolStreaming,
  normalizeToolInput,
  type AnyToolPart,
  type ToolVariant,
} from './shared/tool-utils'

function resolveLoadSkillInput(part: AnyToolPart): { skillName: string } {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  const skillName =
    typeof inputObj?.skillName === 'string' ? inputObj.skillName.trim() : ''
  return { skillName }
}

type LoadSkillOutput = {
  ok?: boolean
  error?: string
  data?: {
    skillName?: string
    scope?: string
    basePath?: string
    content?: string
    hint?: string
  }
}

function resolveLoadSkillOutput(part: AnyToolPart): {
  scope: string
  basePath: string
  content: string
  error: string
} {
  const raw = part.output
  if (!raw || typeof raw !== 'object') {
    return { scope: '', basePath: '', content: '', error: '' }
  }
  const out = raw as LoadSkillOutput
  if (out.ok === false && typeof out.error === 'string') {
    return { scope: '', basePath: '', content: '', error: out.error }
  }
  const data = out.data ?? {}
  return {
    scope: typeof data.scope === 'string' ? data.scope : '',
    basePath: typeof data.basePath === 'string' ? data.basePath : '',
    content: typeof data.content === 'string' ? data.content : '',
    error: '',
  }
}

export default function LoadSkillTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
  variant?: ToolVariant
  messageId?: string
}) {
  const { skillName } = resolveLoadSkillInput(part)
  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'
  const { scope, basePath, content, error: outputError } = resolveLoadSkillOutput(part)

  const inlineText = skillName
  const tooltipText = [
    skillName && `skill: ${skillName}`,
    scope && `scope: ${scope}`,
    basePath && `basePath: ${basePath}`,
  ]
    .filter(Boolean)
    .join('\n')

  const errorText =
    outputError ||
    (typeof part.errorText === 'string' && part.errorText.trim()
      ? part.errorText
      : '')
  const hasContent = content.trim().length > 0
  const previewContent = hasContent
    ? content
    : typeof part.output === 'string'
      ? part.output
      : ''
  const previewHasContent = previewContent.trim().length > 0

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
            <SparklesIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-xs font-medium text-muted-foreground">LoadSkill</span>
            {inlineText ? (
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/50">
                {inlineText}
              </span>
            ) : null}
            {scope ? (
              <span className="shrink-0 rounded bg-muted px-1 py-px font-mono text-[9px] text-muted-foreground">
                {scope}
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
          <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap break-all font-mono text-xs">
            {tooltipText}
          </TooltipContent>
        ) : null}
      </Tooltip>
      <CollapsibleContent className="px-2.5 py-2 text-xs">
        {previewHasContent ? (
          <div className="max-h-[320px] overflow-auto rounded-2xl bg-muted/50">
            <CodeBlock code={previewContent} language={'markdown' as any} />
          </div>
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
