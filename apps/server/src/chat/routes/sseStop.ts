import type { Hono } from "hono";
import { stopActiveStream } from "@/chat/sse/streams";

/**
 * POST `/chat/sse/:id/stop`
 * 用户手动停止某个会话的生成：
 * - 终止 agent（触发 abort chunk -> onFinish.isAborted = true）
 * - 结束内存流，避免 resume 继续回放
 */
export function registerChatSseStopRoute(app: Hono) {
  app.post("/chat/sse/:id/stop", async (c) => {
    const chatId = c.req.param("id");
    const ok = stopActiveStream(chatId);
    console.log("[sse] stop", { chatId, ok });
    if (ok) return c.json({ ok: true });
    return c.body(null, 204);
  });
}
