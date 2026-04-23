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
import { ImageIcon, Loader2Icon, XCircleIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { AnyToolPart } from './shared/tool-utils'
import { isToolStreaming } from './shared/tool-utils'
import { parseInput } from './shared/office-tool-utils'
import { fetchBlobFromUri } from '@/lib/image/uri'
import { useChatSession } from '@/components/ai/context'
import { useProject } from '@/hooks/use-project'
import { createFileEntryFromUri, openFile } from '@/components/file/lib/open-file'
import { applyChatImageDrag } from '@/lib/image/drag'
import { ChatImageActions } from './shared/ChatImageActions'

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
  const dragUrl = srcValue ?? ''
  const dragName = srcValue ? srcValue.split('/').pop() : undefined

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
      <div className="flex h-[80px] items-center justify-center rounded-3xl bg-muted/30 text-xs text-muted-foreground">
        {t('tool.cloud.loading')}
      </div>
    )
  }

  return (
    <div
      className="group/image relative inline-block cursor-pointer overflow-hidden rounded-3xl"
      draggable
      onDragStart={(event) => {
        if (!dragUrl) return
        applyChatImageDrag(event, {
          url: dragUrl,
          name: dragName,
          thumbnailUrl: objectUrl,
        })
      }}
      onClick={handleClick}
    >
      <img
        src={objectUrl}
        alt="input"
        className="block max-h-[240px] max-w-full object-contain"
        draggable={false}
      />
      {dragUrl ? (
        <ChatImageActions url={dragUrl} name={dragName} objectUrl={objectUrl} />
      ) : null}
    </div>
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
  const { t } = useTranslation('ai')
  const input = parseInput(part)
  const streaming = isToolStreaming(part)
  const hasError = part.state === 'output-error' || part.state === 'output-denied'

  // Success: just the image with hover-reveal result overlay.
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

  // Pending / streaming / error: minimal inline layout — image preview + small status pill.
  return (
    <div className={cn('inline-flex flex-col items-start gap-1.5', className)}>
      {input?.image ? (
        <ImagePreview image={input.image} />
      ) : null}
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {streaming ? (
          <Loader2Icon className="size-3 animate-spin" />
        ) : hasError ? (
          <XCircleIcon className="size-3 text-destructive" />
        ) : (
          <ImageIcon className="size-3" />
        )}
        <span>
          {hasError
            ? t('tool.cloud.error')
            : streaming
              ? t('tool.cloud.loading')
              : t('toolNames.cloudImageUnderstand', { defaultValue: '图片理解' })}
        </span>
      </div>
    </div>
  )
}
