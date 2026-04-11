/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { create } from 'zustand'
import type { BackgroundTaskSummary } from '@openloaf/api'

type BgState = {
  /** sessionId → taskId → summary. Per-session keying lets us keep multiple
   *  chat sessions' processes isolated without polluting the UI when the user
   *  switches tabs. */
  bySession: Record<string, Record<string, BackgroundTaskSummary>>
  upsertTask: (sessionId: string, task: BackgroundTaskSummary) => void
  removeTask: (sessionId: string, taskId: string) => void
  clearSession: (sessionId: string) => void
  hydrateSession: (sessionId: string, tasks: BackgroundTaskSummary[]) => void
}

export const useBackgroundProcesses = create<BgState>((set) => ({
  bySession: {},
  upsertTask: (sessionId, task) =>
    set((state) => {
      const current = state.bySession[sessionId] ?? {}
      return {
        bySession: {
          ...state.bySession,
          [sessionId]: { ...current, [task.id]: task },
        },
      }
    }),
  removeTask: (sessionId, taskId) =>
    set((state) => {
      const current = state.bySession[sessionId]
      if (!current) return state
      const next = { ...current }
      delete next[taskId]
      return {
        bySession: { ...state.bySession, [sessionId]: next },
      }
    }),
  clearSession: (sessionId) =>
    set((state) => {
      if (!state.bySession[sessionId]) return state
      const next = { ...state.bySession }
      delete next[sessionId]
      return { bySession: next }
    }),
  hydrateSession: (sessionId, tasks) =>
    set((state) => {
      const map: Record<string, BackgroundTaskSummary> = {}
      for (const task of tasks) map[task.id] = task
      return {
        bySession: { ...state.bySession, [sessionId]: map },
      }
    }),
}))

/** Read-only selector: all tasks for the given session, sorted with running first. */
export function selectSessionBgTasks(sessionId: string) {
  return (state: BgState): BackgroundTaskSummary[] => {
    const map = state.bySession[sessionId]
    if (!map) return []
    const arr = Object.values(map)
    arr.sort((a, b) => {
      if (a.status === 'running' && b.status !== 'running') return -1
      if (a.status !== 'running' && b.status === 'running') return 1
      return b.startTime - a.startTime
    })
    return arr
  }
}
