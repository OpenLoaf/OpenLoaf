/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
"use client";

import { DefaultChatTransport } from "ai";
import type { UIMessage } from "@ai-sdk/react";
import type { RefObject } from "react";
import type { ChatRequestBody } from "@openloaf/api/types/message";
import { getWebClientId } from "@/lib/chat/streamClientId";
import { resolveServerUrl } from "@/utils/server-url";
import { isElectronEnv } from "@/utils/is-electron-env";
import { getClientTimeZone } from "@/utils/time-zone";
import { getDesktopVersion, getWebVersion, getServerVersion } from "@/lib/app-version";
import { CLIENT_HEADERS } from "@/lib/client-headers";
import { snapshotPageContext } from "@/lib/ai/transport-stack";

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
  sessionIdRef,
}: {
  paramsRef: RefObject<Record<string, unknown> | undefined>;
  tabIdRef: RefObject<string | null | undefined>;
  sessionIdRef?: RefObject<string | undefined>;
}) {
  // 中文注释：新版聊天统一走 /ai/chat。
  const apiBase = `${resolveServerUrl()}/ai/chat`;

  return new DefaultChatTransport({
    api: apiBase,
    credentials: "include",
    async prepareSendMessagesRequest({ id, messages, body, messageId, headers }) {
      // 逻辑：Server 自持 token，Web 不再注入 Authorization header。
      const nextHeaders = { ...CLIENT_HEADERS, ...(headers ?? {}) };
      const baseParams = { ...(paramsRef.current ?? {}) };
      const clientId = getWebClientId();
      const [webVersion, desktopVersion, serverVersion] = await Promise.all([
        getWebVersion(),
        isElectronEnv() ? getDesktopVersion() : Promise.resolve(undefined),
        isElectronEnv() ? getServerVersion() : Promise.resolve(undefined),
      ]);
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
      // 中文注释：自定义字段直接合并到顶层，不再使用 params。
      const basePayload = snapshotPageContext({ ...baseParams, ...restBody });
      // 关键：优先使用 sessionIdRef（来自 ChatCoreProvider 的最新 sessionId），
      // 避免 AI SDK Chat 实例的 id 在 session 切换时因 React 渲染时序未及时更新而发送旧 sessionId。
      const resolvedSessionId = sessionIdRef?.current ?? id;
      const payloadBase: ChatRequestBody = {
        ...basePayload,
        sessionId: resolvedSessionId,
        clientId: clientId || undefined,
        timezone,
        tabId,
        messageId,
        intent: "chat",
        responseMode: "stream",
        clientPlatform: isElectronEnv() ? 'desktop' : 'web',
        webVersion,
        desktopVersion,
        serverVersion,
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

      const rawLastMessage = messages[messages.length - 1] as UIMessage & { parts?: any[]; body?: any };
      const lastMessage = stripTotalUsageFromMetadata(rawLastMessage as any);
      const messagesPayload = [lastMessage] as ChatRequestBody["messages"];

      // 逻辑：从 message.body 中提取 chatModelId 和 chatModelSource（CLI 直连模式需要）。
      // 必须同时覆盖 source — 只覆盖 chatModelId 会让 CLI 模型被 picker 的 cloud source 错误解析。
      const messageLevelBody = rawLastMessage.body && typeof rawLastMessage.body === 'object'
        ? rawLastMessage.body
        : {};
      const chatModelId = typeof messageLevelBody.chatModelId === 'string'
        ? messageLevelBody.chatModelId
        : undefined;
      const chatModelSource = typeof messageLevelBody.chatModelSource === 'string'
        ? messageLevelBody.chatModelSource
        : undefined;

      return {
        body: {
          // 后端会从 DB 补全完整历史链路；前端只需发送最后一条消息即可。
          ...payloadBase,
          messages: messagesPayload,
          // 将 chatModelId / chatModelSource 提升到请求顶层
          ...(chatModelId ? { chatModelId } : {}),
          ...(chatModelSource ? { chatModelSource } : {}),
        },
        headers: nextHeaders,
      };
    },
  });
}
