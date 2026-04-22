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

import { useMemo } from "react"
import type { ChatPageContext } from "@openloaf/api/types/message"
import { useAppView } from "@/hooks/use-app-view"
import { useLayoutState } from "@/hooks/use-layout-state"
import { GLOBAL_CHAT_SCOPE, type ChatScopeKey } from "@/hooks/use-chat-view"

export interface ChatScopeInfo {
  /** Scope key: projectId or GLOBAL_CHAT_SCOPE. */
  scope: ChatScopeKey
  /** Derived projectId (null for global). */
  projectId: string | null
  /** Derived boardId (only when viewing a board). */
  boardId: string | null
  /** Derived page context for AI payloads. */
  pageContext: ChatPageContext
}

function trimString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/** Derive chat scope from current layout + project-shell state. */
export function getChatScope(): ChatScopeInfo {
  const layout = useLayoutState.getState()
  const view = useAppView.getState()
  const base = layout.base
  const baseParams = (base?.params ?? {}) as Record<string, unknown>

  // 1) Board viewer — projectId may be missing for temp canvas.
  if (base?.component === "board-viewer") {
    const projectId = trimString(baseParams.projectId) || null
    const boardId =
      trimString(baseParams.boardId) ||
      trimString(baseParams.boardFolderUri).split("/").filter(Boolean).pop() ||
      null
    const scope = projectId ?? GLOBAL_CHAT_SCOPE
    const pageContext: ChatPageContext = projectId
      ? { scope: "project", page: "project-canvas", projectId, boardId: boardId ?? undefined }
      : { scope: "global", page: "temp-canvas", boardId: boardId ?? undefined }
    return { scope, projectId, boardId, pageContext }
  }

  // 2) Project shell (project mode).
  const projectShell = view.projectShell
  if (projectShell?.projectId) {
    return {
      scope: projectShell.projectId,
      projectId: projectShell.projectId,
      boardId: null,
      pageContext: { scope: "project", page: "project-index", projectId: projectShell.projectId },
    }
  }

  // 3) Plant-page without projectShell (edge case).
  if (base?.component === "plant-page") {
    const projectId = trimString(baseParams.projectId) || null
    if (projectId) {
      return {
        scope: projectId,
        projectId,
        boardId: null,
        pageContext: { scope: "project", page: "project-index", projectId },
      }
    }
  }

  // 4) Global default.
  return {
    scope: GLOBAL_CHAT_SCOPE,
    projectId: null,
    boardId: null,
    pageContext: { scope: "global", page: "ai-chat" },
  }
}

/** React hook version of getChatScope — recomputes when layout/view change. */
export function useChatScope(): ChatScopeInfo {
  const base = useLayoutState((s) => s.base)
  const projectShell = useAppView((s) => s.projectShell)
  return useMemo(() => {
    const baseParams = (base?.params ?? {}) as Record<string, unknown>
    if (base?.component === "board-viewer") {
      const projectId = trimString(baseParams.projectId) || null
      const boardId =
        trimString(baseParams.boardId) ||
        trimString(baseParams.boardFolderUri).split("/").filter(Boolean).pop() ||
        null
      const scope = projectId ?? GLOBAL_CHAT_SCOPE
      const pageContext: ChatPageContext = projectId
        ? { scope: "project", page: "project-canvas", projectId, boardId: boardId ?? undefined }
        : { scope: "global", page: "temp-canvas", boardId: boardId ?? undefined }
      return { scope, projectId, boardId, pageContext }
    }
    if (projectShell?.projectId) {
      return {
        scope: projectShell.projectId,
        projectId: projectShell.projectId,
        boardId: null,
        pageContext: {
          scope: "project",
          page: "project-index",
          projectId: projectShell.projectId,
        } satisfies ChatPageContext,
      }
    }
    if (base?.component === "plant-page") {
      const projectId = trimString(baseParams.projectId) || null
      if (projectId) {
        return {
          scope: projectId,
          projectId,
          boardId: null,
          pageContext: {
            scope: "project",
            page: "project-index",
            projectId,
          } satisfies ChatPageContext,
        }
      }
    }
    return {
      scope: GLOBAL_CHAT_SCOPE,
      projectId: null,
      boardId: null,
      pageContext: { scope: "global", page: "ai-chat" } satisfies ChatPageContext,
    }
  }, [base, projectShell])
}
