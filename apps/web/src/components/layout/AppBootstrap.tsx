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
import { getProjectWindowBootstrapPayload } from "@/lib/window-mode"
import { useAppView } from "@/hooks/use-app-view"
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
        section: "assistant",
      })
      return
    }

    // First launch with no saved state: create a default AI assistant view.
    navigate({
      title: DEFAULT_TAB_INFO.titleKey,
      icon: DEFAULT_TAB_INFO.icon,
      leftWidthPercent: 0,
      rightChatCollapsed: false,
    })
  }, [isLoading, initialized, navigate])

  return null
}
