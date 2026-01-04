import {
  createAgentUIStream,
  createUIMessageStream,
  generateId,
  JsonToSseTransformStream,
  UI_MESSAGE_STREAM_HEADERS,
  type UIMessage,
} from "ai";
import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { ChatRequestBody, TokenUsage } from "@teatime-ai/api/types/message";
import { createMasterAgentRunner } from "@/ai";
import { resolveChatModel } from "@/ai/resolveChatModel";
import { chatRepository } from "@/modules/chat/ChatRepositoryAdapter";
import { loadMessageChain } from "@/modules/chat/loadMessageChain";
import { buildFilePartFromTeatimeUrl } from "@/modules/chat/teatimeFile";
import {
  popAgentFrame,
  pushAgentFrame,
  getSessionId,
  setAssistantMessageId,
  setAbortSignal,
  setChatModel,
  setRequestContext,
  setUiWriter,
} from "@/common/requestContext";
import { logger } from "@/common/logger";
/** Map agent stream finish usage into UIMessage.metadata (for DB persistence + stats). */
function toTokenUsageMetadata(part: unknown): { totalUsage: TokenUsage } | undefined {
  if (!part || typeof part !== "object") return;
  const totalUsage = (part as any).totalUsage;
  // AI SDK 的 totalUsage 只在 finish part 出现；这里做 best-effort 适配并确保可序列化。
  if (!totalUsage || typeof totalUsage !== "object") return;

  const toNumberOrUndefined = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

  const usage: TokenUsage = {
    inputTokens: toNumberOrUndefined((totalUsage as any).inputTokens),
    outputTokens: toNumberOrUndefined((totalUsage as any).outputTokens),
    totalTokens: toNumberOrUndefined((totalUsage as any).totalTokens),
    reasoningTokens: toNumberOrUndefined((totalUsage as any).reasoningTokens),
    cachedInputTokens: toNumberOrUndefined((totalUsage as any).cachedInputTokens),
  };

  if (Object.values(usage).every((v) => v === undefined)) return;
  return { totalUsage: usage };
}

/** Merge UIMessage.metadata with abort info for persistence (best-effort). */
function mergeMetadataWithAbortInfo(
  metadata: unknown,
  input: { isAborted: boolean; finishReason?: string },
): Record<string, unknown> | undefined {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

  const base = isRecord(metadata) ? { ...metadata } : {};
  if (!input.isAborted) return Object.keys(base).length ? base : undefined;

  // aborted 的流也需要落库；把“被中止”的状态写进 metadata，方便 UI/统计侧识别。
  const existingTeatime = isRecord(base.teatime) ? base.teatime : {};
  base.teatime = {
    ...existingTeatime,
    isAborted: true,
    abortedAt: new Date().toISOString(),
    ...(input.finishReason ? { finishReason: input.finishReason } : {}),
  };

  return base;
}

/** Read request fields from top-level or params (backward compatible). */
function readRequestValue<T = unknown>(body: ChatRequestBody, key: string): T | undefined {
  const direct = (body as any)[key];
  // 中文注释：优先兼容旧版顶层字段，未命中再读取 params。
  if (direct !== undefined) return direct as T;
  const params = body.params;
  if (!params || typeof params !== "object" || Array.isArray(params)) return;
  if (!(key in params)) return;
  return (params as Record<string, unknown>)[key] as T;
}

async function replaceTeatimeFileParts(messages: UIMessage[]): Promise<UIMessage[]> {
  const next: UIMessage[] = [];
  for (const message of messages) {
    const parts = Array.isArray((message as any).parts) ? (message as any).parts : [];
    const replaced: any[] = [];
    for (const part of parts) {
      if (!part || typeof part !== "object") {
        replaced.push(part);
        continue;
      }
      if ((part as any).type !== "file") {
        replaced.push(part);
        continue;
      }
      const url = typeof (part as any).url === "string" ? (part as any).url : "";
      if (!url || !url.startsWith("teatime-file://")) {
        replaced.push(part);
        continue;
      }
      const mediaType =
        typeof (part as any).mediaType === "string" ? (part as any).mediaType : undefined;
      try {
        const filePart = await buildFilePartFromTeatimeUrl({ url, mediaType });
        if (filePart) replaced.push(filePart);
      } catch {
        // 中文注释：读取或压缩失败时直接跳过该图片，避免阻断对话。
      }
    }
    next.push({ ...message, parts: replaced } as UIMessage);
  }
  return next;
}

/**
 * Builds a minimal SSE data chunk for UIMessageStream clients.
 */
function toSseChunk(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}

/**
 * Persists a visible error message into the chat tree.
 */
