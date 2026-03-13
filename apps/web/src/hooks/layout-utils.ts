/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { DockItem } from "@openloaf/api/common"
import {
  CANVAS_LIST_TAB_INPUT,
  PROJECT_LIST_TAB_INPUT,
  WORKBENCH_TAB_INPUT,
} from "@openloaf/api/common"
import { getLeftSidebarOpen } from "@/lib/sidebar-state"
import type { ProjectShellState } from "@/lib/project-shell"

/** Minimum pixel width for the left dock. */
export const LEFT_DOCK_MIN_PX = 680

/** Default percent width for the left dock when content exists. */
export const LEFT_DOCK_DEFAULT_PERCENT = 30

export const BOARD_VIEWER_COMPONENT = "board-viewer"
const FILE_FOREGROUND_COMPONENTS = new Set([
  "file-viewer",
  "image-viewer",
  "code-viewer",
  "markdown-viewer",
  "pdf-viewer",
  "doc-viewer",
  "sheet-viewer",
  "video-viewer",
  "plate-doc-viewer",
  "streaming-plate-viewer",
  "streaming-code-viewer",
])
const RIGHT_CHAT_DISABLED_PROJECT_TABS = new Set(["index", "canvas", "files", "tasks"])

/** Layout state snapshot for utility functions. */
export type LayoutSnapshot = {
  base?: DockItem
  stack: DockItem[]
  activeStackItemId?: string
  rightChatCollapsed?: boolean
  projectShell?: ProjectShellState | null
}

/** Resolve the active stack item. */
export function getActiveStackItem(layout: LayoutSnapshot) {
  const stack = layout.stack ?? []
  const activeId = layout.activeStackItemId || stack.at(-1)?.id || ""
  return stack.find((item) => item.id === activeId) ?? stack.at(-1)
}

/** Resolve the foreground component currently visible. */
export function getLayoutForegroundComponent(layout?: LayoutSnapshot) {
  const stack = Array.isArray(layout?.stack) ? layout.stack : []
  const activeId = layout?.activeStackItemId || stack.at(-1)?.id || ""
  const activeItem = stack.find((item) => item.id === activeId) ?? stack.at(-1)
  return activeItem?.component ?? layout?.base?.component
}

/** Return true when the current foreground page is the global settings page. */
export function isSettingsForegroundPage(layout?: LayoutSnapshot) {
  return getLayoutForegroundComponent(layout) === "settings-page"
}

/** Return true when the current foreground page should suppress the right chat panel. */
export function shouldDisableRightChat(layout?: LayoutSnapshot) {
  const foreground = getLayoutForegroundComponent(layout)
  if (
    foreground === "settings-page" ||
    foreground === "project-settings-page" ||
    foreground === PROJECT_LIST_TAB_INPUT.component ||
    foreground === WORKBENCH_TAB_INPUT.component ||
    foreground === CANVAS_LIST_TAB_INPUT.component
  ) {
    return true
  }

  if (foreground && FILE_FOREGROUND_COMPONENTS.has(foreground)) {
    return true
  }

  if (
    foreground === BOARD_VIEWER_COMPONENT &&
    layout?.projectShell?.section === "canvas"
  ) {
    return true
  }

  if (foreground !== "plant-page") {
    return false
  }

  const projectTab =
    typeof layout?.base?.params?.projectTab === "string" ? layout.base.params.projectTab.trim() : ""
  return RIGHT_CHAT_DISABLED_PROJECT_TABS.has(projectTab)
}

/** Return true when the active board stack is in full mode. */
export function isBoardStackFull(layout: LayoutSnapshot) {
  const activeItem = getActiveStackItem(layout)
  if (activeItem?.component !== BOARD_VIEWER_COMPONENT) return false
  if (!layout.rightChatCollapsed) return false
  const leftOpen = getLeftSidebarOpen()
  return leftOpen === false
}

/** Return true when closing should exit board full mode. */
export function shouldExitBoardFullOnClose(
  layout: LayoutSnapshot,
  itemId?: string,
) {
  const activeItem = getActiveStackItem(layout)
  if (!activeItem || activeItem.component !== BOARD_VIEWER_COMPONENT) return false
  if (itemId && activeItem.id !== itemId) return false
  return isBoardStackFull(layout)
}

/** Clamp a percent value to [0, 100] with NaN/Infinity fallback. */
export function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}
