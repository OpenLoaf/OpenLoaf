import {
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  UI_MESSAGE_STREAM_HEADERS,
  type UIMessage,
} from "ai";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { ChatRequestBody, TokenUsage } from "@teatime-ai/api/types/message";
import { MasterAgent } from "@/ai/agents/MasterAgent";
import { streamStore } from "@/modules/chat/StreamStoreAdapter";
import { chatRepository } from "@/modules/chat/ChatRepositoryAdapter";
import {
  popAgentFrame,
  pushAgentFrame,
  getSessionId,
  setAbortSignal,
  setRequestContext,
  setUiWriter,
} from "@/common/requestContext";
import { logger } from "@/common/logger";

/** Map agent stream finish usage into UIMessage.metadata (for DB persistence + stats). */
function toTokenUsageMetadata(part: unknown): { totalUsage: TokenUsage } | undefined {
  if (!part || typeof part !== "object") return;
  const totalUsage = (part as any).totalUsage;
  // 中文注释：AI SDK 的 totalUsage 只在 finish part 出现；这里做 best-effort 适配并确保可序列化。
  if (!totalUsage || typeof totalUsage !== "object") return;

  const toNumberOrUndefined = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

  const usage: TokenUsage = {
    inputTokens: toNumberOrUndefined((totalUsage as any).inputTokens),
    outputTokens: toNumberOrUndefined((totalUsage as any).outputTokens),
    totalTokens: toNumberOrUndefined((totalUsage as any).totalTokens),
    reasoningTokens: toNumberOrUndefined((totalUsage as any).reasoningTokens),
    cachedInputTokens: toNumberOrUndefined((totalUsage as any).cachedInputTokens),
  };

  if (Object.values(usage).every((v) => v === undefined)) return;
  return { totalUsage: usage };
}

/**
 * Chat SSE 路由（MVP）：
 * - POST /chat/sse：创建并开始生成
 * - GET  /chat/sse/:id/stream：断线续传
 * - POST /chat/sse/:id/stop：停止生成
 */
export function registerChatSseRoutes(app: Hono) {
  app.post("/chat/sse", async (c) => {
    let body: ChatRequestBody;
    try {
      body = (await c.req.json()) as ChatRequestBody;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const sessionId = body.sessionId ?? body.id;
    if (!sessionId) return c.json({ error: "sessionId is required" }, 400);

    const cookies = getCookie(c) || {};

    setRequestContext({
      sessionId,
      cookies,
      clientId: body.clientId || undefined,
      tabId: body.tabId || undefined,
    });

    const abortController = new AbortController();
    streamStore.start(sessionId, abortController);

    const master = new MasterAgent();
    const agent = master.createAgent();
    const messages = (body.messages ?? []) as UIMessage[];

    // 中文注释：MVP 只保存“最后一条 user 消息”与最终 assistant 响应。
    const last = messages.at(-1) as any;
    if (!last || last.role !== "user" || !last.id) {
      return c.json({ error: "last message must be a user message with id" }, 400);
    }
    const explicitParent =
      typeof last.parentMessageId === "string" || last.parentMessageId === null
        ? (last.parentMessageId as string | null)
        : undefined;
    const parentMessageIdToUse =
      explicitParent === undefined
        ? await chatRepository.resolveSessionRightmostLeafId(sessionId)
        : explicitParent;

    const userNode = await chatRepository.saveMessageNode({
      sessionId,
      message: last as any,
      parentMessageId: parentMessageIdToUse ?? null,
    });

    // 中文注释：固定 assistantMessageId，确保 stream 与落库是同一条消息。
    const assistantMessageId = generateId();

    const stream = createUIMessageStream({
      originalMessages: messages as any[],
      onError: (err) => {
        logger.error({ err }, "[chat] ui stream error");
        return err instanceof Error ? err.message : "Unknown error";
      },
      onFinish: async ({ isAborted, responseMessage }) => {
        if (isAborted) return;
        if (!responseMessage || responseMessage.role !== "assistant") return;

        const currentSessionId = getSessionId() ?? sessionId;
        try {
          await chatRepository.saveMessageNode({
            sessionId: currentSessionId,
            message: { ...(responseMessage as any), id: assistantMessageId } as any,
            parentMessageId: userNode.id,
          });
        } catch (err) {
          logger.error({ err }, "[chat] save assistant failed");
        }
      },
      execute: async ({ writer }) => {
        setUiWriter(writer as any);
        setAbortSignal(abortController.signal);
        pushAgentFrame(master.createFrame());

        try {
          const uiStream = await createAgentUIStream({
            agent,
            messages: messages as any[],
            abortSignal: abortController.signal,
            generateMessageId: () => assistantMessageId,
            messageMetadata: ({ part }) => toTokenUsageMetadata(part),
            onFinish: () => {
              popAgentFrame();
            },
            onError: (err) => "Agent error." + (err instanceof Error ? err.message : ""),
          });
          writer.merge(uiStream as any);
        } catch (err) {
          popAgentFrame();
          throw err;
        }
      },
    });

    return createUIMessageStreamResponse({
      stream,
      consumeSseStream: ({ stream }) => {
        const reader = stream.getReader();
        (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                streamStore.finalize(sessionId);
                return;
              }
              if (typeof value === "string") streamStore.append(sessionId, value);
            }
          } finally {
            try {
              reader.releaseLock();
            } catch {
              // ignore
            }
          }
        })().catch((err) => {
          logger.error({ err }, "[chat] consumeSseStream failed");
          streamStore.finalize(sessionId);
        });
      },
    });
  });

  app.get("/chat/sse/:id/stream", async (c) => {
    const streamId = c.req.param("id");
    const stream = streamStore.subscribe(streamId);
    if (!stream) return new Response(null, { status: 204 });
    return new Response(stream as any, { headers: UI_MESSAGE_STREAM_HEADERS });
  });

  app.post("/chat/sse/:id/stop", async (c) => {
    const streamId = c.req.param("id");
    const ok = streamStore.stop(streamId);
    return c.json({ ok });
  });
}
