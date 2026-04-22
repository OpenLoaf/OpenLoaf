/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * MacosObserveTool — screenshot-first renderer for `MacosObserve`.
 *
 * Success state mirrors CloudModelGenerateTool: skip the collapsible shell
 * entirely, render a bare <img> of the captured screenshot. The AX tree in
 * the tool output is only useful to the model — the user sees the picture.
 */
'use client'

import * as React from 'react'
import { LoaderCircleIcon, MonitorIcon, XCircleIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getToolName, type AnyToolPart } from './shared/tool-utils'
import { fetchBlobFromUri } from '@/lib/image/uri'
import { useChatSession } from '@/components/ai/context'
import { useProject } from '@/hooks/use-project'
import { createFileEntryFromUri, openFile } from '@/components/file/lib/open-file'

// Pulls the first attachment path out of the tool's string output. MacosObserve
// prepends `<system-tag type="attachment" path="..." media-type="..."/>` when a
// screenshot was captured (see apps/server/src/ai/tools/macosControlTools.ts).
function extractScreenshotPath(output: unknown): string | null {
  if (typeof output !== 'string') return null
  const m = output.match(
    /<system-tag\s+type="attachment"\s+path="([^"]+)"/,
  )
  return m?.[1] ?? null
}

function ScreenshotImage({ path }: { path: string }) {
  const { projectId, sessionId, tabId } = useChatSession()
  const projectQuery = useProject(projectId)
  const projectRootUri = projectQuery.data?.project?.rootUri ?? undefined
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    let createdUrl: string | null = null
    fetchBlobFromUri(path, {
      projectId: projectId ?? undefined,
      sessionId: sessionId ?? undefined,
    })
      .then((blob) => {
        if (cancelled) return
        createdUrl = URL.createObjectURL(blob)
        setObjectUrl(createdUrl)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [path, projectId, sessionId])

  // MacosObserve writes absolute FS paths (e.g. /Users/zhao/OpenLoafData/…/
  // asset/macos-<toolCallId>.jpg) — wrap as file:// so openFile's scoped-path
  // resolver can handle it without relying on sessionId expansion.
  const handleClick = React.useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation()
      const uri = path.startsWith('/') ? `file://${path}` : path
      const name = path.split('/').pop() ?? 'screenshot.jpg'
      const entry = createFileEntryFromUri({ uri, name })
      if (!entry) return
      openFile({ entry, tabId, projectId: projectId ?? undefined, sessionId, rootUri: projectRootUri })
    },
    [path, tabId, projectId, sessionId, projectRootUri],
  )

  if (!objectUrl) {
    return (
      <div className="flex h-[120px] w-full items-center justify-center text-xs text-muted-foreground">
        <LoaderCircleIcon className="size-3 animate-spin" />
      </div>
    )
  }
  return (
    <img
      src={objectUrl}
      alt="macos screenshot"
      className="max-h-[320px] max-w-full cursor-pointer rounded-lg object-contain"
      draggable={false}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter') handleClick(e)
      }}
    />
  )
}

export default function MacosObserveTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const toolName = getToolName(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'
  const streaming = !hasError && part.state !== 'output-available'

  // Success with a screenshot: bare image, no shell — matches CloudModelGenerate.
  if (part.state === 'output-available') {
    const path = extractScreenshotPath(part.output)
    if (path) {
      return (
        <div className={cn('max-w-xl', className)}>
          <ScreenshotImage path={path} />
        </div>
      )
    }
    // Succeeded but no screenshot in the payload (e.g. includeScreenshot=false
    // or helper returned only an error string): auto-hide. The AX tree text is
    // for the model, not the user.
    return null
  }

  // Streaming / error: compact single-line status pill so the user has some
  // hint something happened; keep it tiny since the tool is meant to be
  // visually subordinate to its screenshot.
  const errorText =
    hasError && typeof part.errorText === 'string' && part.errorText.trim()
      ? part.errorText.trim()
      : null
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs',
        hasError ? 'text-destructive' : 'text-muted-foreground',
        className,
      )}
    >
      <MonitorIcon className="size-3.5 shrink-0" />
      <span className="font-medium">{toolName}</span>
      {streaming ? (
        <LoaderCircleIcon className="size-3 shrink-0 animate-spin" />
      ) : hasError ? (
        <>
          <XCircleIcon className="size-3 shrink-0" />
          {errorText ? (
            <span className="min-w-0 truncate">{errorText}</span>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
