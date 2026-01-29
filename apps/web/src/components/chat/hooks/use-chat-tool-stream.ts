"use client";

import * as React from "react";
import { handleChatDataPart } from "@/lib/chat/dataPart";
import { syncToolPartsFromMessages } from "@/lib/chat/toolParts";
import {
  createFrontendToolExecutor,
  registerDefaultFrontendToolHandlers,
} from "@/lib/chat/frontend-tool-executor";

export function useChatToolStream() {
  const executorRef = React.useRef<ReturnType<typeof createFrontendToolExecutor>>();
  if (!executorRef.current) {
    const executor = createFrontendToolExecutor();
    registerDefaultFrontendToolHandlers(executor);
    executorRef.current = executor;
  }

  const handleDataPart = React.useCallback(
    (input: {
      dataPart: any;
      tabId?: string;
      upsertToolPartMerged: (key: string, next: any) => void;
    }) => {
      handleChatDataPart({
        dataPart: input.dataPart,
        tabId: input.tabId,
        upsertToolPartMerged: input.upsertToolPartMerged,
      });
      void executorRef.current?.executeFromDataPart({
        dataPart: input.dataPart,
        tabId: input.tabId,
      });
    },
    []
  );

  const syncFromMessages = React.useCallback(
    (input: { tabId?: string; messages: any[] }) => {
      syncToolPartsFromMessages({
        tabId: input.tabId,
        messages: input.messages as any,
      });
    },
    []
  );

  const executeFromToolPart = React.useCallback(
    (input: { part: any; tabId?: string }) => {
      return (
        executorRef.current?.executeFromToolPart(input) ?? Promise.resolve(false)
      );
    },
    []
  );

  const handleToolCall = React.useCallback(
    (input: { toolCall: any; tabId?: string }) => {
      return (
        executorRef.current?.executeFromToolCall(input) ?? Promise.resolve(false)
      );
    },
    []
  );

  const api = React.useMemo(
    () => ({ handleDataPart, syncFromMessages, executeFromToolPart, handleToolCall }),
    [handleDataPart, syncFromMessages, executeFromToolPart, handleToolCall]
  );

  // 保持返回对象引用稳定，避免依赖触发无限更新。
  return api;
}
