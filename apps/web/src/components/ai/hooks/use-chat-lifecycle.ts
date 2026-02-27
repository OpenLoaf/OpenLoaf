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

import * as React from "react";
import { useTabSnapshotSync } from "@/hooks/use-tab-snapshot-sync";
import { useChatRuntime, type ChatStatus } from "@/hooks/use-chat-runtime";
import { playNotificationSound } from "@/lib/notification-sound";
import { startChatPerfLogger } from "@/lib/chat/chat-perf";

export function useChatLifecycle(input: {
  tabId?: string;
  sessionId: string;
  status: ChatStatus;
  soundEnabled: boolean;
  snapshotEnabled: boolean;
}) {
  const setSessionChatStatus = useChatRuntime((s) => s.setSessionChatStatus);
  const clearSessionChatStatus = useChatRuntime((s) => s.clearSessionChatStatus);
  const prevStatusRef = React.useRef(input.status);

  React.useEffect(() => {
    return startChatPerfLogger({ label: "chat", intervalMs: 1000 });
  }, []);

  React.useEffect(() => {
    const previousStatus = prevStatusRef.current;
    const wasStreaming =
      previousStatus === "submitted" || previousStatus === "streaming";
    const isStreaming =
      input.status === "submitted" || input.status === "streaming";
    prevStatusRef.current = input.status;
    if (!input.soundEnabled) return;
    if (!wasStreaming && isStreaming) {
      playNotificationSound("model-start");
      return;
    }
    if (wasStreaming && !isStreaming) {
      playNotificationSound("model-end");
    }
  }, [input.soundEnabled, input.status]);

  useTabSnapshotSync({
    enabled: input.snapshotEnabled,
    tabId: input.tabId,
    sessionId: input.sessionId,
  });

  React.useEffect(() => {
    const tabId = input.tabId;
    if (!tabId) return;
    if (!input.sessionId) return;
    setSessionChatStatus(tabId, input.sessionId, input.status);
    return () => {
      clearSessionChatStatus(input.sessionId);
    };
  }, [clearSessionChatStatus, input.sessionId, input.status, input.tabId, setSessionChatStatus]);
}
