import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { logger } from "@/common/logger";
import { chatImageRequestSchema } from "@/ai/chat-stream/chatImageTypes";
import { runChatImageRequest } from "@/ai/chat-stream/chatStreamService";

/** Register chat image routes. */
export function registerChatImageRoutes(app: Hono) {
  app.post("/ai/image", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = chatImageRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request" }, 400);
    }

    logger.debug(
      {
        request: parsed.data,
      },
      "[chat] /ai/image request",
    );

    const cookies = getCookie(c) || {};
    const result = await runChatImageRequest({
      request: parsed.data,
      cookies,
      requestSignal: c.req.raw.signal,
    });

    if (!result.ok) {
      return c.json({ error: result.error }, result.status as any);
    }

    return c.json(result.response);
  });
}
