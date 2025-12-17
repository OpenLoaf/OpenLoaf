import { createAgentUIStream, createUIMessageStream, createUIMessageStreamResponse } from "ai";
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
import { createMainAgent } from "./tools-config";
import type { Tab } from "@teatime-ai/api/types/tabs";

const CLIENT_CONTEXT_PART_TYPE = "data-client-context" as const;

function extractActiveTab(message: UIMessage | undefined): Tab | undefined {
  const parts = (message as any)?.parts;
  if (!Array.isArray(parts)) return undefined;
  const ctxPart = parts.find((p: any) => p?.type === CLIENT_CONTEXT_PART_TYPE);
  return ctxPart?.data?.activeTab as Tab | undefined;
}

function decideAgentMode(activeTab: Tab | undefined) {
  // MVP：仅用 base.component 判断场景；后续可扩展更细的路由策略
  const component = activeTab?.base?.component;
  if (component === "settings-page") return "settings" as const;
  return "project" as const;
}

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

    // 关键：从 user message 的 data-client-context 里拿 activeTab（MVP）
    const activeTab = extractActiveTab(lastIncomingMessage);

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

    const mode = decideAgentMode(activeTab);
    const agent = createMainAgent(mode);

    const stream = createUIMessageStream({
      // 持久化模式：把历史消息作为 originalMessages，最终 responseMessage 可用于落库
      originalMessages: messages as any[],
      onError: (error) => {
        console.error("UI stream error:", error);
        return "An error occurred.";
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

        await saveAndAppendMessage({ sessionId, incomingMessage: messageToSave });
      },
      execute: async ({ writer }) => {
        // 关键：把 writer 放进请求上下文，tools 执行时可 writer 自定义事件给前端
        requestContextManager.setUIWriter(writer as any);

        const agentStream = await createAgentUIStream({
          agent,
          // 将 DB 还原出来的完整历史传给 agent
          messages: messages as any[],
          onError: (error) => {
            console.error("Agent error:", error);
            return "An error occurred.";
          },
          messageMetadata: ({ part }) => {
            // 当生成完成时发送完整的 token 使用信息
            if (part.type === "finish") {
              return { totalUsage: part.totalUsage };
            }
          },
        });

        writer.merge(agentStream as any);
      },
    });

    return createUIMessageStreamResponse({
      stream,
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
                finalizeActiveStream(streamId);
                return;
              }

              if (typeof value !== "string") continue;

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
