import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  convertToModelMessages,
  generateId,
  validateUIMessages,
} from "ai";
import type { UIMessage } from "ai";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Tab } from "@teatime-ai/api/common";
import { requestContextManager } from "@/context/requestContext";
import { MasterAgent, decideAgentMode } from "@/chat/agents";
import { browserTools } from "@/chat/tools/browser";
import { dbTools } from "@/chat/tools/db";
import { saveAndAppendMessage } from "@/chat/history";
import { systemTools } from "@/chat/tools/system";
import { subAgentTool } from "@/chat/tools/subAgent";
import type { ChatRequestBody, TokenUsageMessage } from "@teatime-ai/api/types/message";
import { CLIENT_CONTEXT_PART_TYPE } from "@teatime-ai/api/types/parts";
import type { ClientContext } from "@teatime-ai/api/types/event";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";
import {
  attachAbortControllerToActiveStream,
  appendStreamChunk,
  finalizeActiveStream,
  initActiveStream,
} from "@/chat/sse/streams";

const DEBUG_AI_STREAM = process.env.TEATIME_DEBUG_AI_STREAM === "1";

/**
 * 将服务端异常转换为可发送给前端的错误文本：
 * - AI SDK 的 `onError` 需要返回 string，前端会显示为 tool-output-error.errorText
 * - 这里尽量保留可读信息，便于排查（MVP：不做脱敏/分级）
 */
function toClientErrorText(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return String(error);
            }
          })();

  const text = raw?.trim() || "Unknown error";
  // 避免极端情况下错误内容过大导致 SSE/日志异常。
  return text.length > 800 ? `${text.slice(0, 800)}…` : text;
}

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

/**
 * 从 data-client-context 提取 client 侧上下文：
 * - activeTab：用于 agent/tools 绑定到当前 Tab
 * - webClientId / electronClientId：用于 Browser Runtime 调度（Phase 1）
 */
function extractClientContext(message: UIMessage | undefined): Partial<ClientContext> {
  const parts = (message as any)?.parts;
  if (!Array.isArray(parts)) return {};
  const ctxPart = parts.find((p: any) => p?.type === CLIENT_CONTEXT_PART_TYPE);
  const data = (ctxPart?.data ?? {}) as any;
  return {
    activeTab: (data?.activeTab ?? null) as Tab | null,
    webClientId: typeof data?.webClientId === "string" ? data.webClientId : "",
    electronClientId:
      typeof data?.electronClientId === "string" && data.electronClientId
        ? data.electronClientId
        : undefined,
  };
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

    // 关键：从 data-client-context 取 client context（避免依赖 cookie/history）
    const clientContext = extractClientContext(lastIncomingMessage);
    const activeTab: Tab | undefined = (clientContext.activeTab ?? undefined) as Tab | undefined;

    const mode = decideAgentMode(activeTab);

    console.log("[sse] create: request", {
      sessionId,
      mode,
      webClientId: clientContext.webClientId || "",
      electronClientId: clientContext.electronClientId || "",
      activeTabId: activeTab?.id ?? null,
    });

    // 关键：初始化请求上下文（tools/agent 内部可读取 activeTab/workspaceId）
    requestContextManager.createContext({
      sessionId,
      cookies: cookies || {},
      activeTab,
      webClientId: clientContext.webClientId || undefined,
      electronClientId: clientContext.electronClientId || undefined,
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
        return toClientErrorText(error);
      },
      onFinish: async ({ isAborted, messages, responseMessage }) => {
        // if (isAborted) return;

        const lastMessage = messages[messages.length - 1] as TokenUsageMessage;
        const usage =
          lastMessage?.metadata?.totalUsage ??
          (responseMessage as TokenUsageMessage)?.metadata?.totalUsage;

        if (usage) {
          console.log("=== Token 使用情况:", {
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
        // 说明：保留 writer 供 tool streaming chunks 使用；UI 控制不再通过 SSE data part 下发。
        requestContextManager.setUIWriter(writer as any);
        // 关键：把 stop 的 AbortSignal 注入请求上下文，供 tools 内部协作式退出（例如 pagePicker 轮询）。
        requestContextManager.setAbortSignal(abortController.signal);
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

        const toolSchemasForValidation = {
          ...systemTools,
          ...browserTools,
          ...dbTools,
          [subAgentToolDef.id]: subAgentTool,
        } as const;

        const validatedMessages = await validateUIMessages({
          messages: messages as any[],
          tools: toolSchemasForValidation as any,
        });

        const modelMessages = convertToModelMessages(validatedMessages, {
          tools: toolSchemasForValidation as any,
        });

        const result = await agent.stream({
          prompt: modelMessages as any,
          abortSignal: abortController.signal,
        });

        const uiStream = result.toUIMessageStream({
          // 关键：服务端生成 messageId，确保可用于 DB 主键（Phase B）
          generateMessageId: generateId,
          onError: (error: unknown) => {
            console.error("Agent error:", error);
            return toClientErrorText(error);
          },
          messageMetadata: ({ part }: any) => {
            const frame = requestContextManager.getCurrentAgentFrame();
            const agentMeta = frame
              ? {
                  agent: {
                    kind: frame.kind,
                    name: frame.name,
                    id: frame.agentId,
                    depth: frame.path.length - 1,
                    path: frame.path,
                  },
                }
              : undefined;
            if (part.type === "finish")
              return { ...(agentMeta ?? {}), totalUsage: (part as any).totalUsage } as any;
            if (part.type === "start") return agentMeta as any;
          },
          onFinish: () => {
            // 关键：确保 master 结束后清理 agent 栈
            requestContextManager.popAgentFrame();
          },
        });

        writer.merge(uiStream as any);
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
