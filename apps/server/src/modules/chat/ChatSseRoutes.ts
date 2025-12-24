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
import { manualStopToolDef } from "@teatime-ai/api/types/tools/system";
import { createMasterAgentRunner } from "@/ai";
import { resolveChatModel } from "@/ai/resolveChatModel";
import { streamStore } from "@/modules/chat/StreamStoreAdapter";
import { chatRepository } from "@/modules/chat/ChatRepositoryAdapter";
import { loadMessageChain } from "@/modules/chat/loadMessageChain";
import {
  popAgentFrame,
  pushAgentFrame,
  getSessionId,
  setAbortSignal,
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
}) {
  await saveErrorMessage(input);

  // 中文注释：用最小 UIMessageChunk 输出错误文本，让前端可见。
  await streamStore.append(
    input.sessionId,
    toSseChunk({ type: "start", messageId: input.assistantMessageId }),
  );
  await streamStore.append(
    input.sessionId,
    toSseChunk({ type: "text-start", id: input.assistantMessageId }),
  );
  await streamStore.append(
    input.sessionId,
    toSseChunk({ type: "text-delta", id: input.assistantMessageId, delta: input.errorText }),
  );
  await streamStore.append(
    input.sessionId,
    toSseChunk({ type: "text-end", id: input.assistantMessageId }),
  );
  await streamStore.append(
    input.sessionId,
    toSseChunk({ type: "finish", finishReason: "error" }),
  );
  await streamStore.finalize(input.sessionId);
}

/**
 * Emits a manual-stop data chunk so the UI can show a stop marker.
 */
async function emitManualStopChunk(streamId: string, reason?: string) {
  const toolCallId = `manual-stop-${generateId()}`;
  // 通过 data part 追加“手动中断”标记，保证前端可见且可回放。
  await streamStore.append(
    streamId,
    toSseChunk({
      type: "data-manual-stop",
      data: {
        toolCallId,
        reason: reason || "用户手动中断",
        toolName: manualStopToolDef.id,
      },
    }),
  );
  return toolCallId;
}

/**
 * Chat SSE 路由（MVP）：
 * - POST /chat/sse：创建并开始生成
 * - GET  /chat/sse/:id/stream：断线续传
 * - POST /chat/sse/:id/stop：停止生成
 */
