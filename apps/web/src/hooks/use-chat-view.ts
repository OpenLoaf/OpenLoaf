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
import { isDedicatedWindowMode } from "@/lib/window-mode"

/** Scope sentinel for global (non-project) chat. */
export const GLOBAL_CHAT_SCOPE = "__global__"

/** Scope key: either a projectId or the global sentinel. */
export type ChatScopeKey = string

export interface ChatSessionSlot {
  /** Active session id for this scope; '' means none yet. */
  activeSessionId: string
}

export interface ChatViewState {
  /** Per-scope session slots. */
  sessions: Record<ChatScopeKey, ChatSessionSlot>
  /** Tab-scope online-search toggle (replaces old chatParams.chatOnlineSearchEnabled). */
  chatOnlineSearchEnabled: boolean

  /** Set the active session id for the given scope. */
  setActiveSession: (scope: ChatScopeKey, sessionId: string) => void
  /** Clear the active session id for the given scope. */
  clearActiveSession: (scope: ChatScopeKey) => void
  /** Toggle the online-search switch. */
  setChatOnlineSearchEnabled: (v: boolean) => void
  /** Read the active session id for a scope (non-React). */
  getActiveSessionId: (scope: ChatScopeKey) => string
}

/** Resolve storage by renderer mode to isolate project windows. */
function resolveStorage() {
  if (typeof window === "undefined") return localStorage
  return isDedicatedWindowMode() ? window.sessionStorage : window.localStorage
}

export const CHAT_VIEW_STORAGE_KEY = "openloaf:chat-view"

export const useChatView = create<ChatViewState>()(
  persist(
    (set, get) => ({
      sessions: {},
      chatOnlineSearchEnabled: false,

      setActiveSession: (scope, sessionId) => {
        set((state) => {
          const current = state.sessions[scope]?.activeSessionId ?? ""
          if (current === sessionId) return state
          return {
            sessions: {
              ...state.sessions,
              [scope]: { activeSessionId: sessionId },
            },
          }
        })
      },

      clearActiveSession: (scope) => {
        set((state) => {
          if (!(scope in state.sessions)) return state
          const { [scope]: _removed, ...rest } = state.sessions
          return { sessions: rest }
        })
      },

      setChatOnlineSearchEnabled: (v) => {
        set((state) =>
          state.chatOnlineSearchEnabled === v ? state : { chatOnlineSearchEnabled: v },
        )
      },

      getActiveSessionId: (scope) => {
        return get().sessions[scope]?.activeSessionId ?? ""
      },
    }),
    {
      name: CHAT_VIEW_STORAGE_KEY,
      storage: createJSONStorage(resolveStorage),
      version: 1,
      partialize: (state) => ({
        sessions: state.sessions,
        chatOnlineSearchEnabled: state.chatOnlineSearchEnabled,
      }),
    },
  ),
)
