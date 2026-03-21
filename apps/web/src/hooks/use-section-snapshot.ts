"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import type { PreviousViewSnapshot } from "@/lib/primary-page-navigation"
import type { AppState } from "@/hooks/use-app-state"
import { BOARD_VIEWER_COMPONENT } from "./layout-utils"

/** Sidebar sections that support view-state restoration. */
export type SectionKey = "chat" | "canvas" | "project"

const SECTION_SNAPSHOT_STORAGE_KEY = "openloaf:section-snapshots"

type SectionSnapshotState = {
  snapshots: Partial<Record<SectionKey, PreviousViewSnapshot>>
  saveSnapshot: (key: SectionKey, snapshot: PreviousViewSnapshot) => void
  getSnapshot: (key: SectionKey) => PreviousViewSnapshot | undefined
}

export const useSectionSnapshot = create<SectionSnapshotState>()(
  persist(
    (set, get) => ({
      snapshots: {},
      saveSnapshot: (key, snapshot) => {
        set((state) => ({
          snapshots: { ...state.snapshots, [key]: snapshot },
        }))
      },
      getSnapshot: (key) => get().snapshots[key],
    }),
    {
      name: SECTION_SNAPSHOT_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ snapshots: state.snapshots }),
    },
  ),
)

/**
 * Detect which sidebar section the current app state belongs to.
 * Returns null for non-section pages (settings, workbench, calendar, etc.).
 */
export function detectCurrentSection(appState: AppState): SectionKey | null {
  const baseComponent = appState.base?.component
  const hasProjectShell = Boolean(appState.projectShell)

  // Project context takes precedence (project list, project detail, or any view with projectShell)
  if (hasProjectShell || baseComponent === "project-list-page" || baseComponent === "plant-page") {
    return "project"
  }

  // Canvas: canvas list or standalone board viewer (no project context)
  if (baseComponent === "canvas-list-page" || baseComponent === BOARD_VIEWER_COMPONENT) {
    return "canvas"
  }

  // Chat: no base panel and no project shell = global chat mode
  if (!baseComponent) {
    return "chat"
  }

  return null
}
