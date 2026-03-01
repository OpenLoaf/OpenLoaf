/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { create } from "zustand";
import type { SubAgentStreamState } from "@/components/ai/context/ChatToolContext";

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

// ─── Claude Code Runtime Types ─────────────────────────────────────────

export type CcToolProgress = {
  toolName: string;
  elapsedSeconds: number;
};

export type CcTask = {
  description: string;
  status: "running" | "completed" | "failed" | "stopped";
  lastToolName?: string;
  summary?: string;
};

export type CcRateLimit = {
  status: "allowed" | "allowed_warning" | "rejected";
  resetsAt?: number;
  utilization?: number;
};

export type CcResult = {
  subtype: string;
  totalCostUsd: number;
  numTurns: number;
  durationMs: number;
  errors: string[];
  permissionDenials: Array<{ toolName: string }>;
};

export type CcUserQuestion = {
  sessionId: string;
  toolUseId: string;
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiSelect: boolean;
  }>;
  answered: boolean;
  answers?: Record<string, string>;
};

export type ClaudeCodeRuntimeState = {
  init?: {
    model: string;
    tools: string[];
    mcpServers: Array<{ name: string; status: string }>;
    claudeCodeVersion: string;
    cwd: string;
  };
  status?: string | null;
  toolProgress: Record<string, CcToolProgress>;
  tasks: Record<string, CcTask>;
  rateLimit?: CcRateLimit;
  result?: CcResult;
  userQuestion?: CcUserQuestion;
};

export type ChatRuntimeState = {
  /** Tool parts grouped by tab id. */
  toolPartsByTabId: Record<string, Record<string, ToolPartSnapshot>>;
  /** Chat status grouped by tab id. */
  chatStatusByTabId: Record<string, ChatStatus | null | undefined>;
  /** Chat status grouped by session id. */
  chatStatusBySessionId: Record<string, ChatStatus | null | undefined>;
  /** Map session id to tab id. */
  sessionTabIdBySessionId: Record<string, string>;
  /** Dictation status grouped by tab id. */
  dictationStatusByTabId: Record<string, boolean>;
  /** Sub-agent streams grouped by tab id. */
  subAgentStreamsByTabId: Record<string, Record<string, SubAgentStreamState>>;
  /** Upsert a tool part snapshot for a tab. */
  upsertToolPart: (tabId: string, toolCallId: string, next: ToolPartSnapshot) => void;
  /** Clear tool parts for a tab. */
  clearToolPartsForTab: (tabId: string) => void;
  /** Clear all chat runtime state for a tab. */
  clearRuntimeByTabId: (tabId: string) => void;
  /** Set chat status for a tab. */
  setTabChatStatus: (tabId: string, status: ChatStatus | null) => void;
  /** Set chat status for a session. */
  setSessionChatStatus: (
    tabId: string,
    sessionId: string,
    status: ChatStatus | null,
  ) => void;
  /** Clear chat status for a session. */
  clearSessionChatStatus: (sessionId: string) => void;
  /** Set dictation status for a tab. */
  setTabDictationStatus: (tabId: string, isListening: boolean) => void;
  /** Set sub-agent streams for a tab. */
  setSubAgentStreams: (tabId: string, streams: Record<string, SubAgentStreamState>) => void;
  /** Claude Code runtime state grouped by tab id. */
  ccRuntimeByTabId: Record<string, ClaudeCodeRuntimeState>;
  /** Shallow-merge a patch into Claude Code runtime state for a tab. */
  updateCcRuntime: (tabId: string, patch: Partial<ClaudeCodeRuntimeState>) => void;
  /** Clear Claude Code runtime state for a tab (preserves result for stats display). */
  clearCcRuntime: (tabId: string) => void;
};

function computeTabChatStatus(
  sessionTabIdBySessionId: Record<string, string>,
  chatStatusBySessionId: Record<string, ChatStatus | null | undefined>,
  tabId: string,
): ChatStatus | null {
  let hasAny = false;
  let hasError = false;
  for (const [sessionId, mappedTabId] of Object.entries(sessionTabIdBySessionId)) {
    if (mappedTabId !== tabId) continue;
    hasAny = true;
    const status = chatStatusBySessionId[sessionId];
    if (status === "submitted" || status === "streaming") return "streaming";
    if (status === "error") hasError = true;
  }
  if (!hasAny) return null;
  if (hasError) return "error";
  return "ready";
}

