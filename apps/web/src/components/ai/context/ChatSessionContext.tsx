"use client";

import React, { createContext, useContext, type ReactNode } from "react";

export type ChatSiblingNav = {
  parentMessageId: string | null;
  prevSiblingId: string | null;
  nextSiblingId: string | null;
  siblingIndex: number;
  siblingTotal: number;
};

export type ChatSessionContextValue = {
  sessionId: string;
  tabId?: string;
  workspaceId?: string;
  projectId?: string;
  leafMessageId: string | null;
  branchMessageIds: string[];
  siblingNav: Record<string, ChatSiblingNav>;
};

const ChatSessionContext = createContext<ChatSessionContextValue | null>(null);

export function ChatSessionProvider({
  value,
  children,
}: {
  value: ChatSessionContextValue;
  children: ReactNode;
}) {
  return (
    <ChatSessionContext.Provider value={value}>
      {children}
    </ChatSessionContext.Provider>
  );
}

export function useChatSession() {
  const context = useContext(ChatSessionContext);
  if (!context) {
    throw new Error("useChatSession must be used within ChatSessionProvider");
  }
  return context;
}

export function useOptionalChatSession() {
  return useContext(ChatSessionContext);
}
