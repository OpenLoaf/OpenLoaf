"use client";

import { DefaultChatTransport } from "ai";
import type { UIMessage } from "@ai-sdk/react";
import type { RefObject } from "react";
import type { ChatRequestBody } from "@tenas-ai/api/types/message";
import { getWebClientId } from "./streamClientId";
import { resolveServerUrl } from "@/utils/server-url";
import { getClientTimeZone } from "@/utils/time-zone";

function stripTotalUsageFromMetadata(message: any) {
  if (!message || typeof message !== "object") return message;
  const metadata = (message as any).metadata;
  if (!metadata || typeof metadata !== "object") return message;

  // totalUsage 只用于 UI 展示/服务端落库统计，发送给后端会重复占用带宽，且后端会从 DB 补全完整链路。
  const { totalUsage, ...rest } = metadata as any;
  const nextMeta = Object.keys(rest).length ? rest : undefined;
  return { ...(message as any), metadata: nextMeta };
}

export function createChatTransport({
  paramsRef,
  tabIdRef,
  chatModelIdRef,
  chatModelSourceRef,
}: {
  paramsRef: RefObject<Record<string, unknown> | undefined>;
  tabIdRef: RefObject<string | null | undefined>;
  chatModelIdRef?: RefObject<string | null | undefined>;
  chatModelSourceRef?: RefObject<string | null | undefined>;
}) {
  const apiBase = `${resolveServerUrl()}/ai/execute`;

  return new DefaultChatTransport({
    api: apiBase,
    credentials: "include",
    prepareSendMessagesRequest({ id, messages, body, messageId, headers }) {
      const baseParams = { ...(paramsRef.current ?? {}) };
      const clientId = getWebClientId();
      const tabId = typeof tabIdRef.current === "string" ? tabIdRef.current : undefined;
      const extraBody = body && typeof body === "object" ? body : {};
      const bodyRecord = extraBody as Record<string, unknown>;
      const explicitChatModelId =
        typeof bodyRecord.chatModelId === "string" ? bodyRecord.chatModelId : undefined;
      const explicitChatModelSource =
        typeof bodyRecord.chatModelSource === "string" ? bodyRecord.chatModelSource : undefined;
      const refChatModelId =
        typeof chatModelIdRef?.current === "string" ? chatModelIdRef.current : undefined;
      const refChatModelSource =
        typeof chatModelSourceRef?.current === "string"
          ? chatModelSourceRef.current
          : undefined;
      // 中文注释：显式 chatModelId 优先，其次使用最新设置值。
      const normalizedChatModelId =
        (explicitChatModelId ?? refChatModelId)?.trim() || undefined;
      const resolvedChatModelSource =
        (explicitChatModelSource ?? refChatModelSource)?.trim() || "";
      // 只允许 local/cloud，非法值视为未传。
      const normalizedChatModelSource =
        resolvedChatModelSource === "local" || resolvedChatModelSource === "cloud"
          ? resolvedChatModelSource
          : undefined;
      const timezone = getClientTimeZone();
      const {
        chatModelId: _ignored,
        chatModelSource: _ignoredSource,
        params: _ignoredParams,
        id: _ignoredId,
        messages: _ignoredMessages,
        ...restBody
      } = bodyRecord;
      // 中文注释：自定义字段直接合并到顶层，不再使用 params。
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
        ...(normalizedChatModelId ? { chatModelId: normalizedChatModelId } : {}),
        ...(normalizedChatModelSource ? { chatModelSource: normalizedChatModelSource } : {}),
      };

      if (messages.length === 0) {
        return {
          body: {
            ...payloadBase,
            messages: [],
          },
          headers,
        };
      }

      const rawLastMessage = messages[messages.length - 1] as UIMessage & { parts?: any[] };
      const lastMessage = stripTotalUsageFromMetadata(rawLastMessage as any);
      const messagesPayload = [lastMessage] as ChatRequestBody["messages"];

      return {
        body: {
          // 后端会从 DB 补全完整历史链路；前端只需发送最后一条消息即可。
          ...payloadBase,
          messages: messagesPayload,
        },
        headers,
      };
    },
  });
}
