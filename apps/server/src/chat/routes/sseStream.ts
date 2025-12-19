import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import type { Hono } from "hono";
import { removeSseClient, tryAddSseClient } from "@/chat/sse/clients";
import { resumeExistingStream } from "@/chat/sse/streams";

/**
 * GET `/chat/sse/:id/stream`
 * 跟随/续传某个 streamId 的生成输出（从内存中回放 + 订阅后续 chunk）。
 */
export function registerChatSseStreamRoute(app: Hono) {
  app.get("/chat/sse/:id/stream", async (c) => {
    const chatId = c.req.param("id");
    const clientId = c.req.query("clientId") ?? "";

    if (!tryAddSseClient(chatId, clientId)) {
      console.log("[sse] stream: duplicate follower", { chatId, clientId });
      return new Response(null, { status: 204 });
    }

    const stream = resumeExistingStream(chatId);
    if (!stream) {
      removeSseClient(chatId, clientId);
      console.log("[sse] stream: no active stream", { chatId, clientId });
      return new Response(null, { status: 204 });
    }

    if (clientId) {
      console.log("[sse] stream: follower connected", { chatId, clientId });

      let released = false;
      const release = (reason: "abort" | "done" | "cancel") => {
        if (released) return;
        released = true;
        removeSseClient(chatId, clientId);
        console.log("[sse] stream: follower disconnected", { chatId, clientId, reason });
      };

      c.req.raw.signal.addEventListener("abort", () => release("abort"), {
        once: true,
      });

      const streamWithRelease = new ReadableStream<string>({
        start: async (controller) => {
          const reader = stream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          } finally {
            release("done");
            try {
              reader.releaseLock();
            } catch {
              // ignore
            }
          }
        },
        cancel: async () => {
          release("cancel");
          try {
            await stream.cancel();
          } catch {
            // ignore
          }
        },
      });

      return new Response(streamWithRelease as any, {
        headers: UI_MESSAGE_STREAM_HEADERS,
      });
    }

    console.log("[sse] stream: anonymous follower connected", { chatId });
    return new Response(stream as any, { headers: UI_MESSAGE_STREAM_HEADERS });
  });
}
