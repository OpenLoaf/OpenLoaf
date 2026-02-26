/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import React, { createContext, useContext, type ReactNode } from "react";
import type { UIMessage } from "@ai-sdk/react";
import type { ChatStatus } from "@/hooks/use-chat-runtime";

export type PendingCloudMessage = {
  parts: any[];
  metadata?: Record<string, unknown>;
  text: string;
};

export type ChatStateContextValue = {
  messages: UIMessage[];
  status: ChatStatus;
  error: Error | undefined;
  isHistoryLoading: boolean;
  stepThinking: boolean;
  pendingCloudMessage?: PendingCloudMessage | null;
};

const ChatStateContext = createContext<ChatStateContextValue | null>(null);

export function ChatStateProvider({
  value,
  children,
}: {
  value: ChatStateContextValue;
  children: ReactNode;
}) {
  return (
    <ChatStateContext.Provider value={value}>
      {children}
    </ChatStateContext.Provider>
  );
}

export function useChatState() {
  const context = useContext(ChatStateContext);
  if (!context) {
    throw new Error("useChatState must be used within ChatStateProvider");
  }
  return context;
}
