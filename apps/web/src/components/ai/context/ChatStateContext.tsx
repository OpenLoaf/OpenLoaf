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

import React, { createContext, useContext, type ReactNode } from "react";
import type { UIMessage } from "@ai-sdk/react";
import type { ChatStatus } from "@/hooks/use-chat-runtime";

export type PendingCloudMessage = {
  parts: any[];
  metadata?: Record<string, unknown>;
  text: string;
};

// ── Messages context (high-frequency: changes every SSE chunk) ──

export type ChatMessagesContextValue = {
  messages: UIMessage[];
  isHistoryLoading: boolean;
  pendingCloudMessage?: PendingCloudMessage | null;
};

const ChatMessagesContext = createContext<ChatMessagesContextValue | null>(null);

// ── Status context (low-frequency: changes at session start/end) ──

export type ChatStatusContextValue = {
  status: ChatStatus;
  error: Error | undefined;
  stepThinking: boolean;
};

const ChatStatusContext = createContext<ChatStatusContextValue | null>(null);

// ── Message meta context (low-frequency: only changes when messages added/removed) ──

export type ChatMessageMetaContextValue = {
  messageCount: number;
  /** Number of assistant (AI) messages in the conversation. */
  assistantMessageCount: number;
  isHistoryLoading: boolean;
  lastUserMessageId: string | undefined;
  hasPendingCloudMessage: boolean;
};

const ChatMessageMetaContext = createContext<ChatMessageMetaContextValue | null>(null);

// ── Combined type (for backwards compat) ──

export type ChatStateContextValue = ChatMessagesContextValue & ChatStatusContextValue;

// ── Provider ──

export function ChatStateProvider({
  value,
  children,
}: {
  value: ChatStateContextValue;
  children: ReactNode;
}) {
  const messagesValue = React.useMemo(
    () => ({
      messages: value.messages,
      isHistoryLoading: value.isHistoryLoading,
      pendingCloudMessage: value.pendingCloudMessage,
    }),
    [value.messages, value.isHistoryLoading, value.pendingCloudMessage],
  );

  const statusValue = React.useMemo(
    () => ({
      status: value.status,
      error: value.error,
      stepThinking: value.stepThinking,
    }),
    [value.status, value.error, value.stepThinking],
  );

  // Derive last user message id — recomputes on messages change but returns
  // a stable primitive string, so the meta memo below stays stable during streaming.
  const lastUserMessageId = React.useMemo(() => {
    for (let i = value.messages.length - 1; i >= 0; i--) {
      if (value.messages[i]?.role === "user") return value.messages[i].id;
    }
    return undefined;
  }, [value.messages]);

  const hasPendingCloudMessage = Boolean(value.pendingCloudMessage);

  const assistantMessageCount = React.useMemo(
    () => value.messages.filter((m) => m.role === "assistant").length,
    [value.messages],
  );

  const metaValue = React.useMemo(
    () => ({
      messageCount: value.messages.length,
      assistantMessageCount,
      isHistoryLoading: value.isHistoryLoading,
      lastUserMessageId,
      hasPendingCloudMessage,
    }),
    [value.messages.length, assistantMessageCount, value.isHistoryLoading, lastUserMessageId, hasPendingCloudMessage],
  );

  return (
    <ChatMessagesContext.Provider value={messagesValue}>
      <ChatStatusContext.Provider value={statusValue}>
        <ChatMessageMetaContext.Provider value={metaValue}>
          {children}
        </ChatMessageMetaContext.Provider>
      </ChatStatusContext.Provider>
    </ChatMessagesContext.Provider>
  );
}

// ── Hooks ──

/** Subscribe to messages only (high frequency during streaming). */
export function useChatMessages() {
  const context = useContext(ChatMessagesContext);
  if (!context) {
    throw new Error("useChatMessages must be used within ChatStateProvider");
  }
  return context;
}

/** Subscribe to status only (low frequency). */
export function useChatStatus() {
  const context = useContext(ChatStatusContext);
  if (!context) {
    throw new Error("useChatStatus must be used within ChatStateProvider");
  }
  return context;
}

/**
 * Subscribe to message meta only (low frequency — only changes when messages added/removed).
 * Use this instead of useChatMessages() when you only need messageCount or lastUserMessageId.
 */
export function useChatMessageMeta() {
  const context = useContext(ChatMessageMetaContext);
  if (!context) {
    throw new Error("useChatMessageMeta must be used within ChatStateProvider");
  }
  return context;
}

/**
 * Subscribe to all chat state (backward compat).
 * Prefer useChatMessages() or useChatStatus() for better performance.
 */
export function useChatState() {
  const messages = useContext(ChatMessagesContext);
  const status = useContext(ChatStatusContext);
  if (!messages || !status) {
    throw new Error("useChatState must be used within ChatStateProvider");
  }
  return { ...messages, ...status };
}