async function saveErrorMessage(input: {
  sessionId: string;
  assistantMessageId: string;
  parentMessageId: string | null;
  errorText: string;
}) {
  const part = { type: "text", text: input.errorText, state: "done" };
  const appended = await chatRepository.appendMessagePartById({
    sessionId: input.sessionId,
    messageId: input.assistantMessageId,
    part,
  });
  if (appended) return;
  if (!input.parentMessageId) return;
  // 中文注释：找不到目标消息时，新建一条 assistant 错误消息。
  await chatRepository.saveMessageNode({
    sessionId: input.sessionId,
    message: {
      id: input.assistantMessageId,
      role: "assistant",
      parts: [part],
    } as any,
    parentMessageId: input.parentMessageId,
    allowEmpty: false,
  });
}

/**
 * Builds assistant timing metadata for persistence.
 */
function buildAssistantTimingMetadata(input: { startedAt: Date; finishedAt: Date }): Record<string, unknown> {
  const elapsedMs = Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime());
  return {
    teatime: {
      assistantStartedAt: input.startedAt.toISOString(),
      assistantFinishedAt: input.finishedAt.toISOString(),
      assistantElapsedMs: elapsedMs,
    },
  };
}

/**
 * Responds with a minimal SSE error stream and persists the error message.
 */
async function respondWithErrorStream(input: {
  sessionId: string;
  assistantMessageId: string;
  parentMessageId: string | null;
  errorText: string;
}): Promise<Response> {
  await saveErrorMessage(input);

  // 中文注释：用最小 UIMessageChunk 输出错误文本，让前端可见。
  const body = [
    toSseChunk({ type: "start", messageId: input.assistantMessageId }),
    toSseChunk({ type: "text-start", id: input.assistantMessageId }),
    toSseChunk({ type: "text-delta", id: input.assistantMessageId, delta: input.errorText }),
    toSseChunk({ type: "text-end", id: input.assistantMessageId }),
    toSseChunk({ type: "finish", finishReason: "error" }),
  ].join("");
  return new Response(body, { headers: UI_MESSAGE_STREAM_HEADERS });
}

/**
 * Chat SSE 路由（MVP）：
 * - POST /chat/sse：创建并开始生成
 */