export const useChatRuntime = create<ChatRuntimeState>()((set, get) => ({
  toolPartsByTabId: {},
  chatStatusByTabId: {},
  chatStatusBySessionId: {},
  sessionTabIdBySessionId: {},
  dictationStatusByTabId: {},
  subAgentStreamsByTabId: {},
  ccRuntimeByTabId: {},
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
      const hasSubAgentStreams = Boolean(state.subAgentStreamsByTabId[tabId]);
      const hasCcRuntime = Boolean(state.ccRuntimeByTabId[tabId]);
      const hasSessionStatus = Object.values(state.sessionTabIdBySessionId).some(
        (mappedTabId) => mappedTabId === tabId,
      );
      if (!hasToolParts && !hasChatStatus && !hasDictation && !hasSubAgentStreams && !hasCcRuntime && !hasSessionStatus) return state;

      const nextToolParts = { ...state.toolPartsByTabId };
      const nextChatStatus = { ...state.chatStatusByTabId };
      const nextDictation = { ...state.dictationStatusByTabId };
      const nextSubAgentStreams = { ...state.subAgentStreamsByTabId };
      const nextCcRuntime = { ...state.ccRuntimeByTabId };
      const nextSessionStatus = { ...state.chatStatusBySessionId };
      const nextSessionTab = { ...state.sessionTabIdBySessionId };
      delete nextToolParts[tabId];
      delete nextChatStatus[tabId];
      delete nextDictation[tabId];
      delete nextSubAgentStreams[tabId];
      delete nextCcRuntime[tabId];
      for (const [sessionId, mappedTabId] of Object.entries(nextSessionTab)) {
        if (mappedTabId !== tabId) continue;
        delete nextSessionTab[sessionId];
        delete nextSessionStatus[sessionId];
      }
      return {
        toolPartsByTabId: nextToolParts,
        chatStatusByTabId: nextChatStatus,
        chatStatusBySessionId: nextSessionStatus,
        sessionTabIdBySessionId: nextSessionTab,
        dictationStatusByTabId: nextDictation,
        subAgentStreamsByTabId: nextSubAgentStreams,
        ccRuntimeByTabId: nextCcRuntime,
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
  setSessionChatStatus: (tabId, sessionId, status) => {
    set((state) => {
      const nextSessionStatus = {
        ...state.chatStatusBySessionId,
        [sessionId]: status,
      };
      const nextSessionTab = {
        ...state.sessionTabIdBySessionId,
        [sessionId]: tabId,
      };
      const nextTabStatus = { ...state.chatStatusByTabId };
      const computed = computeTabChatStatus(nextSessionTab, nextSessionStatus, tabId);
      if (computed === null) {
        delete nextTabStatus[tabId];
      } else {
        nextTabStatus[tabId] = computed;
      }
      return {
        chatStatusBySessionId: nextSessionStatus,
        sessionTabIdBySessionId: nextSessionTab,
        chatStatusByTabId: nextTabStatus,
      };
    });
  },
  clearSessionChatStatus: (sessionId) => {
    set((state) => {
      const mappedTabId = state.sessionTabIdBySessionId[sessionId];
      if (!mappedTabId) {
        if (!state.chatStatusBySessionId[sessionId]) return state;
      }
      const nextSessionStatus = { ...state.chatStatusBySessionId };
      const nextSessionTab = { ...state.sessionTabIdBySessionId };
      delete nextSessionStatus[sessionId];
      delete nextSessionTab[sessionId];
      const nextTabStatus = { ...state.chatStatusByTabId };
      if (mappedTabId) {
        const computed = computeTabChatStatus(nextSessionTab, nextSessionStatus, mappedTabId);
        if (computed === null) {
          delete nextTabStatus[mappedTabId];
        } else {
          nextTabStatus[mappedTabId] = computed;
        }
      }
      return {
        chatStatusBySessionId: nextSessionStatus,
        sessionTabIdBySessionId: nextSessionTab,
        chatStatusByTabId: nextTabStatus,
      };
    });
  },
  setTabDictationStatus: (tabId, isListening) => {
    set((state) => ({
      dictationStatusByTabId: {
        ...state.dictationStatusByTabId,
        [tabId]: Boolean(isListening),
      },
    }));
  },
  setSubAgentStreams: (tabId, streams) => {
    set((state) => ({
      subAgentStreamsByTabId: {
        ...state.subAgentStreamsByTabId,
        [tabId]: streams,
      },
    }));
  },
  updateCcRuntime: (tabId, patch) => {
    set((state) => {
      const current = state.ccRuntimeByTabId[tabId] ?? {
        toolProgress: {},
        tasks: {},
      };
      return {
        ccRuntimeByTabId: {
          ...state.ccRuntimeByTabId,
          [tabId]: { ...current, ...patch },
        },
      };
    });
  },
  clearCcRuntime: (tabId) => {
    set((state) => {
      if (!state.ccRuntimeByTabId[tabId]) return state;
      const next = { ...state.ccRuntimeByTabId };
      delete next[tabId];
      return { ccRuntimeByTabId: next };
    });
  },
}));
