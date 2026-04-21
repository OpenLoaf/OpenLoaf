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
import { CheckCircle2Icon, FileTextIcon, LoaderCircleIcon, Music2Icon, XCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatSession } from '@/components/ai/context'
import { getPreviewEndpoint } from '@/lib/image/uri'
import { useLayoutState } from '@/hooks/use-layout-state'
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

interface MediaAttachment {
  path: string
  mediaType: string
}

function parseMediaAttachments(output: string): MediaAttachment[] {
  const result: MediaAttachment[] = []
  const regex = /<system-tag\s+type="attachment"\s+([^>]*?)\s*\/>/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(output)) !== null) {
    const rawAttrs = match[1] ?? ''
    const attrs: Record<string, string> = {}
    const attrRe = /([\w-]+)="([^"]*)"/g
    let attrMatch: RegExpExecArray | null
    while ((attrMatch = attrRe.exec(rawAttrs)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2]
    }
    const path = attrs.path
    const mediaType = attrs.mediaType ?? attrs['media-type'] ?? ''
    if (
      path &&
      (mediaType.startsWith('image/') ||
        mediaType.startsWith('video/') ||
        mediaType.startsWith('audio/'))
    ) {
      result.push({ path, mediaType })
    }
  }
  return result
}

function stripSystemTags(output: string): string {
  return output
    .replace(/<system-tag\s+type="fileInfo"[^>]*>[\s\S]*?<\/system-tag>/g, '')
    .replace(/<system-tag\s+type="attachment"[^>]*?\/>/g, '')
    .trim()
}

function ReadToolMediaPreview({
  attachment,
  projectId,
  sessionId,
}: {
  attachment: MediaAttachment
  projectId?: string
  sessionId?: string
}) {
  const { mediaType, path } = attachment
  const previewUrl = getPreviewEndpoint(path, { projectId, sessionId })
  const fileName = path.split('/').filter(Boolean).pop() ?? path
  const pushStackItem = useLayoutState((s) => s.pushStackItem)

  if (mediaType.startsWith('image/')) {
    return (
      <button
        type="button"
        className="w-full overflow-hidden rounded-xl"
        onClick={() =>
          pushStackItem({
            id: `read-image:${path}`,
            component: 'image-viewer',
            title: fileName,
            params: { uri: previewUrl, name: fileName },
          })
        }
      >
        <img
          src={previewUrl}
          alt={fileName}
          className="max-h-80 w-full object-contain"
          loading="lazy"
        />
      </button>
    )
  }

  if (mediaType.startsWith('video/')) {
    return (
      <video
        src={previewUrl}
        controls
        className="max-h-80 w-full rounded-xl"
        preload="metadata"
      />
    )
  }

  if (mediaType.startsWith('audio/')) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
        <Music2Icon className="size-4 shrink-0 text-muted-foreground" />
        <audio src={previewUrl} controls className="h-8 flex-1" preload="metadata" />
      </div>
    )
  }

  return null
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
  const { t } = useTranslation('ai')
  const { filePath, offset, limit } = resolveReadInput(part)
  const range = formatRange(offset, limit)
  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'
  const tp = part.toolProgress
  const progressActive = tp?.status === 'active'
  const progressDone = tp?.status === 'done'
  const progressError = tp?.status === 'error'

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

  const inlineText = [displayPath, range].filter(Boolean).join(' ')

  const rawOutput =
    typeof part.output === 'string' ? part.output : safeStringify(part.output)
  const output = stripCatNPrefix(rawOutput)
  const hasOutput = output.trim().length > 0

  const mediaAttachments = React.useMemo(() => parseMediaAttachments(output), [output])
  const hasMedia = mediaAttachments.length > 0
  const displayOutput = React.useMemo(
    () => (hasMedia ? stripSystemTags(output) : output),
    [output, hasMedia],
  )
  const hasDisplayOutput = displayOutput.trim().length > 0
  const errorText =
    typeof part.errorText === 'string' && part.errorText.trim()
      ? part.errorText
      : undefined
  const language = guessLanguage(filePath)

  return (
    <Collapsible defaultOpen={hasMedia} className={cn('min-w-0 text-xs', className)}>
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
              {t('toolNames.Read', { defaultValue: 'Read' })}
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
            {range ? <span className="ml-1 text-muted-foreground">({range})</span> : null}
          </TooltipContent>
        ) : null}
      </Tooltip>
      <ToolOutputContent>
        {hasMedia ? (
          <>
            {mediaAttachments.map((att) => (
              <ReadToolMediaPreview
                key={att.path}
                attachment={att}
                projectId={projectId ?? undefined}
                sessionId={sessionId}
              />
            ))}
            {hasDisplayOutput && <ToolOutputCode code={displayOutput} language={language} />}
          </>
        ) : hasOutput ? (
          <ToolOutputCode code={output} language={language} />
        ) : errorText ? (
          <ToolOutputError message={errorText} />
        ) : progressError ? (
          <ToolOutputError message={tp?.errorText || '读取失败'} />
        ) : tp && (progressActive || progressDone) ? (
          <div className="space-y-1">
            {tp.accumulatedText ? (
              <ToolOutputText text={tp.accumulatedText} />
            ) : progressActive ? (
              <ToolOutputLoading label={tp.label || '读取中...'} />
            ) : null}
            {progressDone && tp.summary ? (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                <CheckCircle2Icon className="size-3" />
                <span>{tp.summary}</span>
              </div>
            ) : null}
          </div>
        ) : streaming ? (
          <ToolOutputLoading label="读取中..." />
        ) : null}
      </ToolOutputContent>
    </Collapsible>
  )
}
