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
  const setTabChatStatus = useChatRuntime((s) => s.setTabChatStatus);
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
    if (!input.tabId) return;
    setTabChatStatus(input.tabId, input.status);
    return () => {
      setTabChatStatus(input.tabId, null);
    };
  }, [input.tabId, input.status, setTabChatStatus]);
}
