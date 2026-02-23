"use client";

import React, { createContext, useContext, type ReactNode } from "react";
import type { ToolPartSnapshot } from "@/hooks/use-chat-runtime";

export type SubAgentStreamState = {
  toolCallId: string;
  name?: string;
  task?: string;
  output: string;
  errorText?: string;
  parts?: unknown[];
  state: "output-streaming" | "output-available" | "output-error";
  streaming?: boolean;
};

export type ChatToolContextValue = {
  toolParts: Record<string, ToolPartSnapshot>;
  upsertToolPart: (toolCallId: string, next: ToolPartSnapshot) => void;
  markToolStreaming: (toolCallId: string) => void;
  subAgentStreams: Record<string, SubAgentStreamState>;
  /** Queue approval payload for a tool call. */
  queueToolApprovalPayload: (toolCallId: string, payload: Record<string, unknown>) => void;
  /** Clear queued approval payload for a tool call. */
  clearToolApprovalPayload: (toolCallId: string) => void;
  /** Attempt to continue chat after approvals are resolved. */
  continueAfterToolApprovals: () => void;
};

const ChatToolContext = createContext<ChatToolContextValue | null>(null);

export function ChatToolProvider({
  value,
  children,
}: {
  value: ChatToolContextValue;
  children: ReactNode;
}) {
  return (
    <ChatToolContext.Provider value={value}>
      {children}
    </ChatToolContext.Provider>
  );
}

export function useChatTools() {
  const context = useContext(ChatToolContext);
  if (!context) {
    throw new Error("useChatTools must be used within ChatToolProvider");
  }
  return context;
}
