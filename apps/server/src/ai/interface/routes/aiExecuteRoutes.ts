/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { Context, Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { ClientPlatform } from "@openloaf/api/types/platform";
import type { AiExecuteRequest, AiIntent, AiResponseMode } from "@/ai/services/chat/types";
import type { ChatPageContext } from "@openloaf/api/types/message";
import { bootstrapAi } from "@/ai/bootstrap";
import { logger } from "@/common/logger";
import { toText } from "@/routers/route-utils";

const { aiExecuteController: controller } = bootstrapAi();

/** Register unified AI execute route. */
export function registerAiExecuteRoutes(app: Hono) {
  const handleExecute = async (c: Context) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = parseAiExecuteRequest(body);
    if (!parsed.request) {
      return c.json({ error: parsed.error ?? "Invalid request" }, 400);
    }

    logger.debug(
      {
        request: parsed.request,
      },
      "[ai] execute request",
    );

    const cookies = getCookie(c) || {};
    return controller.execute({
      request: parsed.request,
      cookies,
      requestSignal: c.req.raw.signal,
    });
  };

  // 中文注释：统一使用 /ai/chat 作为 AI 入口。
  app.post("/ai/chat", handleExecute);
}

/** Parse request payload into typed input. */
function parseAiExecuteRequest(body: unknown): { request?: AiExecuteRequest; error?: string } {
  if (!body || typeof body !== "object") return { error: "Invalid request body" };
  const raw = body as Record<string, unknown>;

  const sessionId = toText(raw.sessionId);
  if (!sessionId) return { error: "sessionId is required" };

  const messages = Array.isArray(raw.messages) ? (raw.messages as AiExecuteRequest["messages"]) : [];
  if (!Array.isArray(raw.messages)) return { error: "messages is required" };

  const intent = normalizeIntent(raw.intent);
  if (raw.intent && !intent) return { error: "intent is invalid" };

  const responseMode = normalizeResponseMode(raw.responseMode);
  if (raw.responseMode && !responseMode) return { error: "responseMode is invalid" };

  const toolApprovalPayloads = normalizeToolApprovalPayloads(raw.toolApprovalPayloads);
  const timezone = resolveTimezone(raw.timezone);

  const chatModelSource = raw.chatModelSource === "local" || raw.chatModelSource === "cloud"
    ? raw.chatModelSource
    : undefined;

  // temperature: 仅 dev 模式下允许客户端覆盖（chat-probe 等自动化测试零温度保证可重复）。
  // 生产构建静默丢弃，避免外部客户端调用 /ai/chat 时影响线上模型行为。
  const temperature =
    process.env.NODE_ENV !== "production" &&
    typeof raw.temperature === "number" &&
    Number.isFinite(raw.temperature) &&
    raw.temperature >= 0 &&
    raw.temperature <= 2
      ? raw.temperature
      : undefined;

  return {
    request: {
      sessionId,
      messages,
      id: toText(raw.id) || undefined,
      messageId: toText(raw.messageId) || undefined,
      clientId: toText(raw.clientId) || undefined,
      timezone,
      tabId: toText(raw.tabId) || undefined,
      params: normalizeParams(raw.params),
      trigger: toText(raw.trigger) || undefined,
      retry: typeof raw.retry === "boolean" ? raw.retry : undefined,
      projectId: toText(raw.projectId) || undefined,
      boardId: toText(raw.boardId) || undefined,
      imageSaveDir: toText(raw.imageSaveDir) || undefined,
      intent: intent ?? "chat",
      responseMode: responseMode ?? "stream",
      toolApprovalPayloads,
      chatModelId: toText(raw.chatModelId) || undefined,
      chatModelSource,
      clientPlatform: normalizeClientPlatform(raw.clientPlatform),
      webVersion: toText(raw.webVersion) || undefined,
      serverVersion: toText(raw.serverVersion) || undefined,
      desktopVersion: toText(raw.desktopVersion) || undefined,
      messageIdChain: normalizeMessageIdChain(raw.messageIdChain),
      autoApproveTools: raw.autoApproveTools === true ? true : undefined,
      pageContext: normalizePageContext(raw.pageContext),
      temperature,
    },
  };
}