export function registerChatSseRoutes(app: Hono) {
  app.post("/chat/sse", async (c) => {
    let body: ChatRequestBody;
    try {
      body = (await c.req.json()) as ChatRequestBody;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const sessionId = body.sessionId ?? body.id;
    if (!sessionId) return c.json({ error: "sessionId is required" }, 400);

    const cookies = getCookie(c) || {};

    setRequestContext({
      sessionId,
      cookies,
      clientId: body.clientId || undefined,
      tabId: body.tabId || undefined,
    });

    const abortController = new AbortController();
    await streamStore.start(sessionId, abortController);

    const requestStartAt = new Date();

    const incomingMessages = (body.messages ?? []) as UIMessage[];
    // AI SDK 的 useChat 会把本次生成的 messageId 传给服务端；续跑/审批继续应复用同一个 messageId，以便在 UI 侧作为同一条 assistant message 继续更新。
    const assistantMessageId =
      typeof body.messageId === "string" && body.messageId ? body.messageId : generateId();
    streamStore.setAssistantMessageId(sessionId, assistantMessageId);

    // 前端只发送最后一条消息；后端通过 messageId + parentMessageId 从 DB 补全完整链路再喂给 agent。
    const last = incomingMessages.at(-1) as any;
    if (!last || !last.role || !last.id) {
      await respondWithErrorStream({
        sessionId,
        assistantMessageId,
        parentMessageId: await chatRepository.resolveSessionRightmostLeafId(sessionId),
        errorText: "请求无效：缺少最后一条消息。",
      });
      const subscription = await streamStore.subscribe(sessionId);
      if (!subscription) return c.json({ error: "stream not found" }, 404);
      return new Response(subscription as any, { headers: UI_MESSAGE_STREAM_HEADERS });
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
          await respondWithErrorStream({
            sessionId,
            assistantMessageId,
            parentMessageId: await chatRepository.resolveSessionRightmostLeafId(sessionId),
            errorText: "请求无效：assistant 缺少 parentMessageId。",
          });
          const subscription = await streamStore.subscribe(sessionId);
          if (!subscription) return c.json({ error: "stream not found" }, 404);
          return new Response(subscription as any, { headers: UI_MESSAGE_STREAM_HEADERS });
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
        await respondWithErrorStream({
          sessionId,
          assistantMessageId,
          parentMessageId: await chatRepository.resolveSessionRightmostLeafId(sessionId),
          errorText: "请求无效：不支持的消息角色。",
        });
        const subscription = await streamStore.subscribe(sessionId);
        if (!subscription) return c.json({ error: "stream not found" }, 404);
        return new Response(subscription as any, { headers: UI_MESSAGE_STREAM_HEADERS });
      }
    } catch (err) {
      logger.error({ err }, "[chat] save last message failed");
      await respondWithErrorStream({
        sessionId,
        assistantMessageId,
        parentMessageId: await chatRepository.resolveSessionRightmostLeafId(sessionId),
        errorText: "请求失败：保存消息出错。",
      });
      const subscription = await streamStore.subscribe(sessionId);
      if (!subscription) return c.json({ error: "stream not found" }, 404);
      return new Response(subscription as any, { headers: UI_MESSAGE_STREAM_HEADERS });
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
    if (messages.length === 0) {
      await respondWithErrorStream({
        sessionId,
        assistantMessageId,
        parentMessageId: assistantParentUserId ?? (await chatRepository.resolveSessionRightmostLeafId(sessionId)),
        errorText: "请求失败：历史消息不存在。",
      });
      const subscription = await streamStore.subscribe(sessionId);
      if (!subscription) return c.json({ error: "stream not found" }, 404);
      return new Response(subscription as any, { headers: UI_MESSAGE_STREAM_HEADERS });
    }
    if (!assistantParentUserId) {
      await respondWithErrorStream({
        sessionId,
        assistantMessageId,
        parentMessageId: await chatRepository.resolveSessionRightmostLeafId(sessionId),
        errorText: "请求失败：找不到父消息。",
      });
      const subscription = await streamStore.subscribe(sessionId);
      if (!subscription) return c.json({ error: "stream not found" }, 404);
      return new Response(subscription as any, { headers: UI_MESSAGE_STREAM_HEADERS });
    }

    let masterAgent: ReturnType<typeof createMasterAgentRunner>;
    let agentMetadata: Record<string, unknown> = {};
    // 中文注释：优先使用请求传入的 chatModelId，失败后按 fallback 规则选择模型。
    try {
      const resolved = await resolveChatModel({
        chatModelId: body.chatModelId,
        chatModelSource: body.chatModelSource,
      });
      masterAgent = createMasterAgentRunner({
        model: resolved.model,
        modelInfo: resolved.modelInfo,
      });
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
      await respondWithErrorStream({
        sessionId,
        assistantMessageId,
        parentMessageId: assistantParentUserId,
        errorText,
      });
      const subscription = await streamStore.subscribe(sessionId);
      if (!subscription) return c.json({ error: "stream not found" }, 404);
      return new Response(subscription as any, { headers: UI_MESSAGE_STREAM_HEADERS });
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
      originalMessages: messages as any[],
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
            uiMessages: messages as any[],
            // 启用 persistence mode（对齐 AI SDK 官方 needsApproval 流程的“两次调用”）。
            // 第二次调用会直接产出 tool-output-*（复用同一个 toolCallId）；必须基于 originalMessages 的 tool invocation 才能正确更新状态。
            originalMessages: messages as any[],
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

                if (isAborted) {
                  const parts = Array.isArray((responseMessage as any).parts)
                    ? (responseMessage as any).parts
                    : [];
                  // 中文注释：手动中断时追加标记，确保历史回放可见。
                  parts.push({
                    type: "data-manual-stop",
                    data: {
                      toolCallId: `manual-stop-${generateId()}`,
                      reason: "用户手动中断",
                      toolName: manualStopToolDef.id,
                    },
                  });
                  (responseMessage as any).parts = parts;
                }

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

    // 将 UIMessageChunk 流转成 SSE 字符串并写入内存流，避免 tee() 导致的断线竞态。
    const sseStream = stream.pipeThrough(new JsonToSseTransformStream());
    const reader = sseStream.getReader();
    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            await streamStore.finalize(sessionId);
            return;
          }
          if (typeof value === "string") await streamStore.append(sessionId, value);
        }
      } catch (err) {
        logger.error({ err }, "[chat] pump sse stream failed");
        await streamStore.finalize(sessionId);
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // ignore
        }
      }
    })();

    const subscription = await streamStore.subscribe(sessionId);
    if (!subscription) return new Response(null, { status: 204 });
    return new Response(subscription as any, { headers: UI_MESSAGE_STREAM_HEADERS });
  });

  app.get("/chat/sse/:id/stream", async (c) => {
    const streamId = c.req.param("id");
    const stream = await streamStore.subscribe(streamId);
    if (!stream) return new Response(null, { status: 204 });
    return new Response(stream as any, { headers: UI_MESSAGE_STREAM_HEADERS });
  });

  app.post("/chat/sse/:id/stop", async (c) => {
    const streamId = c.req.param("id");
    await emitManualStopChunk(streamId);
    const ok = await streamStore.stop(streamId);
    return c.json({ ok });
  });
}
