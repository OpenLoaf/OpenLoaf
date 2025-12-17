import {
  createAgentUIStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";
import type { UIMessage } from "ai";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Tab } from "@teatime-ai/api/common";
import { requestContextManager } from "@/context/requestContext";
import { MasterAgent, decideAgentMode } from "@/chat/agents";
import { saveAndAppendMessage } from "@/chat/history";
import type { ChatRequestBody, TokenUsageMessage } from "@/chat/types";
import { CLIENT_CONTEXT_PART_TYPE } from "@teatime-ai/api/types/parts";
import {
  appendStreamChunk,
  finalizeActiveStream,
  initActiveStream,
} from "@/chat/sse/streams";

function extractActiveTab(message: UIMessage | undefined): Tab | undefined {
  const parts = (message as any)?.parts;
  if (!Array.isArray(parts)) return undefined;
  const ctxPart = parts.find((p: any) => p?.type === CLIENT_CONTEXT_PART_TYPE);
  return (ctxPart?.data?.activeTab ?? undefined) as Tab | undefined;
}

/**
 * POST `/chat/sse`
 * - createUIMessageStream：拿到 writer，允许 tools 推 Streaming Custom Data
 * - createAgentUIStream：运行主 agent 并合并到 UI stream
 * - consumeSseStream：写入“可续传内存流”，供断线续传使用
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
    if (!sessionId) return c.json({ error: "sessionId is required" }, 400);

    // 从请求中获取 cookie（workspace-id 等仍可能存在）
    const cookies = getCookie(c);

    const incomingMessages = body.messages;
    if (incomingMessages !== undefined && !Array.isArray(incomingMessages)) {
      return c.json({ error: "messages must be an array" }, 400);
    }

    // MVP：仅取最后一条用户消息作为“新消息”写入 DB
    const lastIncomingMessage = Array.isArray(incomingMessages)
      ? incomingMessages[incomingMessages.length - 1]
      : undefined;

    // 关键：从 data-client-context 取 activeTab（不依赖历史持久化 key）
    const activeTab = extractActiveTab(lastIncomingMessage);

    // 关键：初始化请求上下文（tools/agent 内部可读取 activeTab/workspaceId）
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
    const master = new MasterAgent(mode);
    const agent = master.createAgent();

    const stream = createUIMessageStream({
      originalMessages: messages as any[],
      onError: (error) => {
        console.error("UI stream error:", error);
        return "An error occurred.";
      },
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
        // 关键：tools 需要能拿到 writer -> write(data-ui-event)
        requestContextManager.setUIWriter(writer as any);
        requestContextManager.pushAgentFrame(master.createFrame());

        const agentStream = await createAgentUIStream({
          agent,
          messages: messages as any[],
          // 关键：服务端生成 messageId，确保可用于 DB 主键（Phase B）
          generateMessageId: generateId,
          onError: (error) => {
            console.error("Agent error:", error);
            return "An error occurred.";
          },
          messageMetadata: ({ part }) => {
            const frame = requestContextManager.getCurrentAgentFrame();
            const agentMeta = frame
              ? {
                  agent: {
                    kind: frame.kind,
                    name: frame.name,
                    depth: frame.path.length - 1,
                    path: frame.path,
                  },
                }
              : undefined;
            if (part.type === "finish") return { ...(agentMeta ?? {}), totalUsage: (part as any).totalUsage } as any;
            if (part.type === "start") return agentMeta as any;
          },
          onFinish: () => {
            // 关键：确保 master 结束后清理 agent 栈
            requestContextManager.popAgentFrame();
          },
        });

        writer.merge(agentStream as any);
      },
    });

    return createUIMessageStreamResponse({
      stream,
      consumeSseStream: ({ stream }) => {
        const streamId = sessionId;
        initActiveStream(streamId);

        const reader = stream.getReader();

        // 关键：把 SSE 字符串写入内存流（断线续传/新订阅者回放）
        const processChunk = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                finalizeActiveStream(streamId);
                return;
              }
              if (typeof value !== "string") continue;
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
