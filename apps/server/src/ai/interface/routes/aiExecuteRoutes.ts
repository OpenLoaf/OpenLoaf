import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { ChatModelSource } from "@tenas-ai/api/common";
import type { AiExecuteRequest, AiIntent, AiResponseMode } from "@/ai/application/dto/aiTypes";
import { AiModule } from "@/ai/composition/AiModule";
import { logger } from "@/common/logger";
import { toText } from "@/routers/route-utils";

const controller = new AiModule().createAiExecuteController();

/** Register unified AI execute route. */
export function registerAiExecuteRoutes(app: Hono) {
  app.post("/ai/execute", async (c) => {
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
      "[ai] /ai/execute request",
    );

    const cookies = getCookie(c) || {};
    return controller.execute({
      request: parsed.request,
      cookies,
      requestSignal: c.req.raw.signal,
    });
  });
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
      chatModelId: toText(raw.chatModelId) || undefined,
      chatModelSource: normalizeChatModelSource(raw.chatModelSource),
      workspaceId: toText(raw.workspaceId) || undefined,
      projectId: toText(raw.projectId) || undefined,
      boardId: toText(raw.boardId) || undefined,
      imageSaveDir: toText(raw.imageSaveDir) || undefined,
      intent: intent ?? "chat",
      responseMode: responseMode ?? "stream",
      toolApprovalPayloads,
    },
  };
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

/** Normalize chat model source input. */
function normalizeChatModelSource(value: unknown): ChatModelSource | undefined {
  return value === "cloud" ? "cloud" : value === "local" ? "local" : undefined;
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
