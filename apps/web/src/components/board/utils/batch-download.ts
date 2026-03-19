/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { CanvasNodeElement } from '../engine/types'
import type { BoardFileContext } from '../core/BoardProvider'
import {
  isBoardRelativePath,
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from '../core/boardFilePath'
import { getPreviewEndpoint } from '@/lib/image/uri'
import { toast } from 'sonner'
import i18next from 'i18next'

/** Media node types eligible for batch download. */
const MEDIA_NODE_TYPES = new Set(['image', 'video'])

/** Resolve a board-scoped uri into a project-relative path. */
function resolveProjectRelativePath(
  uri: string,
  fileContext?: BoardFileContext,
) {
  const scope = resolveBoardFolderScope(fileContext)
  return resolveProjectPathFromBoardUri({
    uri,
    boardFolderScope: scope,
    currentProjectId: fileContext?.projectId,
    rootUri: fileContext?.rootUri,
  })
}

/** Resolve image uri to a browser-friendly download URL. */
function resolveImageDownloadUrl(
  props: Record<string, unknown>,
  fileContext?: BoardFileContext,
): string {
  const originalSrc = (props.originalSrc as string) || ''
  const previewSrc = (props.previewSrc as string) || ''
  const uri = originalSrc || previewSrc
  if (!uri) return ''
  if (
    uri.startsWith('data:') ||
    uri.startsWith('blob:') ||
    uri.startsWith('http://') ||
    uri.startsWith('https://')
  ) {
    return uri
  }
  const projectPath = resolveProjectRelativePath(uri, fileContext)
  if (!projectPath) return ''
  return getPreviewEndpoint(projectPath, {
    projectId: fileContext?.projectId,
  })
}

/** Resolve video sourcePath to a browser-friendly download URL. */
function resolveVideoDownloadUrl(
  props: Record<string, unknown>,
  fileContext?: BoardFileContext,
): string {
  const sourcePath = ((props.sourcePath as string) ?? '').trim()
  if (!sourcePath) return ''
  if (
    sourcePath.startsWith('http://') ||
    sourcePath.startsWith('https://')
  ) {
    return sourcePath
  }
  const scope = resolveBoardFolderScope(fileContext)
  const projectPath = resolveProjectPathFromBoardUri({
    uri: sourcePath,
    boardFolderScope: scope,
    currentProjectId: fileContext?.projectId,
    rootUri: fileContext?.rootUri,
  })
  const href = projectPath
    ? getPreviewEndpoint(projectPath, { projectId: fileContext?.projectId })
    : sourcePath
  return href || ''
}

/** Extract download URL and filename from a media node. */
function resolveMediaNodeDownload(
  node: CanvasNodeElement,
  fileContext?: BoardFileContext,
): { url: string; fileName: string } | null {
  const props = node.props as Record<string, unknown>

  if (node.type === 'image') {
    const url = resolveImageDownloadUrl(props, fileContext)
    if (!url) return null
    const fileName =
      (props.fileName as string) || 'image.png'
    return { url, fileName }
  }

  if (node.type === 'video') {
    const url = resolveVideoDownloadUrl(props, fileContext)
    if (!url) return null
    const sourcePath = (props.sourcePath as string) || ''
    const fileName =
      (props.fileName as string) ||
      sourcePath.split('/').pop() ||
      'video.mp4'
    return { url, fileName }
  }

  return null
}

/** Check whether any of the given nodes contain downloadable media. */
export function hasMediaNodes(nodes: CanvasNodeElement[]): boolean {
  return nodes.some((node) => MEDIA_NODE_TYPES.has(node.type))
}

/** Trigger a single file download via an anchor element. */
function triggerBrowserDownload(url: string, fileName: string): void {
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noreferrer'
  link.click()
}

/** Wait for a given number of milliseconds. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Batch download all image and video nodes from the selection.
 * Each download is staggered by 200ms to avoid browser blocking.
 */
export async function batchDownloadNodes(
  nodes: CanvasNodeElement[],
  fileContext?: BoardFileContext,
): Promise<void> {
  const mediaNodes = nodes.filter((node) => MEDIA_NODE_TYPES.has(node.type))
  if (mediaNodes.length === 0) return

  const downloads = mediaNodes
    .map((node) => resolveMediaNodeDownload(node, fileContext))
    .filter(
      (item): item is { url: string; fileName: string } => item !== null,
    )

  if (downloads.length === 0) return

  toast.info(
    i18next.t('board:selection.toolbar.batchDownloadProgress', {
      count: downloads.length,
      defaultValue: `正在下载 ${downloads.length} 个文件`,
    }),
  )

  for (let i = 0; i < downloads.length; i++) {
    const { url, fileName } = downloads[i]
    triggerBrowserDownload(url, fileName)
    if (i < downloads.length - 1) {
      await delay(200)
    }
  }
}
