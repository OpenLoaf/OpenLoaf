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

import { useCallback } from 'react'
import i18next from 'i18next'
import { useAppView } from '@/hooks/use-app-view'
import { useLayoutState } from '@/hooks/use-layout-state'
import { useNavigation } from '@/hooks/use-navigation'
import { useProjectOpen } from '@/hooks/use-project-open'
import { TEMP_CHAT_TAB_INPUT, TEMP_CANVAS_TAB_INPUT } from '@openloaf/api/common'
import { buildBoardFolderUri } from '@/components/project/filesystem/utils/file-system-utils'
import { BOARD_INDEX_FILE_NAME } from '@/lib/file-name'
import { resolveProjectModeProjectShell } from '@/lib/project-mode'
import { buildBoardChatTabState } from '@/components/board/utils/board-chat-tab'

export function useSidebarNavigation() {
  const navigate = useAppView((s) => s.navigate)
  const setChatSession = useAppView((s) => s.setChatSession)
  const setChatParams = useAppView((s) => s.setChatParams)
  const projectShell = useAppView((s) => s.projectShell)
  const setActiveView = useNavigation((s) => s.setActiveView)
  const setActiveGlobalChat = useNavigation((s) => s.setActiveGlobalChat)
  const openProjectWithPreference = useProjectOpen()
  const activeProjectShell = resolveProjectModeProjectShell(projectShell)
  const activeProjectId = activeProjectShell?.projectId

  const openChat = useCallback(
    (chatId: string, chatTitle: string, input?: { projectId?: string | null }) => {
      const projectId = input?.projectId?.trim() || activeProjectId

      // Single-view: just set the chat session directly
      if (projectId) {
        setChatParams({ projectId, boardId: undefined })
        setActiveGlobalChat(null)
      } else {
        // Clear stale board/project params when switching to global chat
        setChatParams({ projectId: undefined, boardId: undefined })
        setActiveGlobalChat(chatId)
      }
      setChatSession(chatId, true)
    },
    [activeProjectId, setChatSession, setChatParams, setActiveGlobalChat],
  )

  const openProject = useCallback(
    (input: {
      projectId: string
      title: string
      rootUri: string
      icon?: string | null
    }) => {
      // 逻辑：Sidebar 项目入口统一落到项目看板。
      openProjectWithPreference(input, { section: 'index' })
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
      const currentBase = useLayoutState.getState().base
      const preservedProjectShell =
        activeProjectShell && resolvedProjectId === activeProjectShell.projectId
          ? activeProjectShell
          : undefined

      // Check if current view already has this board as base
      if (currentBase?.id === baseId) {
        const boardChatState = buildBoardChatTabState(input.boardId, resolvedProjectId)
        setChatSession(boardChatState.chatSessionId, true)
        setChatParams(boardChatState.chatParams)
        setActiveGlobalChat(null)
        return
      }

      navigate({
        title: input.title,
        icon: '\uD83C\uDFA8',
        ...buildBoardChatTabState(input.boardId, resolvedProjectId),
        leftWidthPercent: 100,
        ...(preservedProjectShell ? { projectShell: preservedProjectShell } : {}),
        base: {
          id: baseId,
          component: 'board-viewer',
          params: {
            boardFolderUri,
            boardFileUri,
            boardId: input.boardId,
            projectId: resolvedProjectId,
            rootUri: input.rootUri,
            __previousBase: currentBase ?? null,
          },
        },
      })
      setActiveGlobalChat(null)
    },
    [
      activeProjectId,
      activeProjectShell,
      navigate,
      setChatSession,
      setChatParams,
      setActiveGlobalChat,
    ],
  )

  const openTempChat = useCallback(() => {
    const tabTitle = i18next.t(TEMP_CHAT_TAB_INPUT.titleKey)

    // In single-view mode, check if the current view is already a temp chat
    const layout = useLayoutState.getState()
    const view = useAppView.getState()
    if (!layout.base && view.title === tabTitle) {
      // Already on temp chat, no-op
      setActiveGlobalChat(null)
      setActiveView('ai-assistant')
      return
    }

    navigate({
      title: tabTitle,
      icon: TEMP_CHAT_TAB_INPUT.icon,
      leftWidthPercent: 0,
      rightChatCollapsed: false,
    })

    setActiveGlobalChat(null)
    setActiveView('ai-assistant')
  }, [navigate, setActiveView, setActiveGlobalChat])

  const openTempCanvas = useCallback(() => {
    const tabTitle = i18next.t(TEMP_CANVAS_TAB_INPUT.titleKey)

    const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase()
    const canvasLabel = i18next.t('nav:canvasList.defaultName')
    const boardName = `tnboard_${canvasLabel}_${randomSuffix}`
    const boardFolderUri = `.openloaf/boards/${boardName}`
    const boardFileUri = `.openloaf/boards/${boardName}/${BOARD_INDEX_FILE_NAME}`
    navigate({
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
  }, [navigate, setActiveView, setActiveGlobalChat])

  return { openChat, openProject, openBoard, openTempChat, openTempCanvas }
}
