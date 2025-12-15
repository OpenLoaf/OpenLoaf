import { createAgentUIStreamResponse } from "ai";
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
  // AI SDK v6 的 resumeStream() 默认会 GET `${api}/${chatId}/stream`
  // 这里实现 `/chat/sse/:chatId/stream` 用于断线重连。
  app.get("/chat/sse/:chatId/stream", async (c) => {
    const chatId = c.req.param("chatId");
    const entry = ACTIVE_SSE_STREAMS.get(chatId);
    if (!entry) {
      return new Response(null, { status: 204 });
    }

    const cursorRaw = c.req.query("cursor");
    const cursor = Number(cursorRaw ?? "0");
    const startIndex = Number.isFinite(cursor) && cursor > 0 ? cursor : 0;
    const from = Math.min(Math.max(0, startIndex), entry.chunks.length);

    let controllerRef: ReadableStreamDefaultController<string> | null = null;

    const sseStream = new ReadableStream<string>({
      start(controller) {
        controllerRef = controller;

        // 先重放缓存
        for (let i = from; i < entry.chunks.length; i += 1) {
          controller.enqueue(entry.chunks[i]);
        }

        // 如果已经结束，直接关闭
        if (entry.done) {
          controller.close();
          return;
        }

        entry.subscribers.add(controller);
      },
      cancel() {
        if (controllerRef) {
          entry.subscribers.delete(controllerRef);
        }
      },
    });

    return new Response(sseStream.pipeThrough(new TextEncoderStream()), {
      status: 200,
      headers: UI_MESSAGE_STREAM_HEADERS,
    });
  });

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

    // NOTE: 当前文件里 requestTools 未被使用；如需 tools 注入，请在 createAgent()/tools-config 内部完成。
    createRequestTools();

    const agent = createAgent();

    const active = replaceActiveStream(sessionId);

    return createAgentUIStreamResponse({
      agent,
      // tee 一份 SSE 给服务端做缓存和广播，用于断线重连
      consumeSseStream: async ({ stream }) => {
        const reader = stream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            active.chunks.push(value);
            for (const controller of active.subscribers) {
              try {
                controller.enqueue(value);
              } catch {
                active.subscribers.delete(controller);
              }
            }
          }
        } finally {
          finalizeActiveStream(sessionId, active);
          try {
            reader.releaseLock();
          } catch {
            // ignore
          }
        }
      },
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
        if (isAborted) return;

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
        if (responseMessage?.role !== "assistant") return;

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
    });
  });
};
