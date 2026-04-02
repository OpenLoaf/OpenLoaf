"use client"

import { useAppView } from "@/hooks/use-app-view"
import { useProjectLayout } from "@/hooks/use-project-layout"
import { useSectionSnapshot } from "@/hooks/use-section-snapshot"
import { RECENT_OPEN_EVENT } from "@/components/file/lib/recent-open"

/**
 * Clean up all localStorage caches associated with a deleted/removed project.
 *
 * Should be called after a successful project.remove or project.destroy mutation.
 */
export function cleanupProjectCache(projectId: string): void {
  if (typeof window === "undefined" || !projectId) return

  // 1. project-layout: remove per-project layout prefs
  const layoutState = useProjectLayout.getState()
  if (layoutState.layoutByProjectId[projectId]) {
    const { [projectId]: _, ...rest } = layoutState.layoutByProjectId
    useProjectLayout.setState({ layoutByProjectId: rest })
  }

  // 2. section-snapshots: clear snapshots that reference this project
  const snapshotState = useSectionSnapshot.getState()
  const patchedSnapshots = { ...snapshotState.snapshots }
  let snapshotChanged = false
  for (const [key, snapshot] of Object.entries(patchedSnapshots)) {
    if (
      snapshot?.chatParams?.projectId === projectId ||
      snapshot?.projectShell?.projectId === projectId
    ) {
      delete patchedSnapshots[key as keyof typeof patchedSnapshots]
      snapshotChanged = true
    }
  }
  if (snapshotChanged) {
    useSectionSnapshot.setState({ snapshots: patchedSnapshots })
  }

  // 3. app-view: if current view references this project, clear the reference
  const appView = useAppView.getState()
  if (
    appView.chatParams?.projectId === projectId ||
    appView.projectShell?.projectId === projectId
  ) {
    const { projectId: _, ...restParams } = appView.chatParams as Record<string, unknown>
    useAppView.setState({
      chatParams: restParams,
      projectShell: null,
    })
  }

  // 4. recent-open: remove project entries from global list and project bucket
  cleanupRecentOpen(projectId)

  // 5. fs:toolbar: remove per-project toolbar prefs
  try {
    window.localStorage.removeItem(`openloaf:fs:toolbar:${projectId}`)
  } catch {}

  // 6. board-viewport: remove viewport caches for boards belonging to this project
  // Board IDs are not directly derivable from projectId in localStorage keys,
  // so we skip this (boards are cleaned up server-side; viewport cache is harmless).
}

/** Remove a deleted project from the recent-open store. */
function cleanupRecentOpen(projectId: string): void {
  const STORAGE_KEY = "openloaf:recent-open"
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const store = JSON.parse(raw) as {
      global?: Array<{ projectId?: string | null }>
      projects?: Record<string, unknown>
    }
    let changed = false

    // Remove from global list
    if (Array.isArray(store.global)) {
      const before = store.global.length
      store.global = store.global.filter((item) => item.projectId !== projectId)
      if (store.global.length !== before) changed = true
    }

    // Remove project bucket
    if (store.projects && projectId in store.projects) {
      delete store.projects[projectId]
      changed = true
    }

    if (changed) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
      window.dispatchEvent(new CustomEvent(RECENT_OPEN_EVENT))
    }
  } catch {}
}
