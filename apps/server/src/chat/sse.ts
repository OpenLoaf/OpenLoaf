import { createAgentUIStreamResponse, UI_MESSAGE_STREAM_HEADERS } from "ai";
import type { UIMessage } from "ai";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import EventEmitter2 from "eventemitter2";
import { saveAndAppendMessage } from "./history";
import { requestContextManager } from "../context/requestContext";
import type { ChatRequestBody, TokenUsageMessage } from "./types";
import { createAgent, createRequestTools } from "./tools-config";

// Use EventEmitter2 for more robust pub/sub pattern
const eventEmitter = new EventEmitter2({
  wildcard: false,
  maxListeners: 1000, // Increase max listeners to handle many clients
});

type ActiveSseStream = {
  chunks: string[];
  done: boolean;
  cleanupTimer?: ReturnType<typeof setTimeout>;
};

// streamId -> active stream data (in-memory)
const ACTIVE_SSE_STREAMS = new Map<string, ActiveSseStream>();
// streamId -> currently-following clientIds (in-memory, best-effort)
const ACTIVE_SSE_STREAM_CLIENTS = new Map<string, Set<string>>();
const STREAM_TTL_MS = 60_000;

function finalizeActiveStream(streamId: string) {
  const entry = ACTIVE_SSE_STREAMS.get(streamId);
  if (!entry || entry.done) return;

  entry.done = true;

  // Emit done event to all subscribers
  eventEmitter.emit(`${streamId}:done`);

  // Cleanup event listeners for this stream
  eventEmitter.removeAllListeners(`${streamId}:chunk`);
  eventEmitter.removeAllListeners(`${streamId}:done`);

  if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
  entry.cleanupTimer = setTimeout(() => {
    ACTIVE_SSE_STREAMS.delete(streamId);
    ACTIVE_SSE_STREAM_CLIENTS.delete(streamId);
  }, STREAM_TTL_MS);
}

function resumeExistingStream(streamId: string): ReadableStream<string> | null {
  const entry = ACTIVE_SSE_STREAMS.get(streamId);
  if (!entry || entry.done) return null;

  return new ReadableStream<string>({
    start: (controller) => {
      // Replay existing chunks
      (async () => {
        for (const chunk of entry.chunks) {
          try {
            controller.enqueue(chunk);
          } catch (error) {
            console.error("Error replaying chunk:", error);
            controller.close();
            return;
          }
          // Allow the stream to process the chunk
          await new Promise((resolve) => setImmediate(resolve));
        }
      })();

      // Subscribe to new chunks
      const chunkHandler = (chunk: string) => {
        try {
          controller.enqueue(chunk);
        } catch (error) {
          console.error("Error sending chunk to subscriber:", error);
          controller.close();
        }
      };

      const doneHandler = () => {
        controller.close();
      };

      eventEmitter.on(`${streamId}:chunk`, chunkHandler);
      eventEmitter.once(`${streamId}:done`, doneHandler);

      // Save cleanup function
      controller.desiredSize;
    },
    cancel: () => {
      // No need to manually remove subscribers - EventEmitter2 handles this
    },
  });
}

/**
 * AI SDK v6：流式对话接口（SSE/数据流协议由 createAgentUIStreamResponse 负责）。
 *
 * 流程（MVP）：
 * 1) 根据 sessionId 从 DB 读取历史
 * 2) 把刚收到的新消息先写入 DB
 * 3) 将“完整历史（含新消息）”喂给 agent，进行流式生成
 */
