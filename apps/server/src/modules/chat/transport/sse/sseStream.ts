import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import type { Hono } from "hono";
import { streamStore } from "@/modules/chat/infrastructure/memory/streamStoreMemory";

/**
 * GET `/chat/sse/:id/stream`（MVP）：
 * - 续传某个 streamId 的输出（内存态 best-effort）
 */
export function registerChatSseStreamRoute(app: Hono) {
  app.get("/chat/sse/:id/stream", async (c) => {
    const streamId = c.req.param("id");
    const stream = streamStore.subscribe(streamId);
    if (!stream) return new Response(null, { status: 204 });
    return new Response(stream as any, { headers: UI_MESSAGE_STREAM_HEADERS });
  });
}

