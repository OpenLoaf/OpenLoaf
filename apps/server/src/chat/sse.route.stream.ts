import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import type { Hono } from "hono";
import { removeSseClient, tryAddSseClient } from "./sse.clients";
import { resumeExistingStream } from "./sse.streams";

/**
 * GET `/chat/sse/:id/stream`
 * 跟随/续传某个 streamId 的生成输出（从内存中回放 + 订阅后续 chunk）。
 */
export function registerChatSseStreamRoute(app: Hono) {
  app.get("/chat/sse/:id/stream", async (c) => {
    const chatId = c.req.param("id");
    const clientId = c.req.query("clientId") ?? "";

    // 对同一个 chatId + clientId 做去重，避免重复消费同一份流
    if (!tryAddSseClient(chatId, clientId)) {
      return new Response(null, { status: 204 });
    }

    const stream = resumeExistingStream(chatId);

    if (!stream) {
      // 没有活跃流：返回 204
      removeSseClient(chatId, clientId);
      return new Response(null, { status: 204 });
    }

    if (clientId) {
      const release = () => {
        removeSseClient(chatId, clientId);
      };

      c.req.raw.signal.addEventListener("abort", release, { once: true });

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
            release();
            try {
              reader.releaseLock();
            } catch {
              // ignore
            }
          }
        },
        cancel: async () => {
          release();
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

    return new Response(stream as any, {
      headers: UI_MESSAGE_STREAM_HEADERS,
    });
  });
}

