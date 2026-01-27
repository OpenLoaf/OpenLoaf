"use client";

import { create } from "zustand";

export type ToolPartSnapshot = {
  /** Tool part type, e.g. tool-xxx or dynamic-tool. */
  type?: string;
  /** Tool call id for state lookup. */
  toolCallId?: string;
  /** Tool name for display. */
  toolName?: string;
  /** Tool title for display. */
  title?: string;
  /** Tool state. */
  state?: string;
  /** Tool input payload. */
  input?: unknown;
  /** Tool output payload. */
  output?: unknown;
  /** Tool error text. */
  errorText?: string | null;
  /** Tool approval status. */
  approval?: { id?: string; approved?: boolean; reason?: string };
  /** Rendering variant for specialized tool UI. */
  variant?: string;
  /** Streaming flag from frontend. */
  streaming?: boolean;
  /** Preserve unknown fields for tool-specific payloads. */
  [key: string]: unknown;
};

export type ChatStatus = "ready" | "submitted" | "streaming" | "error";

export type ChatRuntimeState = {
  /** Tool parts grouped by tab id. */
  toolPartsByTabId: Record<string, Record<string, ToolPartSnapshot>>;
  /** Chat status grouped by tab id. */
  chatStatusByTabId: Record<string, ChatStatus | null | undefined>;
  /** Dictation status grouped by tab id. */
  dictationStatusByTabId: Record<string, boolean>;
  /** Upsert a tool part snapshot for a tab. */
  upsertToolPart: (tabId: string, toolCallId: string, next: ToolPartSnapshot) => void;
  /** Clear tool parts for a tab. */
  clearToolPartsForTab: (tabId: string) => void;
  /** Clear all chat runtime state for a tab. */
  clearRuntimeByTabId: (tabId: string) => void;
  /** Set chat status for a tab. */
  setTabChatStatus: (tabId: string, status: ChatStatus | null) => void;
  /** Set dictation status for a tab. */
  setTabDictationStatus: (tabId: string, isListening: boolean) => void;
};

export const useChatRuntime = create<ChatRuntimeState>()((set, get) => ({
  toolPartsByTabId: {},
  chatStatusByTabId: {},
  dictationStatusByTabId: {},
  upsertToolPart: (tabId, toolCallId, next) => {
    set((state) => {
      const currentTabParts = state.toolPartsByTabId[tabId] ?? {};
      const current = currentTabParts[toolCallId] ?? {};
      const merged = { ...current, ...next } as ToolPartSnapshot;
      return {
        toolPartsByTabId: {
          ...state.toolPartsByTabId,
          [tabId]: {
            ...currentTabParts,
            [toolCallId]: merged,
          },
        },
      };
    });
  },
  clearToolPartsForTab: (tabId) => {
    set((state) => {
      if (!state.toolPartsByTabId[tabId]) return state;
      const next = { ...state.toolPartsByTabId };
      delete next[tabId];
      return { toolPartsByTabId: next };
    });
  },
  clearRuntimeByTabId: (tabId) => {
    set((state) => {
      const hasToolParts = Boolean(state.toolPartsByTabId[tabId]);
      const hasChatStatus = Object.prototype.hasOwnProperty.call(state.chatStatusByTabId, tabId);
      const hasDictation = Object.prototype.hasOwnProperty.call(state.dictationStatusByTabId, tabId);
      if (!hasToolParts && !hasChatStatus && !hasDictation) return state;

      const nextToolParts = { ...state.toolPartsByTabId };
      const nextChatStatus = { ...state.chatStatusByTabId };
      const nextDictation = { ...state.dictationStatusByTabId };
      delete nextToolParts[tabId];
      delete nextChatStatus[tabId];
      delete nextDictation[tabId];
      return {
        toolPartsByTabId: nextToolParts,
        chatStatusByTabId: nextChatStatus,
        dictationStatusByTabId: nextDictation,
      };
    });
  },
  setTabChatStatus: (tabId, status) => {
    set((state) => ({
      chatStatusByTabId: {
        ...state.chatStatusByTabId,
        [tabId]: status,
      },
    }));
  },
  setTabDictationStatus: (tabId, isListening) => {
    set((state) => ({
      dictationStatusByTabId: {
        ...state.dictationStatusByTabId,
        [tabId]: Boolean(isListening),
      },
    }));
  },
}));
