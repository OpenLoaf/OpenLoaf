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

import { startTransition, useCallback } from 'react'
import i18next from 'i18next'
import { useTabs } from '@/hooks/use-tabs'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { useNavigation } from '@/hooks/use-navigation'
import { AI_ASSISTANT_TAB_INPUT, TEMP_CHAT_TAB_INPUT, TEMP_CANVAS_TAB_INPUT } from '@openloaf/api/common'
import { buildFileUriFromRoot } from '@/components/project/filesystem/utils/file-system-utils'
import { BOARD_INDEX_FILE_NAME } from '@/lib/file-name'
import { useQuery } from '@tanstack/react-query'
import { trpc } from '@/utils/trpc'

export function useSidebarNavigation() {
  const workspaceCompatQuery = useQuery({
    ...trpc.settings.getWorkspaceCompat.queryOptions(),
    staleTime: 5 * 60 * 1000,
  })
  const addTab = useTabs((s) => s.addTab)
  const setActiveTab = useTabs((s) => s.setActiveTab)
  const setTabTitle = useTabs((s) => s.setTabTitle)
  const setTabIcon = useTabs((s) => s.setTabIcon)
  const tabs = useTabs((s) => s.tabs)
  const runtimeByTabId = useTabRuntime((s) => s.runtimeByTabId)
  const setTabBase = useTabRuntime((s) => s.setTabBase)
  const clearStack = useTabRuntime((s) => s.clearStack)
  const setActiveView = useNavigation((s) => s.setActiveView)
  const setActiveWorkspaceChat = useNavigation((s) => s.setActiveWorkspaceChat)

  const openChat = useCallback(
    (chatId: string, chatTitle: string) => {
      const existingTab = tabs.find(
        (tab) => tab.chatSessionId === chatId,
      )

      if (existingTab) {
        startTransition(() => setActiveTab(existingTab.id))
      } else {
        addTab({
          createNew: true,
          title: chatTitle,
          icon: '\uD83D\uDCAC',
          chatSessionId: chatId,
          chatParams: { projectId: null },
          leftWidthPercent: 0,
          rightChatCollapsed: false,
          chatLoadHistory: true,
        })
      }

      setActiveWorkspaceChat(chatId)
    },
    [tabs, addTab, setActiveTab, setActiveWorkspaceChat],
  )

  const openTempChat = useCallback(() => {
    const tabTitle = i18next.t(TEMP_CHAT_TAB_INPUT.titleKey)

    const state = useTabs.getState()
    const rtById = useTabRuntime.getState().runtimeByTabId
    const existing = state.tabs.find((tab) => {
      if (rtById[tab.id]?.base) return false
      return tab.title === tabTitle
    })

    if (existing) {
      startTransition(() => setActiveTab(existing.id))
    } else {
      addTab({
        createNew: true,
        title: tabTitle,
        icon: TEMP_CHAT_TAB_INPUT.icon,
        leftWidthPercent: 0,
        rightChatCollapsed: false,
      })
    }

    setActiveWorkspaceChat(null)
    setActiveView('ai-assistant')
  }, [addTab, setActiveTab, setActiveView, setActiveWorkspaceChat])

  const openTempCanvas = useCallback(() => {
    const rootUri = workspaceCompatQuery.data?.rootUri
    if (!rootUri) return
    const tabTitle = i18next.t(TEMP_CANVAS_TAB_INPUT.titleKey)

    const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase()
    const canvasLabel = i18next.t('nav:canvasList.defaultName')
    const boardName = `tnboard_${canvasLabel}_${randomSuffix}`
    const boardFolderUri = buildFileUriFromRoot(rootUri, `.openloaf/boards/${boardName}`)
    const boardFileUri = buildFileUriFromRoot(rootUri, `.openloaf/boards/${boardName}/${BOARD_INDEX_FILE_NAME}`)
    addTab({
      createNew: true,
      title: tabTitle,
      icon: TEMP_CANVAS_TAB_INPUT.icon,
      leftWidthPercent: 100,
      base: {
        id: `board:${boardFolderUri}`,
        component: 'board-viewer',
        params: { boardFolderUri, boardFileUri, rootUri },
      },
    })

    setActiveWorkspaceChat(null)
    setActiveView('canvas-list')
  }, [workspaceCompatQuery.data?.rootUri, addTab, setActiveView, setActiveWorkspaceChat])

  return { openChat, openTempChat, openTempCanvas }
}
