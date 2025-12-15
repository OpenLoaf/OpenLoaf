import { createAgentUIStreamResponse, generateId } from "ai";
import type { UIMessage } from "ai";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { saveAndAppendMessage } from "./history";
import { requestContextManager } from "../context/requestContext";
import type { ChatRequestBody, TokenUsageMessage } from "./types";
import { createAgent, createRequestTools } from "./tools-config";

type ActiveSseStream = {
  chunks: string[];
  subscribers: Set<ReadableStreamDefaultController<string>>;
  done: boolean;
  cleanupTimer?: ReturnType<typeof setTimeout>;
  streamId: string;
};

const ACTIVE_SSE_STREAMS = new Map<string, ActiveSseStream>();
const STREAM_TTL_MS = 60_000;

function finalizeActiveStream(chatId: string, entry: ActiveSseStream) {
  if (entry.done) return;
  entry.done = true;

  for (const controller of entry.subscribers) {
    try {
      controller.close();
    } catch {
      // ignore
    }
  }
  entry.subscribers.clear();

  if (entry.cleanupTimer) clearTimeout(entry.cleanupTimer);
  entry.cleanupTimer = setTimeout(() => {
    ACTIVE_SSE_STREAMS.delete(chatId);
  }, STREAM_TTL_MS);
}

function replaceActiveStream(chatId: string): ActiveSseStream {
  const existing = ACTIVE_SSE_STREAMS.get(chatId);
  if (existing) {
    try {
      finalizeActiveStream(chatId, existing);
    } finally {
      ACTIVE_SSE_STREAMS.delete(chatId);
    }
  }

  const next: ActiveSseStream = {
    chunks: [],
    subscribers: new Set(),
    done: false,
    streamId: chatId, // Use sessionId as streamId to avoid duplicates
  };
  ACTIVE_SSE_STREAMS.set(chatId, next);
  return next;
}

const UI_MESSAGE_STREAM_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
  "x-vercel-ai-ui-message-stream": "v1",
  "x-accel-buffering": "no",
} as const;

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

    const requestTools = createRequestTools();

    const agent = createAgent();

    // Get or create active stream for this chat
    let activeStream = ACTIVE_SSE_STREAMS.get(sessionId);
    if (!activeStream || activeStream.done) {
      activeStream = replaceActiveStream(sessionId);
    }

    return createAgentUIStreamResponse({
      agent,
      onError: (error) => {
        console.error("Agent error:", error);
        finalizeActiveStream(sessionId, activeStream);
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
          finalizeActiveStream(sessionId, activeStream);
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
          finalizeActiveStream(sessionId, activeStream);
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

        finalizeActiveStream(sessionId, activeStream);
      },
      // Use consumeSseStream to handle the stream for resumption
      consumeSseStream: ({ stream }) => {
        const reader = stream.getReader();

        const processChunk = async () => {
          const { done, value } = await reader.read();

          if (done) {
            return;
          }

          // Store the chunk for resumption
          activeStream.chunks.push(value);

          // Broadcast to all subscribers
          for (const controller of activeStream.subscribers) {
            try {
              controller.enqueue(value);
            } catch {
              // Remove subscribers that have closed
              activeStream.subscribers.delete(controller);
            }
          }

          await processChunk();
        };

        processChunk().catch((error) => {
          console.error("Error processing stream chunk:", error);
          finalizeActiveStream(sessionId, activeStream);
        });
      },
    });
  });

  // GET endpoint to resume streams
  app.get("/chat/sse/:id/stream", async (c) => {
    const chatId = c.req.param("id");
    const resumeAt = c.req.query("resumeAt");

    const activeStream = ACTIVE_SSE_STREAMS.get(chatId);

    if (!activeStream || activeStream.done) {
      return new Response(null, { status: 204 });
    }

    // Create a new stream for this client
    let currentController: ReadableStreamDefaultController<string> | null =
      null;

    const stream = new ReadableStream({
      start: (controller) => {
        currentController = controller;
        // Add this client as a subscriber
        activeStream.subscribers.add(controller);

        // Send all previous chunks if resumeAt is not provided or is 0
        if (!resumeAt || parseInt(resumeAt) === 0) {
          for (const chunk of activeStream.chunks) {
            controller.enqueue(chunk);
          }
        }
      },
      cancel: () => {
        // Remove this client from subscribers
        if (currentController) {
          activeStream.subscribers.delete(currentController);
        }
      },
    });

    return new Response(stream as any, {
      headers: UI_MESSAGE_STREAM_HEADERS,
    });
  });
};
