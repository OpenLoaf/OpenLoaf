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
import { isDedicatedWindowMode } from "@/lib/window-mode"
import type { ProjectShellState } from "@/lib/project-shell"
import { useLayoutState } from "./use-layout-state"

export const APP_VIEW_STORAGE_KEY = "openloaf:app-view"

export type NavigateInput = {
  title?: string
  icon?: string
  base?: DockItem
  leftWidthPercent?: number
  projectShell?: ProjectShellState
}

export interface AppViewState {
  /** Project-shell metadata. */
  projectShell: ProjectShellState | null
  /** Display title. */
  title: string
  /** Display icon. */
  icon: string
  /** Whether the view has been initialized. */
  initialized: boolean

  /** Navigate to a new view (replaces addTab). Chat state is handled by useChatView. */
  navigate: (input: NavigateInput) => void
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
  return isDedicatedWindowMode() ? window.sessionStorage : window.localStorage
}

export const useAppView = create<AppViewState>()(
  persist(
    (set): AppViewState => ({
      projectShell: null,
      title: "",
      icon: DEFAULT_TAB_INFO.icon,
      initialized: false,

      navigate: (input) => {
        const {
          base,
          title,
          icon,
          leftWidthPercent,
          projectShell,
        } = input

        const normalizedBase = base?.component === "ai-chat" ? undefined : base

        set({
          projectShell: projectShell ?? null,
          title: title ?? "",
          icon: icon ?? DEFAULT_TAB_INFO.icon,
          initialized: true,
        })

        // Set up layout state in a single update. Right chat state is
        // preserved across navigation — it's user-controlled, not driven by
        // which sidebar menu was clicked.
        useLayoutState.getState().applyNavigation({
          base: normalizedBase,
          leftWidthPercent,
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
      version: 2,
      partialize: (state) => ({
        projectShell: state.projectShell,
        title: state.title,
        icon: state.icon,
        initialized: state.initialized,
      }),
      merge: (persisted, current) => {
        const merged = {
          ...current,
          ...(persisted as Partial<AppViewState>),
        }
        if (typeof merged.title === "string" && /^[a-z]+:[a-zA-Z0-9._-]+$/.test(merged.title)) {
          merged.title = ""
        }
        return merged
      },
    },
  ),
)
