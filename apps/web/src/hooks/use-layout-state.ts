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

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import {
  BROWSER_WINDOW_COMPONENT,
  BROWSER_WINDOW_PANEL_ID,
  TERMINAL_WINDOW_COMPONENT,
  TERMINAL_WINDOW_PANEL_ID,
  type BrowserTab,
  type DockItem,
  type TerminalTab,
} from "@openloaf/api/common"
import { isProjectWindowMode } from "@/lib/window-mode"
import { emitSidebarOpenRequest, getLeftSidebarOpen } from "@/lib/sidebar-state"
import { BOARD_VIEWER_COMPONENT, LEFT_DOCK_DEFAULT_PERCENT, clampPercent } from "./layout-utils"
import { isBrowserWindowItem, normalizeBrowserWindowItem } from "./browser-panel"
import { isTerminalWindowItem, normalizeTerminalWindowItem } from "./terminal-panel"

/** Storage key for layout state persistence. */
export const LAYOUT_STATE_STORAGE_KEY = "openloaf:layout-state"

/** Layout state (replaces TabRuntime). */
export type LayoutState = {
  /** Left dock base panel. */
  base?: DockItem
  /** Left dock stack overlays. */
  stack: DockItem[]
  /** Left dock width in percent. */
  leftWidthPercent: number
  /** Optional minimum width for left dock in px. */
  minLeftWidth?: number
  /** Whether right chat is collapsed. */
  rightChatCollapsed?: boolean
  /** Snapshot of right chat collapsed state before opening a board. */
  rightChatCollapsedSnapshot?: boolean
  /** Whether the stack is hidden (minimized). */
  stackHidden?: boolean
  /** Active stack item id. */
  activeStackItemId?: string
}

export type LayoutStateActions = LayoutState & {
  /** Update the base panel. */
  setBase: (base: DockItem | undefined) => void
  /** Update base params. */
  setBaseParams: (params: Record<string, unknown>) => void
  /** Update left dock width percent. */
  setLeftWidthPercent: (percent: number) => void
  /** Update left dock minimum width. */
  setMinLeftWidth: (minWidth?: number) => void
  /** Toggle right chat collapsed. */
  setRightChatCollapsed: (collapsed: boolean) => void
  /** Update stack hidden flag. */
  setStackHidden: (hidden: boolean) => void
  /** Update active stack item id. */
  setActiveStackItemId: (itemId: string) => void
  /** Push or upsert a stack item. */
  pushStackItem: (item: DockItem, percent?: number) => void
  /** Remove a stack item. */
  removeStackItem: (itemId: string) => void
  /** Clear stack items. */
  clearStack: () => void
  /** Update params for a stack item. */
  setStackItemParams: (itemId: string, params: Record<string, unknown>) => void
  /** Replace browser tabs. */
  setBrowserTabs: (tabs: BrowserTab[], activeId?: string) => void
  /** Replace terminal tabs. */
  setTerminalTabs: (tabs: TerminalTab[], activeId?: string) => void
  /** Reset layout to default. */
  resetLayout: () => void
  /** Reset and apply navigation layout in a single update. */
  applyNavigation: (input: { base?: DockItem; leftWidthPercent?: number; rightChatCollapsed?: boolean }) => void
}

const DEFAULT_STATE: LayoutState = {
  stack: [],
  leftWidthPercent: 0,
  rightChatCollapsed: false,
  rightChatCollapsedSnapshot: undefined,
  stackHidden: false,
  activeStackItemId: "",
}

/** Resolve storage by renderer mode to isolate project windows. */
function resolveStorage() {
  if (typeof window === "undefined") return localStorage
  return isProjectWindowMode() ? window.sessionStorage : window.localStorage
}

/** Return true when the stack contains a board viewer item. */
function hasBoardStackItem(stack?: DockItem[]) {
  return (stack ?? []).some((item) => item.component === BOARD_VIEWER_COMPONENT)
}

