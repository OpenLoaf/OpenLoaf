"use client";

import { DefaultChatTransport } from "ai";
import type { UIMessage } from "@ai-sdk/react";
import type { RefObject } from "react";
import { getWebClientId } from "./streamClientId";

/** Build request params that carry all custom fields except id/messages. */
function buildRequestParams(input: {
  baseParams: Record<string, unknown>;
  extraBody: Record<string, unknown>;
  chatModelId?: string;
  chatModelSource?: string;
  sessionId?: string;
  clientId?: string;
  tabId?: string;
  trigger?: string;
  messageId?: string;
}) {
  const params = { ...input.baseParams };
  Object.assign(params, input.extraBody);
  if (input.chatModelId) params.chatModelId = input.chatModelId;
  if (input.chatModelSource) params.chatModelSource = input.chatModelSource;
  if (input.sessionId) params.sessionId = input.sessionId;
  if (input.clientId) params.clientId = input.clientId;
  if (input.tabId) params.tabId = input.tabId;
  if (input.trigger) params.trigger = input.trigger;
  if (input.messageId) params.messageId = input.messageId;
  return params;
}

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
  const apiBase = `${process.env.NEXT_PUBLIC_SERVER_URL}/chat/sse`;

  return new DefaultChatTransport({
    api: apiBase,
    credentials: "include",
    prepareSendMessagesRequest({ id, messages, body, trigger, messageId, headers }) {
      const mergedParams = { ...(paramsRef.current ?? {}) };
      const clientId = getWebClientId();
      const tabId = typeof tabIdRef.current === "string" ? tabIdRef.current : undefined;
      const extraBody = body && typeof body === "object" ? body : {};
      const bodyRecord = extraBody as Record<string, unknown>;
      const explicitParams =
        bodyRecord.params && typeof bodyRecord.params === "object" && !Array.isArray(bodyRecord.params)
          ? (bodyRecord.params as Record<string, unknown>)
          : undefined;
      if (explicitParams) Object.assign(mergedParams, explicitParams);
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
      const normalizedChatModelSource =
        (explicitChatModelSource ?? refChatModelSource)?.trim() || undefined;
      const {
        chatModelId: _ignored,
        chatModelSource: _ignoredSource,
        params: _ignoredParams,
        id: _ignoredId,
        messages: _ignoredMessages,
        ...restBody
      } = bodyRecord;
      // 中文注释：除 id/messages 外的自定义字段统一收敛到 params，方便 SSE 端兼容处理。
      const requestParams = buildRequestParams({
        baseParams: mergedParams,
        extraBody: restBody,
        chatModelId: normalizedChatModelId,
        chatModelSource: normalizedChatModelSource,
        sessionId: id,
        clientId: clientId || undefined,
        tabId,
        trigger,
        messageId,
      });

      if (messages.length === 0) {
        return {
          body: {
            params: requestParams,
            id,
            messages: [],
          },
          headers,
        };
      }

      const rawLastMessage = messages[messages.length - 1] as UIMessage & { parts?: any[] };
      const lastMessage = stripTotalUsageFromMetadata(rawLastMessage as any);

      return {
        body: {
          params: requestParams,
          id,
          // 后端会从 DB 补全完整历史链路；前端只需发送最后一条消息即可。
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
