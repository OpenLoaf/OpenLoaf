import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { ChatModelSource } from "@tenas-ai/api/common";
import type { ChatStreamRequest } from "@/ai/chat-stream/chatStreamTypes";
import { runChatStream } from "@/ai/chat-stream/chatStreamService";
import { logger } from "@/common/logger";
import { toText } from "./route-utils";

/** Register chat stream routes. */
export function registerChatStreamRoutes(app: Hono) {
  app.post("/chat/sse", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = parseChatStreamRequest(body);
    if (!parsed.request) {
      return c.json({ error: parsed.error ?? "Invalid request" }, 400);
    }

    // 记录 /chat/sse 请求参数，便于排查。
    logger.debug(
      {
        request: parsed.request,
      },
      "[chat] /chat/sse request",
    );

    const cookies = getCookie(c) || {};
    return runChatStream({
      request: parsed.request,
      cookies,
      requestSignal: c.req.raw.signal,
    });
  });
}

/** Parse request payload into typed input. */
function parseChatStreamRequest(body: unknown): { request?: ChatStreamRequest; error?: string } {
  if (!body || typeof body !== "object") return { error: "Invalid request body" };
  const raw = body as Record<string, unknown>;

  const sessionId = toText(raw.sessionId);
  if (!sessionId) return { error: "sessionId is required" };

  const messages = Array.isArray(raw.messages) ? (raw.messages as ChatStreamRequest["messages"]) : [];
  if (!Array.isArray(raw.messages)) return { error: "messages is required" };

  return {
    request: {
      sessionId,
      messages,
      id: toText(raw.id) || undefined,
      messageId: toText(raw.messageId) || undefined,
      clientId: toText(raw.clientId) || undefined,
      tabId: toText(raw.tabId) || undefined,
      params: normalizeParams(raw.params),
      trigger: toText(raw.trigger) || undefined,
      retry: typeof raw.retry === "boolean" ? raw.retry : undefined,
      chatModelId: toText(raw.chatModelId) || undefined,
      chatModelSource: normalizeChatModelSource(raw.chatModelSource),
      workspaceId: toText(raw.workspaceId) || undefined,
      projectId: toText(raw.projectId) || undefined,
      boardId: toText(raw.boardId) || undefined,
    },
  };
}

/** Normalize params input. */
function normalizeParams(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Normalize chat model source input. */
function normalizeChatModelSource(value: unknown): ChatModelSource | undefined {
  return value === "cloud" ? "cloud" : value === "local" ? "local" : undefined;
}
