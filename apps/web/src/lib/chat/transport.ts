/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n"use client";

import { DefaultChatTransport } from "ai";
import type { UIMessage } from "@ai-sdk/react";
import type { RefObject } from "react";
import type { ChatRequestBody } from "@openloaf/api/types/message";
import { getWebClientId } from "./streamClientId";
import { resolveServerUrl } from "@/utils/server-url";
import { getClientTimeZone } from "@/utils/time-zone";
import { getAccessToken } from "@/lib/saas-auth";

function stripTotalUsageFromMetadata(message: any) {
  if (!message || typeof message !== "object") return message;
  const metadata = (message as any).metadata;
  if (!metadata || typeof metadata !== "object") return message;

  const { totalUsage, ...rest } = metadata as any;
  const nextMeta = Object.keys(rest).length ? rest : undefined;
  return { ...(message as any), metadata: nextMeta };
}

export function createChatTransport({
  paramsRef,
  tabIdRef,
}: {
  paramsRef: RefObject<Record<string, unknown> | undefined>;
  tabIdRef: RefObject<string | null | undefined>;
}) {
  const apiBase = `${resolveServerUrl()}/ai/chat`;

  return new DefaultChatTransport({
    api: apiBase,
    credentials: "include",
    async prepareSendMessagesRequest({ id, messages, body, messageId, headers }) {
      const accessToken = await getAccessToken();
      const nextHeaders =
        accessToken && headers
          ? { ...headers, Authorization: `Bearer ${accessToken}` }
          : accessToken
            ? { Authorization: `Bearer ${accessToken}` }
            : headers;
      const baseParams = { ...(paramsRef.current ?? {}) };
      const clientId = getWebClientId();
      const tabId = typeof tabIdRef.current === "string" ? tabIdRef.current : undefined;
      const extraBody = body && typeof body === "object" ? body : {};
      const bodyRecord = extraBody as Record<string, unknown>;
      const timezone = getClientTimeZone();
      const {
        params: _ignoredParams,
        id: _ignoredId,
        messages: _ignoredMessages,
        ...restBody
      } = bodyRecord;
      const basePayload = { ...baseParams, ...restBody };
      const payloadBase: ChatRequestBody = {
        ...basePayload,
        sessionId: id,
        clientId: clientId || undefined,
        timezone,
        tabId,
        messageId,
        intent: "chat",
        responseMode: "stream",
      };

      if (messages.length === 0) {
        return {
          body: {
            ...payloadBase,
            messages: [],
          },
          headers: nextHeaders,
        };
      }

      const rawLastMessage = messages[messages.length - 1] as UIMessage & { parts?: any[] };
      const lastMessage = stripTotalUsageFromMetadata(rawLastMessage as any);
      const messagesPayload = [lastMessage] as ChatRequestBody["messages"];

      return {
        body: {
          ...payloadBase,
          messages: messagesPayload,
        },
        headers: nextHeaders,
      };
    },
  });
}
