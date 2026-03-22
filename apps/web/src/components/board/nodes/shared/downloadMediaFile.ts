/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { BoardFileContext } from '../../board-contracts'
import { arrayBufferToBase64 } from '../../utils/base64'
import { resolveDownloadDefaultDir, resolveMediaSource } from './resolveMediaSource'

export type DownloadMediaFileOptions = {
  /** Raw source path / URI of the media file. */
  src: string | undefined
  /** Suggested file name for the save dialog and browser download. */
  fileName: string
  /** Board file context used to resolve board-relative paths. */
  fileContext?: BoardFileContext
  /**
   * Label shown in the Electron save-file filter list.
   * Defaults to 'Media'.
   */
  filterLabel?: string
}

/**
 * Download a board media file.
 *
 * - Resolves `src` to a browser-accessible URL via `resolveMediaSource`.
 * - In Electron: fetches the file, converts to base64, and invokes
 *   `window.openloafElectron.saveFile` with a native save dialog.
 * - In browser: creates a temporary anchor element and triggers a download.
 */
export async function downloadMediaFile({
  src,
  fileName,
  fileContext,
  filterLabel = 'Media',
}: DownloadMediaFileOptions): Promise<void> {
  const href = resolveMediaSource(src, fileContext)
  if (!href) return

  const saveFile = window.openloafElectron?.saveFile
  if (saveFile) {
    try {
      const response = await fetch(href)
      if (!response.ok) throw new Error('download failed')
      const buffer = await response.arrayBuffer()
      const contentBase64 = arrayBufferToBase64(buffer)
      const defaultDir = resolveDownloadDefaultDir(fileContext)
      const extension = fileName.split('.').pop() || ''
      const result = await saveFile({
        contentBase64,
        defaultDir: defaultDir || undefined,
        suggestedName: fileName,
        filters: extension ? [{ name: filterLabel, extensions: [extension] }] : [],
      })
      if (result?.ok || result?.canceled) return
    } catch {
      // 逻辑：桌面保存失败时回退到浏览器下载方式。
    }
  }

  const link = document.createElement('a')
  link.href = href
  link.download = fileName
  link.rel = 'noreferrer'
  link.click()
}
