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
import {
  isBoardRelativePath,
  resolveBoardFolderScope,
  resolveProjectPathFromBoardUri,
} from '../../core/boardFilePath'
import { getBoardPreviewEndpoint, getPreviewEndpoint } from '@/lib/image/uri'

/**
 * Resolve a board-scoped URI into a project-relative path.
 * Returns an empty string when resolution fails.
 */
export function resolveProjectRelativePath(
  uri: string,
  fileContext?: BoardFileContext,
): string {
  const scope = resolveBoardFolderScope(fileContext)
  return resolveProjectPathFromBoardUri({
    uri,
    boardFolderScope: scope,
    currentProjectId: fileContext?.projectId,
    rootUri: fileContext?.rootUri,
  })
}

/**
 * Resolve a media URI to a browser-accessible URL.
 *
 * Resolution order:
 * 1. Already absolute (data:/blob:/http[s]:/) → returned as-is
 * 2. Board-relative path (asset/…) with a boardId → board preview endpoint
 * 3. Everything else → resolve to project-relative path, then preview endpoint
 *
 * Returns `undefined` when the URI is empty or cannot be resolved.
 */
export function resolveMediaSource(
  src: string | undefined,
  fileContext: BoardFileContext | undefined,
): string | undefined {
  if (!src) return undefined
  if (
    src.startsWith('data:') ||
    src.startsWith('blob:') ||
    src.startsWith('http://') ||
    src.startsWith('https://')
  ) {
    return src
  }
  if (fileContext?.boardId && isBoardRelativePath(src)) {
    return getBoardPreviewEndpoint(src, {
      boardId: fileContext.boardId,
      projectId: fileContext.projectId,
    })
  }
  const projectPath = resolveProjectRelativePath(src, fileContext)
  if (!projectPath) return undefined
  return getPreviewEndpoint(projectPath, {
    projectId: fileContext?.projectId,
  })
}

/**
 * Resolve the default directory for save-file dialogs.
 * Prefers the board folder, falls back to the project root.
 */
export function resolveDownloadDefaultDir(fileContext?: BoardFileContext): string {
  const boardFolderUri = fileContext?.boardFolderUri?.trim()
  if (boardFolderUri?.startsWith('file://')) return boardFolderUri
  const rootUri = fileContext?.rootUri?.trim()
  if (rootUri?.startsWith('file://')) return rootUri
  return ''
}
