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
import type { DockItem } from "@openloaf/api/common"
import { DEFAULT_TAB_INFO } from "@openloaf/api/common"
import { createChatSessionId } from "@/lib/chat-session-id"
import { isProjectWindowMode } from "@/lib/window-mode"
import type { ProjectShellState } from "@/lib/project-shell"
import { useLayoutState } from "./use-layout-state"
import { LEFT_DOCK_DEFAULT_PERCENT } from "./layout-utils"

export const APP_VIEW_STORAGE_KEY = "openloaf:app-view"

export type NavigateInput = {
  title?: string
  icon?: string
  base?: DockItem
  leftWidthPercent?: number
  rightChatCollapsed?: boolean
  chatSessionId?: string
  chatParams?: Record<string, unknown>
  chatLoadHistory?: boolean
  projectShell?: ProjectShellState
}

export interface AppViewState {
  /** Current chat session id. */
  chatSessionId: string
  /** Chat parameters (e.g. projectId). */
  chatParams: Record<string, unknown>
  /** Whether to load chat history. */
  chatLoadHistory: boolean
  /** Project-shell metadata. */
  projectShell: ProjectShellState | null
  /** Display title. */
  title: string
  /** Display icon. */
  icon: string
  /** Whether the view has been initialized. */
  initialized: boolean

  /** Navigate to a new view (replaces addTab). */
  navigate: (input: NavigateInput) => void
  /** Set chat session. */
  setChatSession: (id: string, loadHistory?: boolean) => void
  /** Merge chat params. */
  setChatParams: (patch: Record<string, unknown>) => void
  /** Set or clear project-shell state. */
  setProjectShell: (shell: ProjectShellState | null) => void
  /** Set display title. */
  setTitle: (title: string) => void
  /** Set display icon. */
  setIcon: (icon?: string | null) => void
}

/** Resolve storage by renderer mode to isolate project windows. */
function resolveStorage() {
  if (typeof window === "undefined") return localStorage
  return isProjectWindowMode() ? window.sessionStorage : window.localStorage
}

