import { createAgentUIStreamResponse } from "ai";
import type { UIMessage } from "ai";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { requestContextManager } from "../context/requestContext";
import { saveAndAppendMessage } from "./history";
import {
  appendStreamChunk,
  finalizeActiveStream,
  initActiveStream,
} from "./sse.streams";
import type { ChatRequestBody, TokenUsageMessage } from "./types";
import { createAgent } from "./tools-config";

/**
 * POST `/chat/sse`
 * 创建一次新的 AI 生成，并把生成过程写入“可续传的内存流”里（供 GET 跟随/断线续传）。
 */
export function registerChatSseCreateRoute(app: Hono) {
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

    // 从请求中获取所有 cookie
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

    // 初始化请求上下文：后续 tools / agent 内部调用可拿到 sessionId、cookie、activeTab 等信息
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
      consumeSseStream: ({ stream }) => {
        const streamId = sessionId;

        // 这一步把“生成中”的 stream 注册为可被跟随/续传的内存态流
        initActiveStream(streamId);

        const reader = stream.getReader();

        // 用 loop 而不是递归，避免长输出时的堆栈风险
        const processChunk = async () => {
          try {
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

              // 写入“可续传的历史”并广播给所有跟随 SSE 客户端
              appendStreamChunk(streamId, value);
            }
          } finally {
            try {
              reader.releaseLock();
            } catch {
              // ignore
            }
          }
        };

        processChunk().catch((error) => {
          console.error("Error processing stream chunk:", error);
          finalizeActiveStream(streamId);
        });
      },
    });
  });
}

