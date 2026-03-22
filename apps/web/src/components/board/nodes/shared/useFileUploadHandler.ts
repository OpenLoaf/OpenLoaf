/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { useCallback, useEffect, useRef } from 'react'
import type { BoardFileContext } from '../../board-contracts'
import { saveBoardAssetFile } from '../../utils/board-asset'

export type UseFileUploadHandlerOptions<TProps extends Record<string, unknown>> = {
  /** The canvas element id — used to match 'board:trigger-upload' events. */
  elementId: string
  /** The board file context from useBoardContext(). */
  fileContext: BoardFileContext | undefined
  /** Callback to apply prop updates to the node. */
  onUpdate: (patch: Partial<TProps>) => void
  /** Fallback file name used when saving to the board asset folder. */
  fallbackName: string
  /** Prop key for the saved file path. Defaults to 'sourcePath'. */
  pathProp?: keyof TProps & string
  /** Prop key for the saved file name. Defaults to 'fileName'. */
  nameProp?: keyof TProps & string
  /**
   * Optional custom save function. When provided, the default
   * saveBoardAssetFile + patch logic is skipped entirely.
   * The caller is responsible for calling onUpdate.
   */
  saveFn?: (file: File, ctx: BoardFileContext) => Promise<void>
}

export type UseFileUploadHandlerReturn = {
  /** Ref to attach to the hidden <input type="file"> element. */
  fileInputRef: React.RefObject<HTMLInputElement | null>
  /** onChange handler for the hidden <input type="file"> element. */
  handleFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>
}

/**
 * Shared hook that handles the hidden file-input upload pattern used by
 * media nodes (VideoNode, AudioNode).
 *
 * Responsibilities:
 * 1. Provides a `fileInputRef` to attach to the hidden <input type="file">.
 * 2. Provides `handleFileInputChange` that saves the picked file to the board
 *    asset folder (or delegates to a custom `saveFn`) and patches the node props.
 * 3. Listens for the `board:trigger-upload` CustomEvent and clicks the hidden
 *    input when the event's detail matches `elementId`.
 */
export function useFileUploadHandler<TProps extends Record<string, unknown>>({
  elementId,
  fileContext,
  onUpdate,
  fallbackName,
  pathProp = 'sourcePath' as keyof TProps & string,
  nameProp = 'fileName' as keyof TProps & string,
  saveFn,
}: UseFileUploadHandlerOptions<TProps>): UseFileUploadHandlerReturn {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file || !fileContext?.boardFolderUri) return
      e.target.value = ''
      try {
        if (saveFn) {
          await saveFn(file, fileContext)
        } else {
          const relativePath = await saveBoardAssetFile({
            file,
            fallbackName,
            projectId: fileContext.projectId,
            boardFolderUri: fileContext.boardFolderUri,
          })
          onUpdate({
            [pathProp]: relativePath,
            [nameProp]: file.name,
          } as unknown as Partial<TProps>)
        }
      } catch { /* ignore save failure */ }
    },
    [fileContext, onUpdate, fallbackName, pathProp, nameProp, saveFn],
  )

  // 逻辑：监听工具栏上传按钮的自定义事件，触发隐藏文件选择器。
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === elementId) {
        fileInputRef.current?.click()
      }
    }
    document.addEventListener('board:trigger-upload', handler)
    return () => document.removeEventListener('board:trigger-upload', handler)
  }, [elementId])

  return { fileInputRef, handleFileInputChange }
}