function normalize(input?: Partial<LayoutState>): LayoutState {
  const base = input?.base
  const stack = Array.isArray(input?.stack) ? input!.stack : []
  const hasLeftContent = Boolean(base) || stack.length > 0
  const leftWidthPercent = hasLeftContent
    ? clampPercent(
        Number.isFinite(input?.leftWidthPercent) && (input?.leftWidthPercent ?? 0) > 0
          ? (input?.leftWidthPercent as number)
          : LEFT_DOCK_DEFAULT_PERCENT,
      )
    : 0
  const minLeftWidth = Number.isFinite(input?.minLeftWidth)
    ? (input?.minLeftWidth as number)
    : undefined
  const hasBoard = hasBoardStackItem(stack)
  const rightChatCollapsedSnapshot =
    hasBoard && typeof input?.rightChatCollapsedSnapshot === "boolean"
      ? input.rightChatCollapsedSnapshot
      : undefined

  return {
    base,
    stack,
    leftWidthPercent,
    minLeftWidth,
    rightChatCollapsed: base ? Boolean(input?.rightChatCollapsed) : false,
    rightChatCollapsedSnapshot,
    stackHidden: Boolean(input?.stackHidden),
    activeStackItemId:
      typeof input?.activeStackItemId === "string" ? input.activeStackItemId : "",
  }
}

function getActiveStackItemFromState(state: LayoutState) {
  const stack = state.stack ?? []
  const activeId = state.activeStackItemId || stack.at(-1)?.id || ""
  return stack.find((item) => item.id === activeId) ?? stack.at(-1)
}

function isBoardStackFullInternal(state: LayoutState) {
  const activeItem = getActiveStackItemFromState(state)
  if (activeItem?.component !== BOARD_VIEWER_COMPONENT) return false
  if (!state.rightChatCollapsed) return false
  const leftOpen = getLeftSidebarOpen()
  return leftOpen === false
}

function shouldExitBoardFullOnCloseInternal(state: LayoutState, itemId?: string) {
  const activeItem = getActiveStackItemFromState(state)
  if (!activeItem || activeItem.component !== BOARD_VIEWER_COMPONENT) return false
  if (itemId && activeItem.id !== itemId) return false
  return isBoardStackFullInternal(state)
}

