"use client";

import type { UIMessage } from "@ai-sdk/react";
import { useTabs } from "@/hooks/use-tabs";

// 关键：从 messages.parts 同步 tool 状态到 zustand（用于 ToolResultPanel 展示）
export function syncToolPartsFromMessages({
  tabId,
  messages,
}: {
  tabId: string | undefined;
  messages: UIMessage[];
}) {
  if (!tabId) return;
  const upsertToolPart = useTabs.getState().upsertToolPart;

  for (const message of messages) {
    const messageId = typeof message.id === "string" ? message.id : "m";
    const parts = (message as any).parts ?? [];
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const type = typeof part?.type === "string" ? part.type : "";
      const isTool = type === "dynamic-tool" || type.startsWith("tool-");
      if (!isTool) continue;
      const toolKey = String(part.toolCallId ?? `${messageId}:${index}`);
      const current = useTabs.getState().toolPartsByTabId[tabId]?.[toolKey];
      upsertToolPart(tabId, toolKey, { ...current, ...part } as any);
    }
  }
}
