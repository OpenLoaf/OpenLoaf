"use client";

import { DefaultChatTransport } from "ai";
import type { UIMessage } from "@ai-sdk/react";
import { CLIENT_CONTEXT_PART_TYPE } from "@teatime-ai/api/types/parts";
import type { RefObject } from "react";
import { useTabs } from "@/hooks/use-tabs";
import { getStableClientStreamClientId } from "./streamClientId";

export function createChatTransport({
  paramsRef,
}: {
  paramsRef: RefObject<Record<string, unknown> | undefined>;
}) {
  const apiBase = `${process.env.NEXT_PUBLIC_SERVER_URL}/chat/sse`;

  return new DefaultChatTransport({
    api: apiBase,
    credentials: "include",
    prepareSendMessagesRequest({ id, messages, ...requestOptions }) {
      const mergedParams = { ...(paramsRef.current ?? {}), ...(requestOptions ?? {}) };

      if (messages.length === 0) {
        return { body: { params: mergedParams, sessionId: id, id, messages: [] } };
      }

      const { tabs, activeTabId } = useTabs.getState();
      const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
      const webClientId = getStableClientStreamClientId();
      const electronClientId = window.teatimeElectron?.electronClientId;

      const rawLastMessage = messages[messages.length - 1] as UIMessage & { parts?: any[] };
      const lastMessage = {
        ...rawLastMessage,
        // 关键：通过 data part 把当前 tab 传给后端（agent 路由/权限/工具上下文）
        parts: [
          ...(Array.isArray(rawLastMessage?.parts) ? rawLastMessage.parts : []),
          { type: CLIENT_CONTEXT_PART_TYPE, data: { activeTab, webClientId, electronClientId } },
        ],
      } as any;

      return { body: { params: mergedParams, sessionId: id, id, messages: [lastMessage] } };
    },
    prepareReconnectToStreamRequest: ({ id }) => {
      const clientId = getStableClientStreamClientId();
      return {
        api: `${apiBase}/${id}/stream${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`,
        credentials: "include",
      };
    },
  });
}
