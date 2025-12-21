import {
  createAgentUIStream,
  createUIMessageStream,
  generateId,
  JsonToSseTransformStream,
  UI_MESSAGE_STREAM_HEADERS,
  type UIMessage,
} from "ai";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { ChatRequestBody, TokenUsage } from "@teatime-ai/api/types/message";
import { MasterAgent } from "@/ai/agents/MasterAgent";
import { streamStore } from "@/modules/chat/StreamStoreAdapter";
import { chatContextStore } from "@/modules/chat/ChatContextAdapter";
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

/** Merge UIMessage.metadata with abort info for persistence (best-effort). */
function mergeMetadataWithAbortInfo(
  metadata: unknown,
  input: { isAborted: boolean; finishReason?: string },
): Record<string, unknown> | undefined {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

  const base = isRecord(metadata) ? { ...metadata } : {};
  if (!input.isAborted) return Object.keys(base).length ? base : undefined;

  // 中文注释：aborted 的流也需要落库；把“被中止”的状态写进 metadata，方便 UI/统计侧识别。
  const existingTeatime = isRecord(base.teatime) ? base.teatime : {};
  base.teatime = {
    ...existingTeatime,
    isAborted: true,
    abortedAt: new Date().toISOString(),
    ...(input.finishReason ? { finishReason: input.finishReason } : {}),
  };

  return base;
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
    await streamStore.start(sessionId, abortController);

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

    const popAgentFrameOnce = (() => {
      let popped = false;
      return () => {
        if (popped) return;
        popped = true;
        popAgentFrame();
      };
    })();

    const stream = createUIMessageStream({
      originalMessages: messages as any[],
      onError: (err) => {
        // 中文注释：只在最外层记录一次流错误，避免 SDK 内部 error chunk 触发重复日志。
        logger.error({ err }, "[chat] ui stream error");
        return err instanceof Error ? err.message : "Unknown error";
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
            onFinish: async ({ isAborted, responseMessage, finishReason }) => {
              // 中文注释：主 agent 的输出只在这里触发一次 finish（避免双重 state machine）。
              try {
                if (!responseMessage || responseMessage.role !== "assistant") return;

                const currentSessionId = getSessionId() ?? sessionId;
                await chatRepository.saveMessageNode({
                  sessionId: currentSessionId,
                  message: {
                    ...(responseMessage as any),
                    id: assistantMessageId,
                    metadata: mergeMetadataWithAbortInfo((responseMessage as any).metadata, {
                      isAborted,
                      finishReason,
                    }),
                  } as any,
                  parentMessageId: userNode.id,
                  allowEmpty: isAborted,
                });
              } catch (err) {
                logger.error({ err }, "[chat] save assistant failed");
              } finally {
                popAgentFrameOnce();
              }
            },
          });
          writer.merge(uiStream as any);
        } catch (err) {
          popAgentFrameOnce();
          throw err;
        }
      },
    });

    // 中文注释：将 UIMessageChunk 流转成 SSE 字符串并写入内存流，避免 tee() 导致的断线竞态。
    const sseStream = stream.pipeThrough(new JsonToSseTransformStream());
    const reader = sseStream.getReader();
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            await streamStore.finalize(sessionId);
            // 中文注释：会话结束后主动清理 chat context（例如 tab 快照），避免缓存长期占用内存。
            void chatContextStore.clearSession({ sessionId }).catch((err) => {
              logger.error({ err }, "[chat] clear session context failed");
            });
            return;
          }
          if (typeof value === "string") await streamStore.append(sessionId, value);
        }
      } catch (err) {
        logger.error({ err }, "[chat] pump sse stream failed");
        await streamStore.finalize(sessionId);
        // 中文注释：异常结束也需要清理，避免遗留缓存。
        void chatContextStore.clearSession({ sessionId }).catch((clearErr) => {
          logger.error({ err: clearErr }, "[chat] clear session context failed");
        });
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // ignore
        }
      }
    })();

    const subscription = await streamStore.subscribe(sessionId);
    if (!subscription) return new Response(null, { status: 204 });
    return new Response(subscription as any, { headers: UI_MESSAGE_STREAM_HEADERS });
  });

  app.get("/chat/sse/:id/stream", async (c) => {
    const streamId = c.req.param("id");
    const stream = await streamStore.subscribe(streamId);
    if (!stream) return new Response(null, { status: 204 });
    return new Response(stream as any, { headers: UI_MESSAGE_STREAM_HEADERS });
  });

  app.post("/chat/sse/:id/stop", async (c) => {
    const streamId = c.req.param("id");
    const ok = await streamStore.stop(streamId);
    if (ok) {
      // 中文注释：主动停止也视为会话结束，立即清理缓存。
      void chatContextStore.clearSession({ sessionId: streamId }).catch((err) => {
        logger.error({ err }, "[chat] clear session context failed");
      });
    }
    return c.json({ ok });
  });
}
