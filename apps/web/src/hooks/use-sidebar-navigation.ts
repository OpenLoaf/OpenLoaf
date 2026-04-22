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
import type { ProjectNode } from '@openloaf/api/services/projectTreeService'
import { useAppView } from '@/hooks/use-app-view'
import { useLayoutState } from '@/hooks/use-layout-state'
import { useProjectOpen } from '@/hooks/use-project-open'
import { useProjects } from '@/hooks/use-projects'
import { TEMP_CHAT_TAB_INPUT, TEMP_CANVAS_TAB_INPUT } from '@openloaf/api/common'
import { buildBoardFolderUri } from '@/components/project/filesystem/utils/file-system-utils'
import { BOARD_INDEX_FILE_NAME } from '@/lib/file-name'
import { resolveProjectModeProjectShell } from '@/lib/project-mode'
import { captureCurrentViewSnapshot } from '@/lib/primary-page-navigation'
import { useChatView, GLOBAL_CHAT_SCOPE } from '@/hooks/use-chat-view'

function findProjectRootUri(nodes: ProjectNode[] | undefined, projectId: string): string {
  if (!projectId || !nodes?.length) return ''
  for (const node of nodes) {
    if (node.projectId === projectId) return node.rootUri
    const childRootUri = findProjectRootUri(node.children, projectId)
    if (childRootUri) return childRootUri
  }
  return ''
}

export function useSidebarNavigation() {
  const navigate = useAppView((s) => s.navigate)
  const projectShell = useAppView((s) => s.projectShell)
  const openProjectWithPreference = useProjectOpen()
  const { data: projects } = useProjects()
  const activeProjectShell = resolveProjectModeProjectShell(projectShell)
  const activeProjectId = activeProjectShell?.projectId

  const openChat = useCallback(
    (chatId: string, _chatTitle: string, input?: { projectId?: string | null }) => {
      const projectId = input?.projectId?.trim() || activeProjectId
      const currentBase = useLayoutState.getState().base

      // If a project is specified, make sure the middle panel is on the project's plant-page
      // (which is what derives the chat scope). Chat session id is stored per-scope.
      if (projectId) {
        if (currentBase?.component === 'plant-page') {
          const currentParams = (currentBase.params ?? {}) as Record<string, unknown>
          const currentProjectId =
            typeof currentParams.projectId === 'string' ? currentParams.projectId.trim() : ''
          if (currentProjectId && currentProjectId !== projectId) {
            useLayoutState.getState().setBase({
              id: `project:${projectId}`,
              component: 'plant-page',
              params: {
                projectId,
                rootUri: findProjectRootUri(projects, projectId),
                projectTab: currentParams.projectTab,
              },
            })
          }
        }
        useChatView.getState().setActiveSession(projectId, chatId)
      } else {
        useChatView.getState().setActiveSession(GLOBAL_CHAT_SCOPE, chatId)
      }
    },
    [activeProjectId, projects],
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
    },
    [openProjectWithPreference],
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

      // If the board is already the current base, this is a no-op — chat scope derives from base.
      if (currentBase?.id === baseId) {
        return
      }

      navigate({
        title: input.title,
        icon: '🎨',
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
            __previousView: captureCurrentViewSnapshot(),
          },
        },
      })
    },
    [activeProjectId, activeProjectShell, navigate],
  )

  const openTempChat = useCallback(() => {
    const tabTitle = i18next.t(TEMP_CHAT_TAB_INPUT.titleKey)

    // Already on temp chat? No-op — global scope chat session is preserved.
    const layout = useLayoutState.getState()
    const view = useAppView.getState()
    if (!layout.base && view.title === tabTitle) {
      return
    }

    navigate({
      title: tabTitle,
      icon: TEMP_CHAT_TAB_INPUT.icon,
    })
  }, [navigate])

  const openTempCanvas = useCallback(() => {
    const tabTitle = i18next.t(TEMP_CANVAS_TAB_INPUT.titleKey)

    const randomSuffix = Math.random().toString(36).slice(2, 6).toUpperCase()
    const canvasLabel = i18next.t('nav:canvasList.defaultName')
    const boardName = `tnboard_${canvasLabel}_${randomSuffix}`
    const boardFolderUri = `boards/${boardName}`
    const boardFileUri = `boards/${boardName}/${BOARD_INDEX_FILE_NAME}`
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
  }, [navigate])

  return { openChat, openProject, openBoard, openTempChat, openTempCanvas }
}
