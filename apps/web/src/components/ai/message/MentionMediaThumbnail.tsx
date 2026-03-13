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
import { FileText } from 'lucide-react'
import { fetchBlobFromUri } from '@/lib/image/uri'
import { getFileLabel } from '@/components/ai/input/chat-input-utils'
import { createFileEntryFromUri, openFile } from '@/components/file/lib/open-file'
import { useChatSession } from '@/components/ai/context'
import { useProject } from '@/hooks/use-project'

const IMAGE_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'avif', 'tiff', 'tif', 'heic', 'heif',
])

const IMAGE_MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
}

const VIDEO_EXTS = new Set([
  'mp4', 'mov', 'avi', 'mkv', 'webm', 'flv',
])

function getExtension(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}

export function isImagePath(filePath: string): boolean {
  return IMAGE_EXTS.has(getExtension(filePath))
}

export function isVideoPath(filePath: string): boolean {
  return VIDEO_EXTS.has(getExtension(filePath))
}

export function isMediaPath(filePath: string): boolean {
  return isImagePath(filePath) || isVideoPath(filePath)
}

function MentionFallbackChip({ filePath }: { filePath: string }) {
  const label = getFileLabel(filePath)
  return (
    <span
      data-openloaf-mention="true"
      data-mention-value={filePath}
      data-slate-value={filePath}
      className="inline-flex items-center gap-[3px] align-bottom py-px px-1.5 mx-0.5 rounded-md bg-ol-blue text-white text-xs font-medium leading-[18px] cursor-pointer select-none whitespace-nowrap max-w-[200px] hover:bg-ol-blue/90 transition-colors"
    >
      <FileText className="size-3 shrink-0" />
      <span className="overflow-hidden text-ellipsis">{label}</span>
    </span>
  )
}

function useFileOpen(filePath: string) {
  const { projectId, tabId } = useChatSession()
  const projectQuery = useProject(projectId)
  const projectRootUri = projectQuery.data?.project?.rootUri ?? undefined

  return React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      if (!filePath) return
      const parts = filePath.split('/')
      const name = parts[parts.length - 1] ?? 'file'
      const uri = filePath.startsWith('/') ? `file://${filePath}` : filePath
      const entry = createFileEntryFromUri({ uri, name })
      if (!entry) return
      openFile({
        entry,
        tabId,
        projectId: projectId ?? undefined,
        rootUri: projectRootUri,
        mode: 'stack',
        readOnly: true,
      })
    },
    [filePath, tabId, projectId, projectRootUri],
  )
}

export function MentionImageThumbnail({ path: filePath }: { path: string }) {
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)
  const handleClick = useFileOpen(filePath)
  const { projectId } = useChatSession()

  React.useEffect(() => {
    let revoked = false
    fetchBlobFromUri(filePath, { projectId: projectId ?? undefined })
      .then((blob) => {
        if (revoked) return
        const ext = getExtension(filePath)
        const expectedMime = IMAGE_MIME_MAP[ext]
        const typedBlob = expectedMime && !blob.type.includes(ext)
          ? new Blob([blob], { type: expectedMime })
          : blob
        const url = URL.createObjectURL(typedBlob)
        setObjectUrl(url)
      })
      .catch(() => {
        if (!revoked) setFailed(true)
      })
    return () => {
      revoked = true
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [filePath, projectId])

  if (failed) return <MentionFallbackChip filePath={filePath} />

  if (!objectUrl) {
    return (
      <span className="inline-block align-bottom mx-0.5 h-[48px] w-[64px] rounded-md bg-muted/60 animate-pulse" />
    )
  }

  return (
    <span
      role="button"
      tabIndex={0}
      className="inline-block align-bottom mx-0.5 cursor-pointer rounded-md overflow-hidden border border-border/40 hover:border-blue-400 transition-colors"
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter') handleClick(e as unknown as React.MouseEvent) }}
    >
      <img
        src={objectUrl}
        alt={getFileLabel(filePath)}
        className="max-h-[80px] max-w-[160px] object-contain"
        onError={() => setFailed(true)}
        draggable={false}
      />
    </span>
  )
}

export function MentionVideoThumbnail({ path: filePath }: { path: string }) {
  const [objectUrl, setObjectUrl] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)
  const handleClick = useFileOpen(filePath)
  const { projectId } = useChatSession()

  React.useEffect(() => {
    let revoked = false
    fetchBlobFromUri(filePath, { projectId: projectId ?? undefined })
      .then((blob) => {
        if (revoked) return
        const url = URL.createObjectURL(blob)
        setObjectUrl(url)
      })
      .catch(() => {
        if (!revoked) setFailed(true)
      })
    return () => {
      revoked = true
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [filePath, projectId])

  if (failed) return <MentionFallbackChip filePath={filePath} />

  if (!objectUrl) {
    return (
      <span className="inline-block align-bottom mx-0.5 h-[48px] w-[64px] rounded-md bg-muted/60 animate-pulse" />
    )
  }

  return (
    <span
      role="button"
      tabIndex={0}
      className="inline-block align-bottom mx-0.5 cursor-pointer rounded-md overflow-hidden border border-border/40 hover:border-blue-400 transition-colors"
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter') handleClick(e as unknown as React.MouseEvent) }}
    >
      <video
        src={objectUrl}
        preload="metadata"
        muted
        className="max-h-[80px] max-w-[160px] object-contain"
        onError={() => setFailed(true)}
        draggable={false}
      />
    </span>
  )
}
