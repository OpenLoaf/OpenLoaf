"use client";

import { DefaultChatTransport } from "ai";
import type { UIMessage } from "@ai-sdk/react";
import type { RefObject } from "react";
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
    prepareSendMessagesRequest({ id, messages, body, trigger, messageId, headers }) {
      const mergedParams = { ...(paramsRef.current ?? {}) };
      const webClientId = getStableClientStreamClientId();
      const electronClientId = window.teatimeElectron?.electronClientId;
      const extraBody = body && typeof body === "object" ? body : {};

      if (messages.length === 0) {
        return {
          body: {
            ...extraBody,
            params: mergedParams,
            sessionId: id,
            id,
            webClientId,
            electronClientId,
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
          webClientId,
          electronClientId,
          trigger,
          messageId,
          messages: [lastMessage],
        },
        headers,
      };
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