/** Normalize pageContext input (drops unknown fields, keeps type-safe shape). */
function normalizePageContext(value: unknown): ChatPageContext | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  const scope: ChatPageContext["scope"] | undefined =
    obj.scope === "project" ? "project" : obj.scope === "global" ? "global" : undefined;
  const page = typeof obj.page === "string" && obj.page.trim() ? obj.page : undefined;
  if (!scope || !page) return undefined;
  const pageTitle = typeof obj.pageTitle === "string" && obj.pageTitle ? obj.pageTitle : undefined;
  const projectId = typeof obj.projectId === "string" && obj.projectId ? obj.projectId : undefined;
  const boardId = typeof obj.boardId === "string" && obj.boardId ? obj.boardId : undefined;
  const stack = Array.isArray(obj.stack)
    ? obj.stack
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const it = item as Record<string, unknown>;
          const component = typeof it.component === "string" ? it.component : "";
          if (!component) return null;
          const title = typeof it.title === "string" ? it.title : undefined;
          const params =
            it.params && typeof it.params === "object" && !Array.isArray(it.params)
              ? (it.params as Record<string, unknown>)
              : undefined;
          return { component, ...(title ? { title } : {}), ...(params ? { params } : {}) };
        })
        .filter((v): v is { component: string; title?: string; params?: Record<string, unknown> } => v !== null)
    : undefined;
  return {
    scope,
    page,
    ...(pageTitle ? { pageTitle } : {}),
    ...(projectId ? { projectId } : {}),
    ...(boardId ? { boardId } : {}),
    ...(stack && stack.length > 0 ? { stack } : {}),
  };
}

/** Validate and normalize clientPlatform input. */
function normalizeClientPlatform(value: unknown): ClientPlatform | undefined {
  return value === "desktop" || value === "web" || value === "cli" ? value : undefined;
}

/** Normalize params input. */
function normalizeParams(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Normalize tool approval payloads input. */
function normalizeToolApprovalPayloads(
  value: unknown,
): Record<string, Record<string, unknown>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return undefined;
  const normalized: Record<string, Record<string, unknown>> = {};
  for (const [toolCallId, payload] of entries) {
    if (!isSafeKey(toolCallId)) continue;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    const payloadEntries = Object.entries(payload as Record<string, unknown>);
    if (payloadEntries.length === 0) {
      normalized[toolCallId] = {};
      continue;
    }
    const normalizedPayload: Record<string, unknown> = {};
    for (const [key, val] of payloadEntries) {
      if (!isSafeKey(key)) continue;
      normalizedPayload[key] = val;
    }
    normalized[toolCallId] = normalizedPayload;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/** Check whether a key is safe for object assignment. */
function isSafeKey(value: string): boolean {
  return value !== "__proto__" && value !== "prototype" && value !== "constructor";
}

/** Normalize messageIdChain (board chat). */
function normalizeMessageIdChain(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return ids.length > 0 ? ids : undefined;
}

function normalizeIntent(value: unknown): AiIntent | undefined {
  return value === "chat" || value === "image" || value === "command" || value === "utility"
    ? value
    : undefined;
}

function normalizeResponseMode(value: unknown): AiResponseMode | undefined {
  return value === "stream" || value === "json" ? value : undefined;
}

/** Resolve timezone from request payload or server default. */
function resolveTimezone(value: unknown): string {
  const trimmed = toText(value);
  if (trimmed) return trimmed;
  return resolveServerTimezone();
}

/** Resolve server timezone (IANA) with fallback. */
function resolveServerTimezone(): string {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (resolved) return resolved;
  // 逻辑：Intl 缺失时回退到进程 TZ，再不行回退 UTC。
  return process.env.TZ ?? "UTC";
}
