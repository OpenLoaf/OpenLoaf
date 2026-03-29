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

import React from "react";
import type { UIMessage } from "@ai-sdk/react";
import { useChatRuntime } from "@/hooks/use-chat-runtime";
import { useLayoutState } from "@/hooks/use-layout-state";
import { useRecordEntityVisit } from "@/hooks/use-record-entity-visit";
import { createChatSessionId } from "@/lib/chat-session-id";

type UseChatSessionManagementOptions = {
  sessionId: string;
  tabId?: string;
  projectId?: string;
  sessionIdRef: React.MutableRefObject<string>;
  chat: {
    stop: () => void;
    setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void;
  };
  pendingUserMessageIdRef: React.MutableRefObject<string | null>;
  needsBranchMetaRefreshRef: React.MutableRefObject<boolean>;
  branchSnapshotReceivedRef: React.MutableRefObject<boolean>;
  pendingCompactRequestRef: React.MutableRefObject<string | null>;
  resetSnapshot: () => void;
  resetSubAgentStreams: () => void;
  setStepThinking: React.Dispatch<React.SetStateAction<boolean>>;
  onSessionChange?: (
    sessionId: string,
    options?: { loadHistory?: boolean; replaceCurrent?: boolean }
  ) => void;
};

export function useChatSessionManagement({
  sessionId,
  tabId,
  projectId,
  sessionIdRef,
  chat,
  pendingUserMessageIdRef,
  needsBranchMetaRefreshRef,
  branchSnapshotReceivedRef,
  pendingCompactRequestRef,
  resetSnapshot,
  resetSubAgentStreams,
  setStepThinking,
  onSessionChange,
}: UseChatSessionManagementOptions) {
  const clearToolPartsForTab = useChatRuntime((s) => s.clearToolPartsForTab);
  const clearCcRuntime = useChatRuntime((s) => s.clearCcRuntime);
  const { recordEntityVisit } = useRecordEntityVisit();

  /** Stop streaming and reset local state before switching sessions. */
  const stopAndResetSession = React.useCallback(
    (clearTools: boolean) => {
      chat.stop();
      chat.setMessages([]);
      pendingUserMessageIdRef.current = null;
      needsBranchMetaRefreshRef.current = false;
      branchSnapshotReceivedRef.current = false;
      pendingCompactRequestRef.current = null;
      resetSnapshot();
      resetSubAgentStreams();
      setStepThinking(false);
      if (clearTools && tabId) {
        clearToolPartsForTab(tabId);
        clearCcRuntime(tabId);
      }
    },
    [
      chat.stop,
      chat.setMessages,
      tabId,
      clearToolPartsForTab,
      clearCcRuntime,
      resetSnapshot,
      resetSubAgentStreams,
      setStepThinking,
      pendingUserMessageIdRef,
      needsBranchMetaRefreshRef,
      branchSnapshotReceivedRef,
      pendingCompactRequestRef,
    ]
  );

  const newSession = React.useCallback(() => {
    // If left dock only has stack (no base panel), clear the stack
    const ls = useLayoutState.getState()
    if (!ls.base && ls.stack.length > 0) {
      ls.clearStack()
    }

    stopAndResetSession(true);
    const nextSessionId = createChatSessionId();
    sessionIdRef.current = nextSessionId;
    recordEntityVisit({
      entityType: "chat",
      entityId: nextSessionId,
      projectId: projectId ?? null,
      trigger: "chat-create",
    });
    onSessionChange?.(nextSessionId, {
      loadHistory: false,
      replaceCurrent: true,
    });
  }, [onSessionChange, projectId, recordEntityVisit, stopAndResetSession, sessionIdRef]);

  const selectSession = React.useCallback(
    (nextSessionId: string) => {
      stopAndResetSession(true);
      sessionIdRef.current = nextSessionId;
      onSessionChange?.(nextSessionId, {
        loadHistory: true,
        replaceCurrent: true,
      });
    },
    [stopAndResetSession, onSessionChange, sessionIdRef]
  );

  return {
    stopAndResetSession,
    newSession,
    selectSession,
  };
}
