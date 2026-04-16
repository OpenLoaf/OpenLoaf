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
import { CheckCircle2Icon, FileTextIcon, LoaderCircleIcon, XCircleIcon } from 'lucide-react'
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
  getDisplayPath,
  isToolStreaming,
  normalizeToolInput,
  safeStringify,
  type AnyToolPart,
  type ToolVariant,
} from './shared/tool-utils'

function resolveDocPreviewInput(part: AnyToolPart) {
  const inputObj = asPlainObject(normalizeToolInput(part.input))
  const filePath = typeof inputObj?.file_path === 'string'
    ? inputObj.file_path.trim()
    : ''
  const mode = typeof inputObj?.mode === 'string' ? inputObj.mode : 'preview'
  const pageRange = typeof inputObj?.pageRange === 'string' ? inputObj.pageRange : undefined
  const sheetName = typeof inputObj?.sheetName === 'string' ? inputObj.sheetName : undefined
  return { filePath, mode, pageRange, sheetName }
}

function resolveDisplayName(filePath: string): string {
  if (!filePath) return ''
  return filePath.split('/').filter(Boolean).pop() ?? filePath
}

export default function DocPreviewTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
  variant?: ToolVariant
  messageId?: string
}) {
  const { filePath, mode, pageRange, sheetName } = resolveDocPreviewInput(part)
  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'
  const tp = part.toolProgress
  const progressActive = tp?.status === 'active'
  const progressDone = tp?.status === 'done'
  const progressError = tp?.status === 'error'

  const { t } = useTranslation('ai')
  const { projectId, tabId, sessionId } = useChatSession()
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
      openFile({ entry, tabId, projectId: projectId ?? undefined, sessionId, rootUri: projectRootUri })
    },
    [filePath, displayName, tabId, projectId, sessionId, projectRootUri],
  )

  const modeTag = mode === 'full' ? 'full' : 'preview'
  const rangeBits: string[] = [modeTag]
  if (pageRange) rangeBits.push(`pages=${pageRange}`)
  if (sheetName) rangeBits.push(`sheet=${sheetName}`)
  const inlineText = [displayPath, rangeBits.join(' ')].filter(Boolean).join(' ')

  const rawOutput =
    typeof part.output === 'string' ? part.output : safeStringify(part.output)
  const output = rawOutput
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
            <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span
              className="shrink-0 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
              onClick={handleOpen}
            >
              {t('toolNames.DocPreview', { defaultValue: 'DocPreview' })}
            </span>
            {inlineText ? (
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground/50">
                {inlineText}
              </span>
            ) : null}
            {progressActive && tp?.label ? (
              <span className="min-w-0 truncate text-[10px] text-muted-foreground/70">
                {tp.label}
              </span>
            ) : progressDone && tp?.summary ? (
              <span className="shrink-0 text-[10px] text-muted-foreground/60">
                {tp.summary}
              </span>
            ) : null}
            {streaming || progressActive ? (
              <LoaderCircleIcon className="size-3 shrink-0 animate-spin text-muted-foreground" />
            ) : hasError || progressError ? (
              <XCircleIcon className="size-3 shrink-0 text-destructive" />
            ) : progressDone ? (
              <CheckCircle2Icon className="size-3 shrink-0 text-muted-foreground/50" />
            ) : null}
          </CollapsibleTrigger>
        </TooltipTrigger>
        {inlineText ? (
          <TooltipContent side="top" className="max-w-sm break-all font-mono text-xs">
            {displayPath}
            <span className="ml-1 text-muted-foreground">({rangeBits.join(' ')})</span>
          </TooltipContent>
        ) : null}
      </Tooltip>
      <ToolOutputContent>
        {hasOutput ? (
          <ToolOutputCode code={output} language="markdown" />
        ) : errorText ? (
          <ToolOutputError message={errorText} />
        ) : progressError ? (
          <ToolOutputError message={tp?.errorText || '预览失败'} />
        ) : tp && (progressActive || progressDone) ? (
          <div className="space-y-1">
            {tp.accumulatedText ? (
              <ToolOutputText text={tp.accumulatedText} />
            ) : progressActive ? (
              <ToolOutputLoading label={tp.label || '预览中...'} />
            ) : null}
            {progressDone && tp.summary ? (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                <CheckCircle2Icon className="size-3" />
                <span>{tp.summary}</span>
              </div>
            ) : null}
          </div>
        ) : streaming ? (
          <ToolOutputLoading label="预览中..." />
        ) : null}
      </ToolOutputContent>
    </Collapsible>
  )
}
