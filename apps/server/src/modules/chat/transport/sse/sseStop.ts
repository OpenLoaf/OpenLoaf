import type { Hono } from "hono";
import { streamStore } from "@/modules/chat/infrastructure/memory/streamStoreMemory";

/**
 * POST `/chat/sse/:id/stop`（MVP）：
 * - 中断生成并终止续传
 */
export function registerChatSseStopRoute(app: Hono) {
  app.post("/chat/sse/:id/stop", async (c) => {
    const streamId = c.req.param("id");
    const ok = streamStore.stop(streamId);
    return c.json({ ok });
  });
}

