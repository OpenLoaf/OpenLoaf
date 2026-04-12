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
import { GlobeIcon, LoaderCircleIcon, XCircleIcon } from 'lucide-react'
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
import {
  asPlainObject,
  getToolName,
  isToolStreaming,
  type AnyToolPart,
} from './shared/tool-utils'
import { fetchBlobFromUri } from '@/lib/image/uri'

type SnapshotData = {
  url?: string
  title?: string
  text?: string
  screenshotUrl?: string
  screenshotBytes?: number
}

/** Extract snapshot data — handles BrowserSnapshot and legacy BrowserObserve/BrowserScreenshot shapes. */
function resolveSnapshot(raw: unknown): { task?: string; snapshot: SnapshotData } {
  const data = asPlainObject(raw)
  if (!data) return { snapshot: {} }
  if (typeof data.task === 'string' && data.snapshot && typeof data.snapshot === 'object') {
    return { task: data.task, snapshot: data.snapshot as SnapshotData }
  }
  return { snapshot: data as unknown as SnapshotData }
}

/** Parse output — the backend wraps data in { ok, data } or returns directly. */
function resolveOutput(part: AnyToolPart): { snapshot: SnapshotData; task?: string } {
  const output = asPlainObject(part.output)
  if (!output) return { snapshot: {} }
  const inner = asPlainObject(output.data) ?? output
  return resolveSnapshot(inner)
}

/** Build an inline summary for the collapsed trigger. */
function buildInlineText(snapshot: SnapshotData, task?: string): string {
  if (task) return task
  if (snapshot.title) return snapshot.title
  if (snapshot.url) return snapshot.url
  return ''
}

function ScreenshotPreview({ url }: { url: string }) {
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    let revoked = false
    fetchBlobFromUri(url)
      .then((blob) => {
        if (revoked) return
        setObjectUrl(URL.createObjectURL(blob))
      })
      .catch(() => {})
    return () => {
      revoked = true
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [url])

  if (!objectUrl) return null
  return (
    <div className="flex justify-center">
      <img
        src={objectUrl}
        alt="screenshot"
        className="max-h-[240px] max-w-full rounded-lg object-contain"
        draggable={false}
      />
    </div>
  )
}

function SnapshotContent({ snapshot, task }: { snapshot: SnapshotData; task?: string }) {
  const { t } = useTranslation('ai')
  const text = typeof snapshot.text === 'string' ? snapshot.text.trim() : ''

  return (
    <div className="space-y-2">
      {snapshot.screenshotUrl && (
        <ScreenshotPreview url={snapshot.screenshotUrl} />
      )}
      {task && (
        <div className="flex items-baseline gap-2 text-xs">
          <span className="shrink-0 text-muted-foreground">{t('tool.browser.task', { defaultValue: '任务' })}</span>
          <span className="truncate font-medium text-foreground">{task}</span>
        </div>
      )}
      {text && (
        <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/30 px-2 py-1.5 text-[11px] leading-relaxed text-foreground">
          {text}
        </pre>
      )}
    </div>
  )
}

export default function BrowserSnapshotTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const toolName = getToolName(part)
  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'
  const errorText =
    typeof part.errorText === 'string' && part.errorText.trim()
      ? part.errorText
      : undefined

  const { snapshot, task } = resolveOutput(part)
  const inlineText = buildInlineText(snapshot, task)
  const isDone = part.state === 'output-available'

  return (
    <Collapsible defaultOpen className={cn('min-w-0 text-xs', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <CollapsibleTrigger
            className={cn(
              'flex w-full items-center gap-1.5 rounded-full px-2.5 py-1',
              'transition-colors duration-150 hover:bg-muted/60',
            )}
          >
            <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="shrink-0 text-xs font-medium text-muted-foreground">{toolName}</span>
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
          <TooltipContent side="top" className="max-w-sm whitespace-pre-wrap font-mono text-xs">
            {inlineText}
          </TooltipContent>
        ) : null}
      </Tooltip>
      <CollapsibleContent className="px-5 py-2 text-xs">
        {isDone ? (
          <SnapshotContent snapshot={snapshot} task={task} />
        ) : hasError && errorText ? (
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