export const registerChatSse = (app: Hono) => {
  // POST endpoint to create new streams
  app.post("/chat/sse", async (c) => {
    let body: ChatRequestBody;
    try {
      body = (await c.req.json()) as ChatRequestBody;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const sessionId = body.sessionId ?? body.id;
    if (!sessionId) {
      return c.json({ error: "sessionId is required" }, 400);
    }

    // 从请求中获取所有cookie
    const cookies = getCookie(c);

    const incomingMessages = body.messages;
    if (incomingMessages !== undefined && !Array.isArray(incomingMessages)) {
      return c.json({ error: "messages must be an array" }, 400);
    }

    // MVP：客户端会带 messages，但这里只取最后一条当作“新消息”进行保存与追加。
    const lastIncomingMessage = Array.isArray(incomingMessages)
      ? incomingMessages[incomingMessages.length - 1]
      : undefined;

    // Extract activeTab from metadata
    const activeTab = (lastIncomingMessage as any)?.metadata?.activeTab;
    console.log("==activeTab==", activeTab);
    // 初始化请求上下文
    requestContextManager.createContext({
      sessionId,
      cookies: cookies || {},
      activeTab,
    });

    const messages = await saveAndAppendMessage({
      sessionId,
      incomingMessage: lastIncomingMessage,
    });

    const agent = createAgent();

    return createAgentUIStreamResponse({
      agent,
      onError: (error) => {
        console.error("Agent error:", error);
        return "An error occurred.";
      },
      // 将 DB 还原出来的完整历史传给 agent
      messages: messages as any[],
      messageMetadata: ({ part }) => {
        // 当生成完成时发送完整的 token 使用信息
        if (part.type === "finish") {
          return {
            totalUsage: part.totalUsage,
          };
        }
      },
      // 流式结束后：记录 token 使用情况，并把 AI 返回的最终消息落库（含 usage）。
      onFinish: async ({ isAborted, messages, responseMessage }) => {
        if (isAborted) {
          return;
        }

        const lastMessage = messages[messages.length - 1] as TokenUsageMessage;
        const usage =
          lastMessage?.metadata?.totalUsage ??
          (responseMessage as TokenUsageMessage)?.metadata?.totalUsage;

        if (usage) {
          console.log("Token 使用情况:", {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            reasoningTokens: usage.reasoningTokens,
            cachedInputTokens: usage.cachedInputTokens,
            chatId: sessionId,
          });
        }

        // 只保存 AI 的最终回复（MVP）；若需要保存整个 messages，可扩展为批量写入。
        if (responseMessage?.role !== "assistant") {
          return;
        }

        const messageToSave: UIMessage = usage
          ? {
              ...responseMessage,
              metadata: {
                ...(responseMessage as any).metadata,
                totalUsage: usage,
              },
            }
          : responseMessage;

        await saveAndAppendMessage({
          sessionId,
          incomingMessage: messageToSave,
        });
      },
      // Use consumeSseStream to handle the stream for resumption
      consumeSseStream: ({ stream }) => {
        const streamId = sessionId;

        // Create new stream entry
        const activeStream: ActiveSseStream = {
          chunks: [],
          done: false,
        };
        ACTIVE_SSE_STREAMS.set(streamId, activeStream);

        const reader = stream.getReader();

        // Use a loop instead of recursion to avoid stack overflow
        const processChunk = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              console.log("Stream done");
              finalizeActiveStream(streamId);
              return;
            }

            if (typeof value !== "string") {
              console.warn("Unexpected stream chunk type:", typeof value);
              continue;
            }

            // Store the chunk for resumption
            activeStream.chunks.push(value);

            // Publish chunk event to all subscribers using EventEmitter2
            eventEmitter.emit(`${streamId}:chunk`, value);
          }
        };

        processChunk().catch((error) => {
          console.error("Error processing stream chunk:", error);
          finalizeActiveStream(streamId);
        });
      },
    });
  });

  // GET endpoint to resume streams
  app.get("/chat/sse/:id/stream", async (c) => {
    const chatId = c.req.param("id");
    const clientId = c.req.query("clientId") ?? "";

    if (clientId) {
      const key = chatId;
      const existing = ACTIVE_SSE_STREAM_CLIENTS.get(key);
      if (existing?.has(clientId)) {
        // Same chatId + clientId already following: avoid duplicate consumers.
        return new Response(null, { status: 204 });
      }
      const next = existing ?? new Set<string>();
      next.add(clientId);
      ACTIVE_SSE_STREAM_CLIENTS.set(key, next);
    }

    const stream = resumeExistingStream(chatId);

    if (!stream) {
      // If no active stream exists, return 204 No Content
      if (clientId) {
        ACTIVE_SSE_STREAM_CLIENTS.get(chatId)?.delete(clientId);
      }
      return new Response(null, { status: 204 });
    }

    if (clientId) {
      const release = () => {
        const set = ACTIVE_SSE_STREAM_CLIENTS.get(chatId);
        if (!set) return;
        set.delete(clientId);
        if (set.size === 0) ACTIVE_SSE_STREAM_CLIENTS.delete(chatId);
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
};
