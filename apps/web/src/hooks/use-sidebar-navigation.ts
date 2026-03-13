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
import { useOpenSessionIds } from '@/hooks/use-open-session-ids'
import { useProjectOpen } from '@/hooks/use-project-open'
import { AI_ASSISTANT_TAB_INPUT, TEMP_CHAT_TAB_INPUT, TEMP_CANVAS_TAB_INPUT } from '@openloaf/api/common'
import { buildBoardFolderUri, buildFileUriFromRoot } from '@/components/project/filesystem/utils/file-system-utils'
import { BOARD_INDEX_FILE_NAME } from '@/lib/file-name'
import { resolveProjectModeProjectShell } from '@/lib/project-mode'
import { buildBoardChatTabState } from '@/components/board/utils/board-chat-tab'

export function useSidebarNavigation() {
  const addTab = useTabs((s) => s.addTab)
  const activeTabId = useTabs((s) => s.activeTabId)
  const setActiveTab = useTabs((s) => s.setActiveTab)
  const setActiveTabSession = useTabs((s) => s.setActiveTabSession)
  const setTabChatParams = useTabs((s) => s.setTabChatParams)
  const setSessionProjectId = useTabs((s) => s.setSessionProjectId)
  const tabs = useTabs((s) => s.tabs)
  const runtimeByTabId = useTabRuntime((s) => s.runtimeByTabId)
  const setActiveView = useNavigation((s) => s.setActiveView)
  const setActiveGlobalChat = useNavigation((s) => s.setActiveGlobalChat)
  const { sessionToTabId } = useOpenSessionIds()
  const openProjectWithPreference = useProjectOpen()
  const activeTab = activeTabId
    ? tabs.find((item) => item.id === activeTabId)
    : undefined
  const activeProjectShell = resolveProjectModeProjectShell(activeTab?.projectShell)
  const activeProjectId = activeProjectShell?.projectId

  const currentTabSessionIds = activeTabId
    ? (() => {
        const tab = tabs.find((item) => item.id === activeTabId)
        if (!tab) return new Set<string>()
        const sessionIds =
          Array.isArray(tab.chatSessionIds) && tab.chatSessionIds.length > 0
            ? tab.chatSessionIds
            : [tab.chatSessionId]
        return new Set(
          sessionIds.filter((sessionId): sessionId is string => typeof sessionId === 'string' && Boolean(sessionId)),
        )
      })()
    : new Set<string>()

  const openChat = useCallback(
    (chatId: string, chatTitle: string, input?: { projectId?: string | null }) => {
      const projectId = input?.projectId?.trim() || activeProjectId

      // 逻辑：优先复用当前 Tab 中已存在的会话，避免打断用户当前的多会话上下文。
      if (activeTabId && currentTabSessionIds.has(chatId)) {
        if (projectId) {
          setSessionProjectId(activeTabId, chatId, projectId)
          setActiveGlobalChat(null)
        } else {
          setActiveGlobalChat(chatId)
        }
        startTransition(() => {
          setActiveTabSession(activeTabId, chatId, { loadHistory: true })
        })
        return
      }

      const ownerTabId = sessionToTabId.get(chatId)
      if (ownerTabId) {
        if (projectId) {
          setSessionProjectId(ownerTabId, chatId, projectId)
          setActiveGlobalChat(null)
        } else {
          setActiveGlobalChat(chatId)
        }
        startTransition(() => {
          setActiveTab(ownerTabId)
          setActiveTabSession(ownerTabId, chatId, { loadHistory: true })
        })
        return
      }

      addTab({
        createNew: true,
        title: chatTitle,
        icon: '\uD83D\uDCAC',
        chatSessionId: chatId,
        chatParams: { projectId: projectId ?? null },
        leftWidthPercent: 0,
        rightChatCollapsed: false,
        chatLoadHistory: true,
      })

      if (projectId) {
        setActiveGlobalChat(null)
        return
      }
      setActiveGlobalChat(chatId)
    },
    [
      activeTabId,
      activeProjectId,
      addTab,
      currentTabSessionIds,
      sessionToTabId,
      setActiveTab,
      setActiveTabSession,
      setActiveGlobalChat,
      setSessionProjectId,
    ],
  )

  const openProject = useCallback(
    (input: {
      projectId: string
      title: string
      rootUri: string
      icon?: string | null
    }) => {
      openProjectWithPreference(input, { section: 'assistant' })
      setActiveGlobalChat(null)
    },
    [openProjectWithPreference, setActiveGlobalChat],
  )

  const openBoard = useCallback(
    (input: {
      boardId: string
      title: string
      folderUri: string
      rootUri: string
      projectId?: string | null
    }) => {
      const resolvedProjectId = input.projectId?.trim() || activeProjectId
      const boardFolderUri = buildBoardFolderUri(input.rootUri, input.folderUri)
      const boardFileUri = buildBoardFolderUri(
        input.rootUri,
        `${input.folderUri}${BOARD_INDEX_FILE_NAME}`,
      )
      const baseId = `board:${boardFolderUri}`

      const existingTab = tabs.find((tab) => {
        const base = runtimeByTabId[tab.id]?.base
        return base?.id === baseId
      })

      if (existingTab) {
        const boardChatState = buildBoardChatTabState(input.boardId, resolvedProjectId)
        setActiveTabSession(existingTab.id, boardChatState.chatSessionId, {
          loadHistory: true,
          replaceCurrent: true,
        })
        setTabChatParams(existingTab.id, boardChatState.chatParams)
        startTransition(() => {
          setActiveTab(existingTab.id)
        })
        setActiveGlobalChat(null)
        return
      }

      addTab({
        createNew: true,
        title: input.title,
        icon: '\uD83C\uDFA8',
        ...buildBoardChatTabState(input.boardId, resolvedProjectId),
        leftWidthPercent: 100,
        base: {
          id: baseId,
          component: 'board-viewer',
          params: {
            boardFolderUri,
            boardFileUri,
            boardId: input.boardId,
            projectId: resolvedProjectId,
            rootUri: input.rootUri,
          },
        },
      })
      setActiveGlobalChat(null)
    },
    [
      activeProjectId,
      tabs,
      runtimeByTabId,
      addTab,
      setActiveTab,
      setActiveTabSession,
      setTabChatParams,
      setActiveGlobalChat,
    ],
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

    setActiveGlobalChat(null)
    setActiveView('ai-assistant')
  }, [addTab, setActiveTab, setActiveView, setActiveGlobalChat])

  const openTempCanvas = useCallback(() => {
    const tabTitle = i18next.t(TEMP_CANVAS_TAB_INPUT.titleKey)

    const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase()
    const canvasLabel = i18next.t('nav:canvasList.defaultName')
    const boardName = `tnboard_${canvasLabel}_${randomSuffix}`
    // 逻辑：临时画布先保留相对板路径，具体全局根目录由 board-viewer 通过项目存储根查询补齐。
    const boardFolderUri = `.openloaf/boards/${boardName}`
    const boardFileUri = `.openloaf/boards/${boardName}/${BOARD_INDEX_FILE_NAME}`
    addTab({
      createNew: true,
      title: tabTitle,
      icon: TEMP_CANVAS_TAB_INPUT.icon,
      leftWidthPercent: 100,
      base: {
        id: `board:${boardFolderUri}`,
        component: 'board-viewer',
        params: { boardFolderUri, boardFileUri },
      },
    })

    setActiveGlobalChat(null)
    setActiveView('canvas-list')
  }, [addTab, setActiveView, setActiveGlobalChat])

  return { openChat, openProject, openBoard, openTempChat, openTempCanvas }
}