export function registerChatSseRoutes(app: Hono) {
  app.post("/chat/sse", async (c) => {
    let body: ChatRequestBody;
    try {
      body = (await c.req.json()) as ChatRequestBody;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const sessionId = body.sessionId ?? body.id ?? readRequestValue<string>(body, "sessionId");
    if (!sessionId) return c.json({ error: "sessionId is required" }, 400);

    const cookies = getCookie(c) || {};
    const clientId = readRequestValue<string>(body, "clientId");
    const tabId = readRequestValue<string>(body, "tabId");
    const messageId = readRequestValue<string>(body, "messageId");
    const chatModelId = readRequestValue<string>(body, "chatModelId");
    const chatModelSource = readRequestValue<ChatRequestBody["chatModelSource"]>(
      body,
      "chatModelSource",
    );

    setRequestContext({
      sessionId,
      cookies,
      clientId: clientId || undefined,
      tabId: tabId || undefined,
    });

    const abortController = new AbortController();
    // 中文注释：客户端断开连接时同步中止本次生成。
    c.req.raw.signal.addEventListener("abort", () => {
      abortController.abort();
    });

    const requestStartAt = new Date();

    const incomingMessages = (body.messages ?? []) as UIMessage[];
    // AI SDK 的 useChat 会把本次生成的 messageId 传给服务端；续跑/审批继续应复用同一个 messageId，以便在 UI 侧作为同一条 assistant message 继续更新。
    const assistantMessageId =
      typeof messageId === "string" && messageId ? messageId : generateId();
    setAssistantMessageId(assistantMessageId);

    // 前端只发送最后一条消息；后端通过 messageId + parentMessageId 从 DB 补全完整链路再喂给 agent。
    const last = incomingMessages.at(-1) as any;
    if (!last || !last.role || !last.id) {
      return await respondWithErrorStream({
        sessionId,
        assistantMessageId,
        parentMessageId: await chatRepository.resolveSessionRightmostLeafId(sessionId),
        errorText: "请求无效：缺少最后一条消息。",
      });
    }

    // 先把“最后一条消息”落库，确保后端补全链路能读到最新状态（例如 approval-responded）。
    let leafMessageId = String(last.id);
    let assistantParentUserId: string | null = null;

    try {
      if (last.role === "user") {
        const explicitParent =
          typeof last.parentMessageId === "string" || last.parentMessageId === null
            ? (last.parentMessageId as string | null)
            : undefined;
        const parentMessageIdToUse =
          explicitParent === undefined
            ? await chatRepository.resolveSessionRightmostLeafId(sessionId)
            : explicitParent;

        const saved = await chatRepository.saveMessageNode({
          sessionId,
          message: last as any,
          parentMessageId: parentMessageIdToUse ?? null,
          createdAt: requestStartAt,
        });
        leafMessageId = saved.id;
        assistantParentUserId = saved.id;
      } else if (last.role === "assistant") {
        const parentId = typeof last.parentMessageId === "string" ? last.parentMessageId : null;
        if (!parentId) {
          return await respondWithErrorStream({
            sessionId,
            assistantMessageId,
            parentMessageId: await chatRepository.resolveSessionRightmostLeafId(sessionId),
            errorText: "请求无效：assistant 缺少 parentMessageId。",
          });
        }
        assistantParentUserId = parentId;

        await chatRepository.saveMessageNode({
          sessionId,
          message: last as any,
          parentMessageId: parentId,
          allowEmpty: true,
          createdAt: requestStartAt,
        });
        leafMessageId = String(last.id);
      } else {
        return await respondWithErrorStream({
          sessionId,
          assistantMessageId,
          parentMessageId: await chatRepository.resolveSessionRightmostLeafId(sessionId),
          errorText: "请求无效：不支持的消息角色。",
        });
      }
    } catch (err) {
      logger.error({ err }, "[chat] save last message failed");
      return await respondWithErrorStream({
        sessionId,
        assistantMessageId,
        parentMessageId: await chatRepository.resolveSessionRightmostLeafId(sessionId),
        errorText: "请求失败：保存消息出错。",
      });
    }

    const messages = await loadMessageChain({ sessionId, leafMessageId, maxMessages: 80 });
    logger.debug(
      {
        sessionId,
        leafMessageId,
        messageCount: Array.isArray(messages) ? messages.length : null,
        messageType: typeof messages,
      },
      "[chat] load message chain"
    );
    const modelMessages = await replaceTeatimeFileParts(messages as UIMessage[]);
    if (messages.length === 0) {
      return await respondWithErrorStream({
        sessionId,
        assistantMessageId,
        parentMessageId: assistantParentUserId ?? (await chatRepository.resolveSessionRightmostLeafId(sessionId)),
        errorText: "请求失败：历史消息不存在。",
      });
    }
    if (!assistantParentUserId) {
      return await respondWithErrorStream({
        sessionId,
        assistantMessageId,
        parentMessageId: await chatRepository.resolveSessionRightmostLeafId(sessionId),
        errorText: "请求失败：找不到父消息。",
      });
    }

    let masterAgent: ReturnType<typeof createMasterAgentRunner>;
    let agentMetadata: Record<string, unknown> = {};
    // 中文注释：优先使用请求传入的 chatModelId，失败后按 fallback 规则选择模型。
    try {
      const resolved = await resolveChatModel({
        chatModelId,
        chatModelSource,
      });
      masterAgent = createMasterAgentRunner({
        model: resolved.model,
        modelInfo: resolved.modelInfo,
      });
      setChatModel(resolved.model);
      agentMetadata = {
        id: masterAgent.frame.agentId,
        name: masterAgent.frame.name,
        kind: masterAgent.frame.kind,
        model: masterAgent.frame.model,
        chatModelId: resolved.chatModelId,
        modelDefinition: resolved.modelDefinition,
      };
    } catch (err) {
      const errorText =
        err instanceof Error ? `请求失败：${err.message}` : "请求失败：模型解析失败。";
      return await respondWithErrorStream({
        sessionId,
        assistantMessageId,
        parentMessageId: assistantParentUserId,
        errorText,
      });
    }

    const userNode = { id: assistantParentUserId };

    const popAgentFrameOnce = (() => {
      let popped = false;
      return () => {
        if (popped) return;
        popped = true;
        popAgentFrame();
      };
    })();

    const stream = createUIMessageStream({
      originalMessages: modelMessages as any[],
      onError: (err) => {
        // 中文注释：只在最外层记录一次流错误，避免 SDK 内部 error chunk 触发重复日志。
        logger.error({ err }, "[chat] ui stream error");
        // 中文注释：手动中断不写错误消息，避免覆盖原始内容。
        if (abortController.signal.aborted) {
          return "aborted";
        }
        void saveErrorMessage({
          sessionId,
          assistantMessageId,
          parentMessageId: assistantParentUserId ?? null,
          errorText: err instanceof Error ? err.message : "Unknown error",
        }).catch((error) => {
          logger.error({ err: error }, "[chat] save stream error failed");
        });
        return err instanceof Error ? err.message : "Unknown error";
      },
      execute: async ({ writer }) => {
        setUiWriter(writer as any);
        setAbortSignal(abortController.signal);
        pushAgentFrame(masterAgent.frame);

        try {
          logger.debug(
            {
              sessionId,
              assistantMessageId,
              messageCount: Array.isArray(messages) ? messages.length : null,
              messageType: typeof messages,
              firstMessageId:
                Array.isArray(messages) && messages[0] ? (messages[0] as any).id : null,
              lastMessageId:
                Array.isArray(messages) && messages.at(-1) ? (messages.at(-1) as any).id : null,
            },
            "[chat] create agent ui stream"
          );
          const uiStream = await createAgentUIStream({
            agent: masterAgent.agent,
            uiMessages: modelMessages as any[],
            // 启用 persistence mode（对齐 AI SDK 官方 needsApproval 流程的“两次调用”）。
            // 第二次调用会直接产出 tool-output-*（复用同一个 toolCallId）；必须基于 originalMessages 的 tool invocation 才能正确更新状态。
            originalMessages: modelMessages as any[],
            abortSignal: abortController.signal,
            generateMessageId: () => assistantMessageId,
            messageMetadata: ({ part }) => {
              const usageMetadata = toTokenUsageMetadata(part);
              if (part?.type !== "finish") return usageMetadata;
              const timingMetadata = buildAssistantTimingMetadata({
                startedAt: requestStartAt,
                finishedAt: new Date(),
              });
              const mergedMetadata: Record<string, unknown> = {};
              if (usageMetadata) Object.assign(mergedMetadata, usageMetadata);
              Object.assign(mergedMetadata, timingMetadata);

              const usageTeatime = (usageMetadata as any)?.teatime;
              const timingTeatime = (timingMetadata as any).teatime;
              if (usageTeatime && timingTeatime) {
                mergedMetadata.teatime = { ...usageTeatime, ...timingTeatime };
              }

              if (Object.keys(agentMetadata).length > 0) {
                // 中文注释：把本次请求的 agent 信息放进 SSE finish metadata。
                mergedMetadata.agent = agentMetadata;
              }

              return mergedMetadata;
            },
            onFinish: async ({ isAborted, responseMessage, finishReason }) => {
              // 主 agent 的输出只在这里触发一次 finish（避免双重 state machine）。
              try {
                if (!responseMessage || responseMessage.role !== "assistant") return;

                const currentSessionId = getSessionId() ?? sessionId;
                // 中文注释：统计本次 assistant 实际运行耗时（审批续跑会累计）。
                const timingMetadata = buildAssistantTimingMetadata({
                  startedAt: requestStartAt,
                  finishedAt: new Date(),
                });
                const baseMetadata =
                  responseMessage && typeof responseMessage === "object"
                    ? ((responseMessage as any).metadata as unknown)
                    : undefined;
                const baseRecord =
                  baseMetadata && typeof baseMetadata === "object" && !Array.isArray(baseMetadata)
                    ? (baseMetadata as Record<string, unknown>)
                    : {};
                const mergedMetadata: Record<string, unknown> = {
                  ...baseRecord,
                  ...timingMetadata,
                };
                // 中文注释：保存当前请求的 agent 信息到 metadata。
                mergedMetadata.agent = agentMetadata;
                const baseTeatime =
                  baseRecord.teatime && typeof baseRecord.teatime === "object" && !Array.isArray(baseRecord.teatime)
                    ? (baseRecord.teatime as Record<string, unknown>)
                    : {};
                const timingTeatime =
                  timingMetadata.teatime && typeof timingMetadata.teatime === "object"
                    ? (timingMetadata.teatime as Record<string, unknown>)
                    : {};
                mergedMetadata.teatime = { ...baseTeatime, ...timingTeatime };
                await chatRepository.saveMessageNode({
                  sessionId: currentSessionId,
                  message: {
                    ...(responseMessage as any),
                    id: assistantMessageId,
                    metadata: mergeMetadataWithAbortInfo(mergedMetadata, {
                      isAborted,
                      finishReason,
                    }),
                  } as any,
                  parentMessageId: userNode.id,
                  allowEmpty: isAborted,
                  createdAt: requestStartAt,
                });
              } catch (err) {
                logger.error({ err }, "[chat] save assistant failed");
              } finally {
                popAgentFrameOnce();
              }
            },
          });

          // 直接 merge agent stream；前端审批（addToolApprovalResponse）后再次请求即可继续执行。
          writer.merge(uiStream as any);
        } catch (err) {
          popAgentFrameOnce();
          throw err;
        }
      },
    });

    // 中文注释：直接返回 SSE stream，不做断线续传缓存。
    const sseStream = stream.pipeThrough(new JsonToSseTransformStream());
    return new Response(sseStream as any, { headers: UI_MESSAGE_STREAM_HEADERS });
  });

}
