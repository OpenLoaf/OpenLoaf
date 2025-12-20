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
import { requestContextManager } from "@/context/requestContext";
import { MasterAgent } from "@/chat/agents";
import { browserTools } from "@/chat/tools/browser";
import { dbTools } from "@/chat/tools/db";
import {
  loadBranchMessages,
  requireExistingChatMessageNode,
  saveChatMessageNode,
} from "@/chat/history";
import { systemTools } from "@/chat/tools/system";
import { subAgentTool } from "@/chat/tools/subAgent";
import type { ChatRequestBody, TokenUsageMessage } from "@teatime-ai/api/types/message";
import { subAgentToolDef } from "@teatime-ai/api/types/tools/subAgent";
import { MessageRole as MessageRoleEnum } from "@teatime-ai/db/prisma/generated/client";
import {
  attachAbortControllerToActiveStream,
  appendStreamChunk,
  finalizeActiveStream,
  initActiveStream,
} from "@/chat/sse/streams";

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

    // 关键：retry = 复用已存在的 user 消息重新生成 assistant（不能再次保存该 user 消息）
    const isRetry = Boolean((body as any)?.retry);

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
    if (!lastIncomingMessage) {
      return c.json({ error: "last message is required" }, 400);
    }
    if ((lastIncomingMessage as any).role !== "user") {
      return c.json({ error: "last message must be a user message" }, 400);
    }
    
    // 关键：每次发送都必须指定 parentMessageId（消息树）
    const messageParentMessageId =
      typeof (lastIncomingMessage as any).parentMessageId === "string" ||
      (lastIncomingMessage as any).parentMessageId === null
        ? ((lastIncomingMessage as any).parentMessageId as string | null)
        : undefined;
    if (messageParentMessageId === undefined) {
      return c.json({ error: "parentMessageId is required" }, 400);
    }
    const parentMessageId = messageParentMessageId;

    const webClientId = typeof body.webClientId === "string" ? body.webClientId : "";
    const electronClientId =
      typeof body.electronClientId === "string" && body.electronClientId
        ? body.electronClientId
        : undefined;

    // 关键：初始化请求上下文（tools/agent 内部读取 workspaceId/clientId）
    requestContextManager.createContext({
      sessionId,
      cookies: cookies || {},
      webClientId: webClientId || undefined,
      electronClientId,
    });

    // 关键：新发送 -> 保存用户消息；retry -> 读取已存在的用户消息节点
    const userNode = isRetry
      ? await requireExistingChatMessageNode({
          sessionId,
          messageId: String((lastIncomingMessage as any).id),
        })
      : await saveChatMessageNode({
          sessionId,
          message: lastIncomingMessage as any,
          parentMessageId,
        });
    if (isRetry && (userNode as any).role !== MessageRoleEnum.user) {
      return c.json({ error: "retry requires an existing user message" }, 400);
    }

    // 发给 LLM 的上下文：只取 parentMessageId 这条链 + 当前用户消息（MVP 截断）
    const messages = await loadBranchMessages({
      sessionId,
      leafMessageId: userNode.id,
      take: 50,
    });

    const master = new MasterAgent();
    const agent = master.createAgent();

    // 关键：提前生成本次 master assistant 的 messageId，供 tool 落库挂父节点用
    const assistantMessageId = generateId();
    requestContextManager.setCurrentAssistantMessageId(assistantMessageId);
    // 关键：先落一个占位节点，保证 tool（subAgent）落库时父节点已存在
    await saveChatMessageNode({
      sessionId,
      message: {
        id: assistantMessageId,
        role: "assistant",
        parts: [],
        parentMessageId: userNode.id,
      } as any,
      parentMessageId: userNode.id,
      allowEmpty: true,
    });

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
        const messageToSaveWithParent = {
          ...(messageToSave as any),
          parentMessageId: userNode.id,
        } as UIMessage;
      
        await saveChatMessageNode({
          sessionId,
          message: messageToSaveWithParent as any,
          parentMessageId: userNode.id,
        });
      },
      execute: async ({ writer }) => {
        // 说明：保留 writer 供 tool streaming chunks 使用；UI 控制不再通过 SSE data part 下发。
        requestContextManager.setUIWriter(writer as any);
        // 关键：把 stop 的 AbortSignal 注入请求上下文，供 tools 内部协作式退出（例如 pagePicker 轮询）。
        requestContextManager.setAbortSignal(abortController.signal);
        requestContextManager.pushAgentFrame(master.createFrame());

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
          generateMessageId: () => assistantMessageId,
          onError: (error: unknown) => {
            console.error("Agent error:", error);
            return toClientErrorText(error);
          },
          messageMetadata: ({ part }: any) => {
            const frame = requestContextManager.getCurrentAgentFrame();
            const agentMeta = frame
              ? {
                  agent: {
                    // 关键：对齐 AI SDK Agent 的标识（仅用于展示/追溯，运行时不依赖）
                    version: "agent-v1",
                    kind: frame.kind,
                    name: frame.name,
                    id: frame.agentId,
                    // 关键：模型信息用于历史展示（MVP：由 AgentFrame 提供可序列化描述）
                    model: frame.model,
                  },
                }
              : undefined;

            // 关键：metadata 禁止写入消息树字段（parentMessageId/path/...），消息树只存在于列
            if (part.type === "start") return (agentMeta ?? {}) as any;
            if (part.type === "finish") {
              return {
                ...(agentMeta ?? {}),
                totalUsage: (part as any).totalUsage,
              } as any;
            }
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
          console.error("Error processing stream chunk:", error, { sessionId });
          finalizeActiveStream(streamId);
        });
      },
    });
  });
}
