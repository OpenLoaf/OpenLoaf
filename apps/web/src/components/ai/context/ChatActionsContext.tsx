"use client";

import React, { createContext, useContext, type ReactNode } from "react";
import type { UIMessage, UseChatHelpers } from "@ai-sdk/react";
import type { PendingCloudMessage } from "./ChatStateContext";

export type ChatActionsContextValue = {
  sendMessage: UseChatHelpers<UIMessage>["sendMessage"];
  regenerate: UseChatHelpers<UIMessage>["regenerate"];
  addToolApprovalResponse: UseChatHelpers<UIMessage>["addToolApprovalResponse"];
  clearError: UseChatHelpers<UIMessage>["clearError"];
  stopGenerating: () => void;
  updateMessage: (id: string, updates: Partial<UIMessage>) => void;
  newSession: () => void;
  selectSession: (sessionId: string) => void;
  switchSibling: (
    messageId: string,
    direction: "prev" | "next",
    navOverride?: { prevSiblingId?: string | null; nextSiblingId?: string | null },
  ) => void;
  retryAssistantMessage: (assistantMessageId: string) => void;
  resendUserMessage: (
    userMessageId: string,
    nextText: string,
    nextParts?: any[],
  ) => void;
  deleteMessageSubtree: (messageId: string) => Promise<boolean>;
  setPendingCloudMessage: (msg: PendingCloudMessage | null) => void;
  sendPendingCloudMessage: () => void;
};

const ChatActionsContext = createContext<ChatActionsContextValue | null>(null);

export function ChatActionsProvider({
  value,
  children,
}: {
  value: ChatActionsContextValue;
  children: ReactNode;
}) {
  return (
    <ChatActionsContext.Provider value={value}>
      {children}
    </ChatActionsContext.Provider>
  );
}

export function useChatActions() {
  const context = useContext(ChatActionsContext);
  if (!context) {
    throw new Error("useChatActions must be used within ChatActionsProvider");
  }
  return context;
}
