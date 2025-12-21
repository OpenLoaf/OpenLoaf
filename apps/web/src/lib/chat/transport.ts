"use client";

import { DefaultChatTransport } from "ai";
import type { UIMessage } from "@ai-sdk/react";
import type { RefObject } from "react";
import { getWebClientId } from "./streamClientId";

export function createChatTransport({
  paramsRef,
  tabIdRef,
}: {
  paramsRef: RefObject<Record<string, unknown> | undefined>;
  tabIdRef: RefObject<string | null | undefined>;
}) {
  const apiBase = `${process.env.NEXT_PUBLIC_SERVER_URL}/chat/sse`;

  return new DefaultChatTransport({
    api: apiBase,
    credentials: "include",
    prepareSendMessagesRequest({ id, messages, body, trigger, messageId, headers }) {
      const mergedParams = { ...(paramsRef.current ?? {}) };
      const clientId = getWebClientId();
      const tabId = typeof tabIdRef.current === "string" ? tabIdRef.current : undefined;
      const extraBody = body && typeof body === "object" ? body : {};

      if (messages.length === 0) {
        return {
          body: {
            ...extraBody,
            params: mergedParams,
            sessionId: id,
            id,
            clientId,
            tabId,
            trigger,
            messageId,
            messages: [],
          },
          headers,
        };
      }

      const rawLastMessage = messages[messages.length - 1] as UIMessage & { parts?: any[] };
      const lastMessage = rawLastMessage as any;

      return {
        body: {
          ...extraBody,
          params: mergedParams,
          sessionId: id,
          id,
          clientId,
          tabId,
          trigger,
          messageId,
          messages: [lastMessage],
        },
        headers,
      };
    },
    prepareReconnectToStreamRequest: ({ id }) => {
      const clientId = getWebClientId();
      return {
        api: `${apiBase}/${id}/stream${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`,
        credentials: "include",
      };
    },
  });
}
