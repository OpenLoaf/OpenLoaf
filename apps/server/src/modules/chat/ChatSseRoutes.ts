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
import type { ChatRequestBody } from "@teatime-ai/api/types/message";
import { MasterAgent } from "@/ai/agents/MasterAgent";
import { streamStore } from "@/modules/chat/StreamStoreAdapter";
import {
  popAgentFrame,
  pushAgentFrame,
  setAbortSignal,
  setRequestContext,
  setUiWriter,
} from "@/shared/requestContext";

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
      appId: body.appId || undefined,
      tabId: body.tabId || undefined,
    });

    const abortController = new AbortController();
    streamStore.start(sessionId, abortController);

    const master = new MasterAgent();
    const agent = master.createAgent();
    const messages = (body.messages ?? []) as UIMessage[];

    const stream = createUIMessageStream({
      originalMessages: messages as any[],
      onError: (err) => {
        console.error("[chat] ui stream error", err);
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
            generateMessageId: generateId,
            onFinish: () => {
              popAgentFrame();
            },
            onError: () => "Agent error.",
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
          console.error("[chat] consumeSseStream failed", err);
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
