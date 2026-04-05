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
import { FileTextIcon, LoaderCircleIcon, XCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatSession } from '@/components/ai/context'
import { createFileEntryFromUri, openFile } from '@/components/file/lib/open-file'
import { useProject } from '@/hooks/use-project'
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
  getDisplayPath,
  isToolStreaming,
  normalizeToolInput,
  safeStringify,
  type AnyToolPart,
  type ToolVariant,
} from './shared/tool-utils'

function resolveReadInput(part: AnyToolPart) {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  const filePath = typeof inputObj?.file_path === 'string'
    ? inputObj.file_path.trim()
    : typeof inputObj?.path === 'string'
      ? inputObj.path.trim()
      : ''
  const offset = typeof inputObj?.offset === 'number' ? inputObj.offset : undefined
  const limit = typeof inputObj?.limit === 'number' ? inputObj.limit : undefined
  return { filePath, offset, limit }
}

function resolveDisplayName(filePath: string): string {
  if (!filePath) return ''
  return filePath.split('/').filter(Boolean).pop() ?? filePath
}

function formatRange(offset?: number, limit?: number): string {
  if (offset != null && limit != null) return `L${offset}-${offset + limit}`
  if (offset != null) return `L${offset}+`
  if (limit != null) return `${limit} lines`
  return ''
}

/**
 * 剥离 Read 工具返回内容中的 `cat -n` 前缀（行号 + Tab）。
 * 因为前端 CodeBlock 有自己的行号展示（或不需要原生行号），避免双重显示。
 */
function stripCatNPrefix(text: string): string {
  if (!text) return text
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*\d+\t/, ''))
    .join('\n')
}

/** Guess language from file extension for syntax highlighting. */
function guessLanguage(filePath: string): any {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    json: 'json', md: 'markdown', css: 'css', scss: 'scss',
    html: 'html', xml: 'xml', yaml: 'yaml', yml: 'yaml',
    py: 'python', rs: 'rust', go: 'go', sh: 'bash', zsh: 'bash',
    sql: 'sql', prisma: 'prisma', toml: 'toml', env: 'bash',
  }
  return map[ext] ?? 'json'
}

export default function ReadTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
  variant?: ToolVariant
  messageId?: string
}) {
  const { filePath, offset, limit } = resolveReadInput(part)
  const range = formatRange(offset, limit)
  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'

  const { projectId, tabId } = useChatSession()
  const projectQuery = useProject(projectId)
  const projectRootUri = projectQuery.data?.project?.rootUri ?? undefined

  const displayPath = getDisplayPath(filePath, projectRootUri)
  const displayName = resolveDisplayName(filePath)

  const handleOpen = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!filePath) return
      const entry = createFileEntryFromUri({ uri: filePath, name: displayName })
      if (!entry) return
      openFile({ entry, tabId, projectId: projectId ?? undefined, rootUri: projectRootUri })
    },
    [filePath, displayName, tabId, projectId, projectRootUri],
  )

  const inlineText = [displayPath, range].filter(Boolean).join(' ')

  const rawOutput =
    typeof part.output === 'string' ? part.output : safeStringify(part.output)
  const output = stripCatNPrefix(rawOutput)
  const hasOutput = output.trim().length > 0
  const errorText =
    typeof part.errorText === 'string' && part.errorText.trim()
      ? part.errorText
      : undefined
  const language = guessLanguage(filePath)

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
            <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span
              className="shrink-0 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
              onClick={handleOpen}
            >
              Read
            </span>
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
        {inlineText ? (
          <TooltipContent side="top" className="max-w-sm break-all font-mono text-xs">
            {displayPath}
            {range ? <span className="ml-1 text-muted-foreground">({range})</span> : null}
          </TooltipContent>
        ) : null}
      </Tooltip>
      <CollapsibleContent className="px-2.5 py-2 text-xs">
        {hasOutput ? (
          <div className="max-h-[320px] overflow-auto rounded-2xl bg-muted/50">
            <CodeBlock code={output} language={language} />
          </div>
        ) : errorText ? (
          <div className="whitespace-pre-wrap break-all rounded-2xl bg-destructive/10 p-2 text-xs text-destructive">
            {errorText}
          </div>
        ) : streaming ? (
          <div className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground">
            <LoaderCircleIcon className="size-3 animate-spin" />
            <span>读取中...</span>
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  )
}
