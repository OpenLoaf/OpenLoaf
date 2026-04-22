/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client"

import { useEffect } from "react"
import { DEFAULT_TAB_INFO } from "@openloaf/api/common"
import { openProjectShell } from "@/lib/project-shell"
import { getProjectWindowBootstrapPayload, getBoardWindowBootstrapPayload } from "@/lib/window-mode"
import { useAppView } from "@/hooks/use-app-view"
import { useLayoutState } from "@/hooks/use-layout-state"
import { useProjectStorageRootQuery } from "@/hooks/use-project-storage-root-uri"

/**
 * Bootstrap application side effects.
 */
export function AppBootstrap() {
  const { isLoading } = useProjectStorageRootQuery()
  const initialized = useAppView((s) => s.initialized)
  const navigate = useAppView((s) => s.navigate)

  useEffect(() => {
    if (isLoading) return
    if (initialized) return

    const projectWindowPayload = getProjectWindowBootstrapPayload()
    if (projectWindowPayload) {
      openProjectShell({
        projectId: projectWindowPayload.projectId,
        rootUri: projectWindowPayload.rootUri,
        title: projectWindowPayload.title,
        icon: projectWindowPayload.icon,
        section: "files",
      })
      return
    }

    const boardWindowPayload = getBoardWindowBootstrapPayload()
    if (boardWindowPayload) {
      const baseId = `board:${boardWindowPayload.boardFolderUri}`
      useLayoutState.getState().setRightChatCollapsed(true)
      navigate({
        title: boardWindowPayload.title || "Canvas",
        icon: "🎨",
        leftWidthPercent: 100,
        base: {
          id: baseId,
          component: "board-viewer",
          params: {
            boardFolderUri: boardWindowPayload.boardFolderUri,
            boardFileUri: boardWindowPayload.boardFileUri,
            boardId: boardWindowPayload.boardId,
            projectId: boardWindowPayload.projectId,
            rootUri: boardWindowPayload.rootUri,
          },
        },
      })
      return
    }

    // First launch with no saved state: create a default AI assistant view
    // with the chat panel open.
    useLayoutState.getState().setRightChatCollapsed(false)
    navigate({
      icon: DEFAULT_TAB_INFO.icon,
      leftWidthPercent: 0,
    })
  }, [isLoading, initialized, navigate])

  return null
}
