"use client";

import React, { createContext, useContext, type ReactNode } from "react";
import type { ToolPartSnapshot } from "@/hooks/use-tabs";

export type SubAgentStreamState = {
  toolCallId: string;
  name?: string;
  task?: string;
  output: string;
  errorText?: string;
  state: "output-streaming" | "output-available" | "output-error";
  streaming?: boolean;
};

export type ChatToolContextValue = {
  toolParts: Record<string, ToolPartSnapshot>;
  upsertToolPart: (toolCallId: string, next: ToolPartSnapshot) => void;
  markToolStreaming: (toolCallId: string) => void;
  subAgentStreams: Record<string, SubAgentStreamState>;
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
