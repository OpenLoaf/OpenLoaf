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
  DEFAULT_TAB_INFO,
  PROJECT_LIST_TAB_INPUT,
  WORKBENCH_TAB_INPUT,
} from "@openloaf/api/common"
import type { NavigationViewType } from "@/hooks/use-navigation"
import { resolveProjectModeProjectShell } from "@/lib/project-mode"
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
const GLOBAL_FOREGROUND_COMPONENTS = new Set([
  "settings-page",
  PROJECT_LIST_TAB_INPUT.component,
  WORKBENCH_TAB_INPUT.component,
  CANVAS_LIST_TAB_INPUT.component,
  "calendar-page",
  "email-page",
  "scheduled-tasks-page",
])
const RIGHT_CHAT_DISABLED_PROJECT_TABS = new Set(["index", "canvas", "files", "tasks", "settings"])

/** Layout state snapshot for utility functions. */
export type LayoutSnapshot = {
  base?: DockItem
  stack: DockItem[]
  activeStackItemId?: string
  rightChatCollapsed?: boolean
  projectShell?: ProjectShellState | null
}

export type LayoutViewSnapshot = LayoutSnapshot & {
  title?: string
  chatSessionId?: string
  chatLoadHistory?: boolean
  chatParams?: Record<string, unknown>
}

export type ResolvedRightChatState = {
  canToggle: boolean
  isCollapsed: boolean
  isVisible: boolean
}

export type ResolvedLayoutViewState = {
  foregroundComponent: string
  viewType: NavigationViewType
  projectId: string | null
  isProjectContext: boolean
  isSettingsPage: boolean
  projectShell: ProjectShellState | null
}

function readStringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
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

/** Resolve the right chat visibility from actual layout state. */
export function resolveRightChatState(
  layout?: Pick<LayoutSnapshot, "base" | "rightChatCollapsed">,
): ResolvedRightChatState {
  const canToggle = Boolean(layout?.base)
  const isCollapsed = canToggle ? Boolean(layout?.rightChatCollapsed) : false
  return {
    canToggle,
    isCollapsed,
    isVisible: !isCollapsed,
  }
}

/** Resolve one stable view identity from the current app/layout snapshot. */
export function resolveLayoutViewState(
  snapshot?: LayoutViewSnapshot,
): ResolvedLayoutViewState {
  const foregroundComponent = getLayoutForegroundComponent(snapshot) ?? ""
  const projectShell = resolveProjectModeProjectShell(snapshot?.projectShell)
  const baseParams = (snapshot?.base?.params ?? {}) as Record<string, unknown>
  const chatParams = (snapshot?.chatParams ?? {}) as Record<string, unknown>
  const baseProjectId = readStringValue(baseParams.projectId)
  const chatProjectId = readStringValue(chatParams.projectId)
  const projectId =
    projectShell?.projectId || baseProjectId || chatProjectId || null
  const isProjectPage =
    foregroundComponent === "plant-page" ||
    foregroundComponent === "project-settings-page"
  const isGlobalForeground =
    GLOBAL_FOREGROUND_COMPONENTS.has(foregroundComponent) ||
    FILE_FOREGROUND_COMPONENTS.has(foregroundComponent)
  const hasProjectShellContext =
    Boolean(projectShell) &&
    !isGlobalForeground &&
    (foregroundComponent === "" ||
      foregroundComponent === BOARD_VIEWER_COMPONENT ||
      isProjectPage)
  const isProjectContext =
    hasProjectShellContext || (isProjectPage && Boolean(projectId))

  if (isProjectContext) {
    return {
      foregroundComponent,
      viewType: "project",
      projectId,
      isProjectContext,
      isSettingsPage: false,
      projectShell: hasProjectShellContext ? projectShell : null,
    }
  }

  if (foregroundComponent === PROJECT_LIST_TAB_INPUT.component) {
    return {
      foregroundComponent,
      viewType: "project-list",
      projectId: null,
      isProjectContext: false,
      isSettingsPage: false,
      projectShell: null,
    }
  }

  if (
    foregroundComponent === CANVAS_LIST_TAB_INPUT.component ||
    foregroundComponent === BOARD_VIEWER_COMPONENT
  ) {
    return {
      foregroundComponent,
      viewType: "canvas-list",
      projectId: null,
      isProjectContext: false,
      isSettingsPage: false,
      projectShell: null,
    }
  }

  if (foregroundComponent === WORKBENCH_TAB_INPUT.component) {
    return {
      foregroundComponent,
      viewType: "workbench",
      projectId: null,
      isProjectContext: false,
      isSettingsPage: false,
      projectShell: null,
    }
  }

  if (foregroundComponent === "calendar-page") {
    return {
      foregroundComponent,
      viewType: "calendar",
      projectId: null,
      isProjectContext: false,
      isSettingsPage: false,
      projectShell: null,
    }
  }

  if (foregroundComponent === "email-page") {
    return {
      foregroundComponent,
      viewType: "email",
      projectId: null,
      isProjectContext: false,
      isSettingsPage: false,
      projectShell: null,
    }
  }

  if (foregroundComponent === "scheduled-tasks-page") {
    return {
      foregroundComponent,
      viewType: "scheduled-tasks",
      projectId: null,
      isProjectContext: false,
      isSettingsPage: false,
      projectShell: null,
    }
  }

  if (!foregroundComponent) {
    const hasNamedSession = readStringValue(snapshot?.chatSessionId)
    const hasCustomTitle =
      readStringValue(snapshot?.title) &&
      snapshot?.title !== DEFAULT_TAB_INFO.titleKey

    return {
      foregroundComponent,
      viewType:
        hasNamedSession && (Boolean(snapshot?.chatLoadHistory) || Boolean(hasCustomTitle))
          ? "global-chat"
          : "ai-assistant",
      projectId: null,
      isProjectContext: false,
      isSettingsPage: false,
      projectShell: null,
    }
  }

  return {
    foregroundComponent,
    viewType: null,
    projectId: null,
    isProjectContext: false,
    isSettingsPage: foregroundComponent === "settings-page",
    projectShell: null,
  }
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
    foreground === CANVAS_LIST_TAB_INPUT.component ||
    foreground === "calendar-page" ||
    foreground === "email-page" ||
    foreground === "scheduled-tasks-page"
  ) {
    return true
  }

  if (foreground && FILE_FOREGROUND_COMPONENTS.has(foreground)) {
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
