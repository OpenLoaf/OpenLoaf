/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * CloudImageUnderstandTool — shows the input image + question and the text result
 * returned by the cloud OCR / VQA / captioning tool.
 *
 * Output shape: JSON `{ ok, text, ... }` — we extract the `text` field rather than
 * rendering raw JSON. parseOutput() would mis-classify a plain-string result as an
 * error, so we read part.output directly and bypass the shell for success state.
 */
'use client'

import * as React from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { AnyToolPart } from './shared/tool-utils'
import OfficeToolShell from './shared/OfficeToolShell'
import { getToolKind, EmptyView, parseInput } from './shared/office-tool-utils'
import { fetchBlobFromUri } from '@/lib/image/uri'
import { useChatSession } from '@/components/ai/context'
import { useProject } from '@/hooks/use-project'
import { createFileEntryFromUri, openFile } from '@/components/file/lib/open-file'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Only http/https/data URIs are safe to use directly as <img src>.
// Everything else (absolute file paths, relative paths, ${CURRENT_CHAT_DIR}/... templates)
// must go through the preview endpoint.
const DIRECT_URL_RE = /^(https?:|data:)/i

function resolveImageSrc(image: unknown): { kind: 'url' | 'path'; value: string } | null {
  let val: string | null = null
  if (typeof image === 'string' && image.trim()) {
    val = image.trim()
  } else if (image && typeof image === 'object') {
    const obj = image as Record<string, unknown>
    if (typeof obj.url === 'string' && obj.url.trim()) val = obj.url.trim()
    else if (typeof obj.path === 'string' && obj.path.trim()) val = obj.path.trim()
  }
  if (!val) return null
  return { kind: DIRECT_URL_RE.test(val) ? 'url' : 'path', value: val }
}

function extractResultText(output: unknown): string {
  if (typeof output === 'string') {
    const trimmed = output.trim()
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>
        if (typeof parsed.text === 'string') return parsed.text
        if (typeof parsed.result === 'string') return parsed.result
      } catch {}
    }
    return trimmed
  }
  if (output && typeof output === 'object') {
    const obj = output as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.result === 'string') return obj.result
  }
  return ''
}

// ---------------------------------------------------------------------------
// ImagePreview
// ---------------------------------------------------------------------------

function ImagePreview({ image }: { image: unknown }) {
  const { t } = useTranslation('ai')
  const { sessionId, projectId, tabId } = useChatSession()
  const projectQuery = useProject(projectId)
  const projectRootUri = projectQuery.data?.project?.rootUri ?? undefined
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null)

  const src = resolveImageSrc(image)
  const srcKind = src?.kind
  const srcValue = src?.value

  React.useEffect(() => {
    if (!srcKind || !srcValue) return
    if (srcKind === 'url') {
      setObjectUrl(srcValue)
      return
    }
    let revoked = false
    fetchBlobFromUri(srcValue, {
      projectId: projectId ?? undefined,
      sessionId: sessionId ?? undefined,
    })
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
  }, [srcKind, srcValue, projectId, sessionId])

  const handleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!srcValue) return
      const openUri = srcKind === 'path' && srcValue.startsWith('/')
        ? `file://${srcValue}`
        : srcValue
      const name = openUri.split('/').pop() ?? 'image'
      const entry = createFileEntryFromUri({ uri: openUri, name })
      if (!entry) return
      openFile({ entry, tabId, projectId: projectId ?? undefined, sessionId, rootUri: projectRootUri })
    },
    [srcKind, srcValue, tabId, projectId, sessionId, projectRootUri],
  )

  if (!src) return null

  if (!objectUrl) {
    return (
      <div className="flex h-[80px] items-center justify-center rounded-lg bg-muted/30 text-xs text-muted-foreground">
        {t('tool.cloud.loading')}
      </div>
    )
  }

  return (
    <img
      src={objectUrl}
      alt="input"
      className="max-h-[180px] max-w-full cursor-pointer rounded-lg object-contain"
      draggable={false}
      onClick={handleClick}
    />
  )
}

// ---------------------------------------------------------------------------
// ImagePreviewWithOverlay — hover state tracks the wrapper div (same size as image)
// ---------------------------------------------------------------------------

function ImagePreviewWithOverlay({
  image,
  resultText,
  className,
}: {
  image: unknown
  resultText: string
  className?: string
}) {
  const [hovered, setHovered] = React.useState(false)

  return (
    <div
      className={cn('relative inline-block max-w-xl', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <ImagePreview image={image} />
      {resultText && (
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 max-h-[60%] overflow-auto rounded-b-lg bg-black/70 px-2.5 py-2 transition-opacity duration-150',
            hovered ? 'opacity-100' : 'opacity-0',
          )}
        >
          <p className="whitespace-pre-wrap break-words text-[11px] leading-[1.5] text-white">
            {resultText}
          </p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default function CloudImageUnderstandTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const toolKind = getToolKind(part)
  const input = parseInput(part)

  // Success: show only the image; hover over the image reveals the result as an overlay.
  if (part.state === 'output-available') {
    const resultText = extractResultText(part.output)

    return (
      <ImagePreviewWithOverlay
        image={input?.image}
        resultText={resultText}
        className={className}
      />
    )
  }

  // Pending / streaming / error: show image with shell for error/approval handling.
  return (
    <OfficeToolShell
      part={part}
      className={cn('max-w-xl', className)}
      toolKind={toolKind}
      isMutate={false}
      i18nPrefix="tool.cloud"
      defaultOpen
    >
      {(ctx) => {
        if (!ctx.input) return <EmptyView />
        return <ImagePreview image={ctx.input.image} />
      }}
    </OfficeToolShell>
  )
}
