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
import { useAppView, type AppViewState } from "./use-app-view"
import { useLayoutState, type LayoutState } from "./use-layout-state"

/** Combined app state (replaces useTabView). */
export type AppState = Pick<
  AppViewState,
  | "chatSessionId"
  | "chatParams"
  | "chatLoadHistory"
  | "projectShell"
  | "title"
  | "icon"
> &
  Pick<
    LayoutState,
    | "base"
    | "stack"
    | "leftWidthPercent"
    | "minLeftWidth"
    | "rightChatCollapsed"
    | "rightChatCollapsedSnapshot"
    | "stackHidden"
    | "activeStackItemId"
  >

/** Get combined app state for non-React callers. */
export function getAppState(): AppState {
  const view = useAppView.getState()
  const layout = useLayoutState.getState()
  return {
    chatSessionId: view.chatSessionId,
    chatParams: view.chatParams,
    chatLoadHistory: view.chatLoadHistory,
    projectShell: view.projectShell,
    title: view.title,
    icon: view.icon,
    base: layout.base,
    stack: layout.stack,
    leftWidthPercent: layout.leftWidthPercent,
    minLeftWidth: layout.minLeftWidth,
    rightChatCollapsed: layout.rightChatCollapsed,
    rightChatCollapsedSnapshot: layout.rightChatCollapsedSnapshot,
    stackHidden: layout.stackHidden,
    activeStackItemId: layout.activeStackItemId,
  }
}

/** Hook to get combined app state (replaces useTabView). */
export function useAppState(): AppState {
  const chatSessionId = useAppView((s) => s.chatSessionId)
  const chatParams = useAppView((s) => s.chatParams)
  const chatLoadHistory = useAppView((s) => s.chatLoadHistory)
  const projectShell = useAppView((s) => s.projectShell)
  const title = useAppView((s) => s.title)
  const icon = useAppView((s) => s.icon)
  const base = useLayoutState((s) => s.base)
  const stack = useLayoutState((s) => s.stack)
  const leftWidthPercent = useLayoutState((s) => s.leftWidthPercent)
  const minLeftWidth = useLayoutState((s) => s.minLeftWidth)
  const rightChatCollapsed = useLayoutState((s) => s.rightChatCollapsed)
  const rightChatCollapsedSnapshot = useLayoutState((s) => s.rightChatCollapsedSnapshot)
  const stackHidden = useLayoutState((s) => s.stackHidden)
  const activeStackItemId = useLayoutState((s) => s.activeStackItemId)

  return useMemo(
    () => ({
      chatSessionId,
      chatParams,
      chatLoadHistory,
      projectShell,
      title,
      icon,
      base,
      stack,
      leftWidthPercent,
      minLeftWidth,
      rightChatCollapsed,
      rightChatCollapsedSnapshot,
      stackHidden,
      activeStackItemId,
    }),
    [
      chatSessionId,
      chatParams,
      chatLoadHistory,
      projectShell,
      title,
      icon,
      base,
      stack,
      leftWidthPercent,
      minLeftWidth,
      rightChatCollapsed,
      rightChatCollapsedSnapshot,
      stackHidden,
      activeStackItemId,
    ],
  )
}
