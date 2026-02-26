"use client";

import React, { createContext, useContext, type ReactNode } from "react";
import type { ImageGenerateOptions } from "@openloaf/api/types/image";
import type { CodexOptions } from "@/lib/chat/codex-options";
import type { ChatAttachmentInput, MaskedAttachmentInput } from "../input/chat-attachments";

export type ChatOptionsContextValue = {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  imageOptions?: ImageGenerateOptions;
  setImageOptions: React.Dispatch<React.SetStateAction<ImageGenerateOptions | undefined>>;
  codexOptions?: CodexOptions;
  setCodexOptions: React.Dispatch<React.SetStateAction<CodexOptions | undefined>>;
  addAttachments?: (files: FileList | ChatAttachmentInput[]) => void;
  addMaskedAttachment?: (input: MaskedAttachmentInput) => void;
};

const ChatOptionsContext = createContext<ChatOptionsContextValue | null>(null);

export function ChatOptionsProvider({
  value,
  children,
}: {
  value: ChatOptionsContextValue;
  children: ReactNode;
}) {
  return (
    <ChatOptionsContext.Provider value={value}>
      {children}
    </ChatOptionsContext.Provider>
  );
}

export function useChatOptions() {
  const context = useContext(ChatOptionsContext);
  if (!context) {
    throw new Error("useChatOptions must be used within ChatOptionsProvider");
  }
  return context;
}

/** Return the chat options context if available. */
export function useOptionalChatOptions() {
  return useContext(ChatOptionsContext);
}