export const useLayoutState = create<LayoutStateActions>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      setBase: (base) => {
        set((state) => {
          const next = normalize({ ...state, base })
          return next
        })
      },

      setBaseParams: (params) => {
        set((state) => {
          if (!state.base) return state
          const currentParams = (state.base.params ?? {}) as Record<string, unknown>
          const nextParams = { ...currentParams, ...params }
          const same =
            Object.keys(nextParams).length === Object.keys(currentParams).length &&
            Object.entries(nextParams).every(([key, value]) => currentParams[key] === value)
          if (same) return state
          return normalize({
            ...state,
            base: { ...state.base, params: nextParams },
          })
        })
      },

      setLeftWidthPercent: (percent) => {
        set((state) => {
          const hasLeftContent = Boolean(state.base) || state.stack.length > 0
          const nextPercent = hasLeftContent ? clampPercent(percent) : 0
          return normalize({ ...state, leftWidthPercent: nextPercent })
        })
      },

      setMinLeftWidth: (minWidth) => {
        set((state) =>
          normalize({
            ...state,
            minLeftWidth: Number.isFinite(minWidth) ? minWidth : undefined,
          }),
        )
      },

      setRightChatCollapsed: (collapsed) => {
        set((state) =>
          normalize({
            ...state,
            rightChatCollapsed: state.base ? collapsed : false,
          }),
        )
      },

      setStackHidden: (hidden) => {
        set((state) => normalize({ ...state, stackHidden: Boolean(hidden) }))
      },

      setActiveStackItemId: (itemId) => {
        set((state) => normalize({ ...state, activeStackItemId: itemId }))
      },

      pushStackItem: (item, percent) => {
        let shouldRestoreFull = false
        set((state) => {
          const wasBoardOpen = hasBoardStackItem(state.stack)
          const isBoardItem = item.component === BOARD_VIEWER_COMPONENT
          const shouldCaptureSnapshot = isBoardItem && !wasBoardOpen
          const wasHidden = Boolean(state.stackHidden)
          shouldRestoreFull =
            wasHidden &&
            item.component === BOARD_VIEWER_COMPONENT &&
            Boolean((item.params as any)?.__boardFull)
          const nextRightChatCollapsedSnapshot = shouldCaptureSnapshot
            ? Boolean(state.rightChatCollapsed)
            : state.rightChatCollapsedSnapshot

          const nextItem = wasHidden
            ? {
                ...item,
                params: { ...(item.params ?? {}), __restoreStackHidden: true },
              }
            : item

          const isBrowser = nextItem.component === BROWSER_WINDOW_COMPONENT
          const isTerminal = nextItem.component === TERMINAL_WINDOW_COMPONENT
          const activeId = isBrowser
            ? BROWSER_WINDOW_PANEL_ID
            : isTerminal
              ? TERMINAL_WINDOW_PANEL_ID
              : nextItem.id

          const key = isBrowser
            ? BROWSER_WINDOW_PANEL_ID
            : isTerminal
              ? TERMINAL_WINDOW_PANEL_ID
              : (nextItem.sourceKey ?? nextItem.id)
          const existingIndex = state.stack.findIndex((s) =>
            isBrowser
              ? s.component === BROWSER_WINDOW_COMPONENT
              : isTerminal
                ? s.component === TERMINAL_WINDOW_COMPONENT
                : (s.sourceKey ?? s.id) === key,
          )
          const existing = existingIndex === -1 ? undefined : state.stack[existingIndex]

          const normalizedItem = isBrowser
            ? normalizeBrowserWindowItem(
                isBrowserWindowItem(existing) ? existing : undefined,
                {
                  ...nextItem,
                  id: BROWSER_WINDOW_PANEL_ID,
                  sourceKey: BROWSER_WINDOW_PANEL_ID,
                },
              )
            : isTerminal
              ? normalizeTerminalWindowItem(
                  isTerminalWindowItem(existing) ? existing : undefined,
                  {
                    ...nextItem,
                    id: TERMINAL_WINDOW_PANEL_ID,
                    sourceKey: TERMINAL_WINDOW_PANEL_ID,
                  },
                )
              : nextItem

          const nextStack = [...state.stack]
          if (existingIndex === -1) nextStack.push(normalizedItem)
          else {
            nextStack[existingIndex] = isBrowser
              ? normalizedItem
              : { ...nextStack[existingIndex]!, ...nextItem }
          }

          const normalizedStack = isBrowser
            ? [
                ...nextStack.filter((s) => s.component !== BROWSER_WINDOW_COMPONENT),
                normalizedItem,
              ]
            : isTerminal
              ? [
                  ...nextStack.filter((s) => s.component !== TERMINAL_WINDOW_COMPONENT),
                  normalizedItem,
                ]
              : nextStack

          const STACK_DEFAULT_PERCENT = 70
          return normalize({
            ...state,
            stack: normalizedStack,
            activeStackItemId: activeId,
            stackHidden: false,
            leftWidthPercent: clampPercent(
              Number.isFinite(percent)
                ? percent!
                : state.leftWidthPercent > 0
                  ? state.leftWidthPercent
                  : STACK_DEFAULT_PERCENT,
            ),
            rightChatCollapsed: shouldRestoreFull
              ? true
              : isBoardItem
                ? true
                : state.rightChatCollapsed,
            rightChatCollapsedSnapshot: nextRightChatCollapsedSnapshot,
          })
        })
        if (shouldRestoreFull) {
          emitSidebarOpenRequest(false)
        }
      },

      removeStackItem: (itemId) => {
        let shouldExitFull = false
        set((state) => {
          shouldExitFull = shouldExitBoardFullOnCloseInternal(state, itemId)
          const targetItem = state.stack.find((item) => item.id === itemId)
          const nextStack = state.stack.filter((item) => item.id !== itemId)
          const hasBoardAfter = hasBoardStackItem(nextStack)
          const shouldRestoreRight =
            !hasBoardAfter && typeof state.rightChatCollapsedSnapshot === "boolean"
          const shouldRestoreHidden = Boolean(
            (targetItem?.params as any)?.__restoreStackHidden,
          )
          const currentActiveId = state.activeStackItemId ?? ""
          const nextActiveId =
            currentActiveId && currentActiveId !== itemId
              ? currentActiveId
              : (nextStack.at(-1)?.id ?? "")

          return normalize({
            ...state,
            stack: nextStack,
            activeStackItemId: nextActiveId,
            stackHidden:
              nextStack.length === 0
                ? false
                : shouldRestoreHidden
                  ? true
                  : state.stackHidden,
            rightChatCollapsed: shouldRestoreRight
              ? state.rightChatCollapsedSnapshot
              : shouldExitFull
                ? false
                : state.rightChatCollapsed,
            rightChatCollapsedSnapshot: hasBoardAfter
              ? state.rightChatCollapsedSnapshot
              : undefined,
          })
        })
        if (shouldExitFull) {
          emitSidebarOpenRequest(true)
        }
      },

      clearStack: () => {
        let shouldExitFull = false
        set((state) => {
          shouldExitFull = shouldExitBoardFullOnCloseInternal(state)
          const shouldRestoreRight =
            typeof state.rightChatCollapsedSnapshot === "boolean"
          return normalize({
            ...state,
            stack: [],
            activeStackItemId: "",
            stackHidden: false,
            rightChatCollapsed: shouldRestoreRight
              ? state.rightChatCollapsedSnapshot
              : shouldExitFull
                ? false
                : state.rightChatCollapsed,
            rightChatCollapsedSnapshot: undefined,
          })
        })
        if (shouldExitFull) {
          emitSidebarOpenRequest(true)
        }
      },

      setStackItemParams: (itemId, params) => {
        set((state) => {
          const stack = state.stack ?? []
          const itemIndex = stack.findIndex((item) => item.id === itemId)
          if (itemIndex === -1) return state
          const target = stack[itemIndex]!
          const currentParams = (target.params ?? {}) as Record<string, unknown>
          const nextParams = { ...currentParams, ...params }
          const same =
            Object.keys(nextParams).length === Object.keys(currentParams).length &&
            Object.entries(nextParams).every(([key, value]) => currentParams[key] === value)
          if (same) return state
          const nextStack = [...stack]
          nextStack[itemIndex] = { ...target, params: nextParams }
          return normalize({ ...state, stack: nextStack })
        })
      },

      setBrowserTabs: (tabs, activeId) => {
        set((state) => {
          const nextTabs = Array.isArray(tabs) ? tabs : []
          const nextActiveId =
            typeof activeId === "string" ? activeId : nextTabs[0]?.id ?? ""
          const nextStack = state.stack.filter(
            (item) => item.component !== BROWSER_WINDOW_COMPONENT,
          )
          nextStack.push(
            normalizeBrowserWindowItem(undefined, {
              id: BROWSER_WINDOW_PANEL_ID,
              sourceKey: BROWSER_WINDOW_PANEL_ID,
              component: BROWSER_WINDOW_COMPONENT,
              params: {
                __customHeader: true,
                browserTabs: nextTabs,
                activeBrowserTabId: nextActiveId,
              },
            } as DockItem),
          )
          return normalize({
            ...state,
            stack: nextStack,
            activeStackItemId: BROWSER_WINDOW_PANEL_ID,
            stackHidden: false,
          })
        })
      },

      setTerminalTabs: (tabs, activeId) => {
        set((state) => {
          const nextTabs = Array.isArray(tabs) ? tabs : []
          const nextActiveId =
            typeof activeId === "string" ? activeId : nextTabs[0]?.id ?? ""
          const nextStack = state.stack.filter(
            (item) => item.component !== TERMINAL_WINDOW_COMPONENT,
          )
          nextStack.push(
            normalizeTerminalWindowItem(undefined, {
              id: TERMINAL_WINDOW_PANEL_ID,
              sourceKey: TERMINAL_WINDOW_PANEL_ID,
              component: TERMINAL_WINDOW_COMPONENT,
              params: {
                __customHeader: true,
                terminalTabs: nextTabs,
                activeTerminalTabId: nextActiveId,
              },
            } as DockItem),
          )
          return normalize({
            ...state,
            stack: nextStack,
            activeStackItemId: TERMINAL_WINDOW_PANEL_ID,
            stackHidden: false,
          })
        })
      },

      resetLayout: () => {
        set(normalize(DEFAULT_STATE))
      },

      applyNavigation: (input) => {
        set(normalize({
          ...DEFAULT_STATE,
          base: input.base,
          leftWidthPercent: input.leftWidthPercent ?? (input.base ? LEFT_DOCK_DEFAULT_PERCENT : 0),
          rightChatCollapsed: input.base ? Boolean(input.rightChatCollapsed) : false,
        }))
      },
    }),
    {
      name: LAYOUT_STATE_STORAGE_KEY,
      storage: createJSONStorage(resolveStorage),
      version: 1,
      partialize: (state) => ({
        base: state.base,
        stack: state.stack,
        leftWidthPercent: state.leftWidthPercent,
        minLeftWidth: state.minLeftWidth,
        rightChatCollapsed: state.rightChatCollapsed,
        rightChatCollapsedSnapshot: state.rightChatCollapsedSnapshot,
        stackHidden: state.stackHidden,
        activeStackItemId: state.activeStackItemId,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...normalize(persisted as Partial<LayoutState>),
      }),
    },
  ),
)
