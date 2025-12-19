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
    prepareSendMessagesRequest({ id, messages, ...requestOptions }) {
      const mergedParams = { ...(paramsRef.current ?? {}), ...(requestOptions ?? {}) };
      const webClientId = getStableClientStreamClientId();
      const electronClientId = window.teatimeElectron?.electronClientId;

      if (messages.length === 0) {
        return {
          body: {
            params: mergedParams,
            sessionId: id,
            id,
            webClientId,
            electronClientId,
            messages: [],
          },
        };
      }

      const rawLastMessage = messages[messages.length - 1] as UIMessage & { parts?: any[] };
      const lastMessage = rawLastMessage as any;

      return {
        body: {
          params: mergedParams,
          sessionId: id,
          id,
          webClientId,
          electronClientId,
          messages: [lastMessage],
        },
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
