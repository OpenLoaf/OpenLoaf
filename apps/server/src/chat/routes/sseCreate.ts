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
import type { ChatRequestBody, TokenUsageMessage } from "@teatime-ai/api/types/message";
import { CLIENT_CONTEXT_PART_TYPE } from "@teatime-ai/api/types/parts";
import {
  attachAbortControllerToActiveStream,
  appendStreamChunk,
  finalizeActiveStream,
  initActiveStream,
} from "@/chat/sse/streams";

const DEBUG_AI_STREAM = process.env.TEATIME_DEBUG_AI_STREAM === "1";

function safeJsonSize(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return -1;
  }
}

function summarizeMessagesForDebug(messages: UIMessage[]): Array<{
  id: string;
  role: string;
  parts: Array<{ type: string; size: number }>;
  metaSize: number;
  totalPartsSize: number;
}> {
  return messages.map((m: any) => {
    const parts = Array.isArray(m?.parts) ? m.parts : [];
    const partsSummary: Array<{ type: string; size: number }> = parts.map((p: any) => ({
      type: typeof p?.type === "string" ? p.type : "unknown",
      size: safeJsonSize(p),
    }));
    const totalPartsSize = partsSummary.reduce(
      (acc, p) => acc + (p.size > 0 ? p.size : 0),
      0,
    );
    return {
      id: String(m?.id ?? ""),
      role: String(m?.role ?? ""),
      parts: partsSummary,
      metaSize: safeJsonSize(m?.metadata),
      totalPartsSize,
    };
  });
}

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

    const mode = decideAgentMode(activeTab);

    // 关键：初始化请求上下文（tools/agent 内部可读取 activeTab/workspaceId）
    requestContextManager.createContext({
      sessionId,
      cookies: cookies || {},
      activeTab,
      mode,
    });

    const messages = await saveAndAppendMessage({
      sessionId,
      incomingMessage: lastIncomingMessage,
    });

    if (DEBUG_AI_STREAM) {
      const summary = summarizeMessagesForDebug(messages as any);
      const total = summary.reduce((acc, m) => acc + m.totalPartsSize, 0);
      const top = [...summary]
        .sort((a, b) => b.totalPartsSize - a.totalPartsSize)
        .slice(0, 5);
      console.log("[debug][ai-stream] history summary", {
        sessionId,
        mode,
        activeTabId: activeTab?.id ?? null,
        messageCount: summary.length,
        approxTotalChars: total,
        topMessages: top.map((m) => ({
          id: m.id,
          role: m.role,
          totalPartsSize: m.totalPartsSize,
          parts: m.parts.slice(0, 8),
        })),
      });
    }

    const master = new MasterAgent(mode);
    const agent = master.createAgent();

    // 关键：支持“用户手动停止生成”而不影响断线续传（resume）。
    // - 断线：保持生成继续进行，内存流持续写入，客户端可通过 GET /stream 续传
    // - 手动停止：前端调用 stop endpoint -> stopActiveStream -> abort 这个 controller
    const abortController = new AbortController();
    initActiveStream(sessionId);
    attachAbortControllerToActiveStream(sessionId, abortController);

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

        if (DEBUG_AI_STREAM) {
          console.log("[debug][ai-stream] createAgentUIStream start", {
            sessionId,
            mode,
            activeTabId: activeTab?.id ?? null,
            messageCount: (messages as any[])?.length ?? 0,
            approxMessagesChars: safeJsonSize(messages),
          });
        }

        const agentStream = await createAgentUIStream({
          agent,
          messages: messages as any[],
          abortSignal: abortController.signal,
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

        const reader = stream.getReader();
        let chunkCount = 0;
        let lastChunkPreview = "";

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
              chunkCount += 1;
              if (DEBUG_AI_STREAM) {
                lastChunkPreview = value.slice(0, 200);
              }
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
          console.error("Error processing stream chunk:", error, {
            sessionId,
            chunkCount,
            lastChunkPreview: DEBUG_AI_STREAM ? lastChunkPreview : undefined,
          });
          finalizeActiveStream(streamId);
        });
      },
    });
  });
}