export const useAppView = create<AppViewState>()(
  persist(
    (set, get): AppViewState => ({
      chatSessionId: "",
      chatParams: {},
      chatLoadHistory: false,
      projectShell: null,
      title: DEFAULT_TAB_INFO.titleKey,
      icon: DEFAULT_TAB_INFO.icon,
      initialized: false,

      navigate: (input) => {
        const {
          base,
          title,
          icon,
          leftWidthPercent,
          rightChatCollapsed,
          chatSessionId: requestedChatSessionId,
          chatParams,
          chatLoadHistory,
          projectShell,
        } = input

        const normalizedBase = base?.component === "ai-chat" ? undefined : base
        const createdChatSessionId = requestedChatSessionId ?? createChatSessionId()
        const createdChatLoadHistory = chatLoadHistory ?? Boolean(requestedChatSessionId)
        const resolvedChatParams =
          typeof chatParams === "object" && chatParams
            ? { ...(chatParams as Record<string, unknown>) }
            : {}

        // If projectShell is provided and chatParams doesn't have projectId, inject it
        if (projectShell && !resolvedChatParams.projectId) {
          resolvedChatParams.projectId = projectShell.projectId
        }

        set({
          chatSessionId: createdChatSessionId,
          chatParams: resolvedChatParams,
          chatLoadHistory: createdChatLoadHistory,
          projectShell: projectShell ?? null,
          title: title ?? DEFAULT_TAB_INFO.titleKey,
          icon: icon ?? DEFAULT_TAB_INFO.icon,
          initialized: true,
        })

        // Set up layout state
        useLayoutState.getState().resetLayout()
        if (normalizedBase || leftWidthPercent !== undefined || rightChatCollapsed !== undefined) {
          const layout = useLayoutState.getState()
          if (normalizedBase) {
            layout.setBase(normalizedBase)
            layout.setLeftWidthPercent(leftWidthPercent ?? LEFT_DOCK_DEFAULT_PERCENT)
          } else {
            layout.setLeftWidthPercent(leftWidthPercent ?? 0)
          }
          if (rightChatCollapsed !== undefined) {
            layout.setRightChatCollapsed(rightChatCollapsed)
          }
        }
      },

      setChatSession: (id, loadHistory) => {
        set({
          chatSessionId: id,
          chatLoadHistory: loadHistory ?? true,
        })
      },

      setChatParams: (patch) => {
        set((state) => {
          const currentParams = state.chatParams
          const nextParams = { ...currentParams, ...patch }
          const same =
            Object.keys(nextParams).length === Object.keys(currentParams).length &&
            Object.entries(nextParams).every(([key, value]) => currentParams[key] === value)
          if (same) return state
          return { chatParams: nextParams }
        })
      },

      setProjectShell: (shell) => {
        set({ projectShell: shell })
      },

      setTitle: (title) => {
        set({ title })
      },

      setIcon: (icon) => {
        set({ icon: icon ?? DEFAULT_TAB_INFO.icon })
      },
    }),
    {
      name: APP_VIEW_STORAGE_KEY,
      storage: createJSONStorage(resolveStorage),
      version: 1,
      partialize: (state) => ({
        chatSessionId: state.chatSessionId,
        chatParams: state.chatParams,
        chatLoadHistory: state.chatLoadHistory,
        projectShell: state.projectShell,
        title: state.title,
        icon: state.icon,
        initialized: state.initialized,
      }),
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<AppViewState>) }

        // Migration: read from old openloaf:tabs if new store is empty
        if (!merged.initialized && typeof window !== "undefined") {
          try {
            const storage = resolveStorage()
            const oldData = storage.getItem("openloaf:tabs")
            if (oldData) {
              const parsed = JSON.parse(oldData)
              const state = parsed?.state
              const activeTabId = state?.activeTabId
              const tabs = state?.tabs
              if (Array.isArray(tabs) && activeTabId) {
                const activeTab = tabs.find((t: any) => t.id === activeTabId) ?? tabs[0]
                if (activeTab) {
                  merged.chatSessionId = activeTab.chatSessionId ?? createChatSessionId()
                  merged.chatParams = activeTab.chatParams ?? {}
                  merged.chatLoadHistory = activeTab.chatLoadHistory ?? false
                  merged.projectShell = activeTab.projectShell ?? null
                  merged.title = activeTab.title ?? DEFAULT_TAB_INFO.titleKey
                  merged.icon = activeTab.icon ?? DEFAULT_TAB_INFO.icon
                  merged.initialized = true

                  // Also migrate layout state from old tab-runtime
                  try {
                    const oldRuntimeData = storage.getItem("openloaf:tab-runtime")
                    if (oldRuntimeData) {
                      const parsedRuntime = JSON.parse(oldRuntimeData)
                      const runtimeMap = parsedRuntime?.state?.runtimeByTabId
                      const tabRuntime = runtimeMap?.[activeTabId]
                      if (tabRuntime) {
                        const layout = useLayoutState.getState()
                        if (tabRuntime.base) layout.setBase(tabRuntime.base)
                        if (Array.isArray(tabRuntime.stack) && tabRuntime.stack.length > 0) {
                          for (const item of tabRuntime.stack) {
                            layout.pushStackItem(item)
                          }
                        }
                        if (typeof tabRuntime.leftWidthPercent === "number") {
                          layout.setLeftWidthPercent(tabRuntime.leftWidthPercent)
                        }
                        if (typeof tabRuntime.rightChatCollapsed === "boolean") {
                          layout.setRightChatCollapsed(tabRuntime.rightChatCollapsed)
                        }
                      }
                    }
                  } catch { /* ignore runtime migration errors */ }

                  // Clean up old storage keys
                  try {
                    storage.removeItem("openloaf:tabs")
                    storage.removeItem("openloaf:tab-runtime")
                  } catch { /* ignore cleanup errors */ }
                }
              }
            }
          } catch { /* ignore migration errors */ }
        }

        return merged
      },
    },
  ),
)
