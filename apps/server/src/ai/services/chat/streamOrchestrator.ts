/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import {
  createUIMessageStream,
  JsonToSseTransformStream,
  smoothStream,
  UI_MESSAGE_STREAM_HEADERS,
  type UIMessage,
} from "ai";
import { logger } from "@/common/logger";
import type { ChatMessageKind, TokenUsage } from "@openloaf/api";
import {
  getCliSummary,
  getSessionId,
  getPlanUpdate,
  popAgentFrame,
  pushAgentFrame,
  setAbortSignal,
  setUiWriter,
} from "@/ai/shared/context/requestContext";
import { prisma } from "@openloaf/db";
import { setCachedCcSession } from "@/ai/models/cli/claudeCode/claudeCodeSessionStore";
import type { MasterAgentRunner } from "@/ai/services/masterAgentRunner";
import { buildModelMessages } from "@/ai/shared/messageConverter";
import {
  appendMessagePart,
  clearSessionErrorMessage,
  saveMessage,
  setSessionErrorMessage,
} from "@/ai/services/chat/repositories/messageStore";
import { buildBranchLogMessages } from "@/ai/services/chat/chatHistoryLogMessageBuilder";
import { buildTokenUsageMetadata, buildTimingMetadata, mergeAbortMetadata } from "./metadataBuilder";

type ToolResultPayload = {
  timed_out?: boolean;
  timedOut?: boolean;
  completed_id?: string | null;
  completedId?: string | null;
  status?: Record<string, unknown>;
};

/** 构建错误 SSE 响应的输入。 */
type ErrorStreamInput = {
  /** Session id. */
  sessionId: string;
  /** Assistant message id. */
  assistantMessageId: string;
  /** Parent message id. */
  parentMessageId: string | null;
  /** Error text to display. */
  errorText: string;
};

/** 构建主聊天流响应的输入。 */
type ChatStreamResponseInput = {
  /** Session id. */
  sessionId: string;
  /** Assistant message id. */
  assistantMessageId: string;
  /** Parent user message id. */
  parentMessageId: string;
  /** Request start time. */
  requestStartAt: Date;
  /** Model-ready messages. */
  modelMessages: UIMessage[];
  /** Agent runner. */
  agentRunner: MasterAgentRunner;
  /** Agent metadata for persistence. */
  agentMetadata: Record<string, unknown>;
  /** Abort controller. */
  abortController: AbortController;
  /** Optional assistant message kind override. */
  assistantMessageKind?: ChatMessageKind;
};

/** 构建图片 SSE 响应的输入。 */
type ImageStreamResponseInput = {
  /** Session id. */
  sessionId: string;
  /** Assistant message id. */
  assistantMessageId: string;
  /** Parent user message id. */
  parentMessageId: string;
  /** Request start time. */
  requestStartAt: Date;
  /** 改写后的提示词。 */
  revisedPrompt?: string;
  /** Image parts to emit. */
  imageParts: Array<{ type: "file"; url: string; mediaType: string }>;
  /** 用于落库的图片 part。 */
  persistedImageParts?: Array<{ type: "file"; url: string; mediaType: string }>;
  /** Agent metadata for persistence. */
  agentMetadata: Record<string, unknown>;
  /** Token usage for metadata. */
  totalUsage?: TokenUsage;
};

/** Parse tool result payload for transient detection. */
function parseToolResultPayload(result: unknown): ToolResultPayload | null {
  if (!result) return null;
  if (typeof result === "object") return result as ToolResultPayload;
  if (typeof result !== "string") return null;
  try {
    const parsed = JSON.parse(result) as ToolResultPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Check whether wait-agent result should be marked as transient. */
function shouldMarkWaitAgentTransient(payload: ToolResultPayload | null): boolean {
  if (!payload) return false;
  // 中文注释：wait-agent 超时（仍在运行）时标记为 transient。
  if (payload.timed_out === true || payload.timedOut === true) return true;
  const completedId =
    typeof payload.completed_id === "string"
      ? payload.completed_id.trim()
      : typeof payload.completedId === "string"
        ? payload.completedId.trim()
        : "";
  if (completedId) return false;
  // 中文注释：completedId 为空且存在 running 状态时，视为仍在运行。
  if (payload.status && typeof payload.status === "object") {
    const statuses = Object.values(payload.status);
    return statuses.some((value) => String(value).toLowerCase() === "running");
  }
  return false;
}

/** Annotate tool-result chunks with transient flag. */
function applyTransientFlag(chunk: any): any {
  if (!chunk || typeof chunk !== "object") return chunk;
  if (chunk.type !== "tool-result") return chunk;
  const toolName = typeof chunk.toolName === "string" ? chunk.toolName : "";
  if (toolName !== "wait-agent") return chunk;
  const payload = parseToolResultPayload(chunk.output ?? chunk.result);
  if (!shouldMarkWaitAgentTransient(payload)) return chunk;
  return { ...chunk, isTransient: true };
}

/** Annotate response parts with transient flag for persistence. */
function applyTransientFlagToParts(parts: unknown[]): unknown[] {
  if (!Array.isArray(parts)) return parts;
  return parts.map((part) => {
    if (!part || typeof part !== "object") return part;
    const rawType = typeof (part as any).type === "string" ? String((part as any).type) : "";
    const toolName =
      typeof (part as any).toolName === "string"
        ? String((part as any).toolName)
        : rawType.startsWith("tool-")
          ? rawType.slice("tool-".length)
          : "";
    if (toolName !== "wait-agent") return part;
    const payload = parseToolResultPayload((part as any).output ?? (part as any).result);
    if (!shouldMarkWaitAgentTransient(payload)) return part;
    return { ...(part as any), isTransient: true };
  });
}

/** 构建错误 SSE 响应。 */
export async function createErrorStreamResponse(input: ErrorStreamInput): Promise<Response> {
  await saveErrorMessage(input);
  const body = [
    toSseChunk({ type: "start", messageId: input.assistantMessageId }),
    toSseChunk({ type: "text-start", id: input.assistantMessageId }),
    toSseChunk({ type: "text-delta", id: input.assistantMessageId, delta: input.errorText }),
    toSseChunk({ type: "text-end", id: input.assistantMessageId }),
    toSseChunk({ type: "finish", finishReason: "error" }),
  ].join("");
  return new Response(body, { headers: UI_MESSAGE_STREAM_HEADERS });
}

/** Agent route ack input. */
type AgentRouteAckInput = {
  sessionId: string;
  assistantMessageId: string;
  parentMessageId: string | null;
  ackText: string;
};

/** 构建 @agents/ 路由确认的轻量 SSE 响应。 */
export async function createAgentRouteAckResponse(input: AgentRouteAckInput): Promise<Response> {
  await saveMessage({
    sessionId: input.sessionId,
    parentMessageId: input.parentMessageId,
    message: {
      id: input.assistantMessageId,
      parentMessageId: input.parentMessageId,
      role: "assistant" as const,
      messageKind: "normal" as const,
      parts: [{ type: "text" as const, text: input.ackText }],
      metadata: {},
    },
  });
  const body = [
    toSseChunk({ type: "start", messageId: input.assistantMessageId }),
    toSseChunk({ type: "text-start", id: input.assistantMessageId }),
    toSseChunk({ type: "text-delta", id: input.assistantMessageId, delta: input.ackText }),
    toSseChunk({ type: "text-end", id: input.assistantMessageId }),
    toSseChunk({ type: "finish", finishReason: "stop" }),
  ].join("");
  return new Response(body, { headers: UI_MESSAGE_STREAM_HEADERS });
}

/** 构建聊天流 SSE 响应。 */
export async function createChatStreamResponse(input: ChatStreamResponseInput): Promise<Response> {
  const popAgentFrameOnce = (() => {
    let popped = false;
    return () => {
      if (popped) return;
      popped = true;
      popAgentFrame();
    };
  })();

  const stream = createUIMessageStream({
    originalMessages: input.modelMessages as any[],
    onError: (err) => {
      // 只记录一次错误，避免 SDK 内部重复日志。
      logger.error({ err }, "[chat] ui stream error");
      if (input.abortController.signal.aborted) return "aborted";
      void saveErrorMessage({
        sessionId: input.sessionId,
        assistantMessageId: input.assistantMessageId,
        parentMessageId: input.parentMessageId,
        errorText: err instanceof Error ? err.message : "Unknown error",
      }).catch((error) => {
        logger.error({ err: error }, "[chat] save stream error failed");
      });
      return err instanceof Error ? err.message : "Unknown error";
    },
    execute: async ({ writer }) => {
      setUiWriter(writer as any);
      setAbortSignal(input.abortController.signal);
      pushAgentFrame(input.agentRunner.frame);

      try {
        const modelMessages = await buildModelMessages(
          input.modelMessages as UIMessage[],
          input.agentRunner.agent.tools,
        );
        const agentStream = await input.agentRunner.agent.stream({
          messages: modelMessages,
          abortSignal: input.abortController.signal,
          experimental_transform: smoothStream({
            delayInMs: 10,
            chunking: new Intl.Segmenter("zh", { granularity: "word" }),
          }),
        });
        const uiStream = agentStream.toUIMessageStream({
          originalMessages: input.modelMessages as any[],
          generateMessageId: () => input.assistantMessageId,
          messageMetadata: ({ part }) => {
            const usageMetadata = buildTokenUsageMetadata(part);
            if (part?.type !== "finish") return usageMetadata;
            const timingMetadata = buildTimingMetadata({
              startedAt: input.requestStartAt,
              finishedAt: new Date(),
            });
            const mergedMetadata: Record<string, unknown> = {
              ...(usageMetadata ?? {}),
              ...timingMetadata,
            };
            if (Object.keys(input.agentMetadata).length > 0) {
              mergedMetadata.agent = input.agentMetadata;
            }
            // CLI provider 传回的 SDK UUID（用于 rewind/resume）
            const sdkMeta = (part as any)?.providerMetadata;
            if (sdkMeta?.sdkAssistantUuid) {
              mergedMetadata.sdkAssistantUuid = sdkMeta.sdkAssistantUuid;
            }
            if (sdkMeta?.sdkSessionId) {
              mergedMetadata.sdkSessionId = sdkMeta.sdkSessionId;
            }
            return mergedMetadata;
          },
          onFinish: async ({ isAborted, responseMessage, finishReason }) => {
            try {
              if (!responseMessage || responseMessage.role !== "assistant") return;

              const currentSessionId = getSessionId() ?? input.sessionId;
              const timingMetadata = buildTimingMetadata({
                startedAt: input.requestStartAt,
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
                agent: input.agentMetadata,
              };
              const cliSummary = getCliSummary();
              if (cliSummary) {
                mergedMetadata.cliSummary = cliSummary;
              }
              const planUpdate = getPlanUpdate();
              if (planUpdate) {
                // 逻辑：将本次请求的 plan 挂到 assistant metadata，方便后续回放。
                mergedMetadata.plan = planUpdate;
              }

              const finalizedMetadata =
                mergeAbortMetadata(mergedMetadata, { isAborted, finishReason }) ?? {};
              const baseParts = applyTransientFlagToParts((responseMessage as any).parts ?? []);

              // 注入 CLI 摘要 part，使刷新后仍可显示 CLI 执行历史。
              if (cliSummary) {
                (baseParts as any[]).push({
                  type: "tool-cli-thinking",
                  toolCallId: "cc-summary",
                  toolName: "cli-thinking",
                  variant: "cli-thinking",
                  title: "CLI 输出",
                  output: cliSummary,
                  state: "output-available",
                });
              }

              const normalizedResponseMessage = {
                ...(responseMessage as any),
                parts: baseParts,
              } as UIMessage;
              const branchLogMessages = buildBranchLogMessages({
                modelMessages: input.modelMessages as UIMessage[],
                assistantResponseMessage: normalizedResponseMessage as UIMessage,
                assistantMessageId: input.assistantMessageId,
                parentMessageId: input.parentMessageId,
                metadata: finalizedMetadata,
                assistantMessageKind: input.assistantMessageKind,
              });
              const finalizedAssistantMessage = branchLogMessages.at(-1);

              await saveMessage({
                sessionId: currentSessionId,
                message: (finalizedAssistantMessage as any) ?? {
                  ...(responseMessage as any),
                  id: input.assistantMessageId,
                  metadata: finalizedMetadata,
                },
                parentMessageId: input.parentMessageId,
                allowEmpty: isAborted,
                createdAt: input.requestStartAt,
              });
              if (!isAborted && finishReason !== "error") {
                // 中文注释：仅在成功完成时清空会话错误。
                await clearSessionErrorMessage({ sessionId: currentSessionId });
              }

              // SDK 返回的真正 session ID 更新到 DB（CLI persist/resume）
              const sdkSessionId = (finalizedMetadata as any)?.sdkSessionId as string | undefined;
              if (sdkSessionId && currentSessionId) {
                try {
                  await prisma.chatSession.update({
                    where: { id: currentSessionId },
                    data: { cliId: `claude-code_${sdkSessionId}` },
                  });
                  setCachedCcSession(currentSessionId, {
                    sdkSessionId,
                    modelId: "",
                    lastUsedAt: Date.now(),
                  });
                } catch (err) {
                  logger.warn({ err, sessionId: currentSessionId }, "[chat] update SDK session ID failed");
                }
              }
            } catch (err) {
              logger.error({ err }, "[chat] save assistant failed");
            } finally {
              popAgentFrameOnce();
            }
          },
        });

        // 逻辑：拦截 step 事件，通过 writer.write() + transient 发送思考信号，
        // 避免 data-step-thinking 被累积到 responseMessage.parts 中持久化。
        const wrappedStream = (uiStream as ReadableStream).pipeThrough(
          new TransformStream({
            transform(chunk: any, controller) {
              const normalized = applyTransientFlag(chunk);
              controller.enqueue(normalized);
              const type = chunk?.type;
              if (type === "finish-step") {
                writer.write({ type: "data-step-thinking", data: { active: true }, transient: true } as any);
              } else if (type === "start-step" || type === "finish") {
                writer.write({ type: "data-step-thinking", data: { active: false }, transient: true } as any);
              }
            },
          }),
        );
        writer.merge(wrappedStream as any);
      } catch (err) {
        popAgentFrameOnce();
        throw err;
      }
    },
  });

  const sseStream = stream.pipeThrough(new JsonToSseTransformStream());
  return new Response(sseStream as any, { headers: UI_MESSAGE_STREAM_HEADERS });
}

/** 构建图片输出的 SSE 响应。 */
export async function createImageStreamResponse(
  input: ImageStreamResponseInput,
): Promise<Response> {
  const timingMetadata = buildTimingMetadata({
    startedAt: input.requestStartAt,
    finishedAt: new Date(),
  });
  const usageMetadata = input.totalUsage ? { totalUsage: input.totalUsage } : {};
  const mergedMetadata: Record<string, unknown> = {
    ...usageMetadata,
    ...timingMetadata,
    ...(Object.keys(input.agentMetadata).length > 0 ? { agent: input.agentMetadata } : {}),
  };

  const revisedPromptPart = input.revisedPrompt
    ? [
        {
          type: "data-revised-prompt" as const,
          data: { text: input.revisedPrompt },
        },
      ]
    : [];
  const persistedImageParts = input.persistedImageParts ?? input.imageParts;
  const messageParts = [...persistedImageParts, ...revisedPromptPart];

  await saveMessage({
    sessionId: input.sessionId,
    message: {
      id: input.assistantMessageId,
      role: "assistant",
      parts: messageParts,
      metadata: mergedMetadata,
    } as any,
    parentMessageId: input.parentMessageId,
    allowEmpty: false,
    createdAt: input.requestStartAt,
  });
  // 中文注释：图片生成成功后清空会话错误。
  await clearSessionErrorMessage({ sessionId: input.sessionId });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const enqueueChunk = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };

      enqueueChunk(toSseChunk({ type: "start", messageId: input.assistantMessageId }));
      // 中文注释：逐条推送图片事件，确保前端能及时更新预览。
      for (const part of persistedImageParts) {
        enqueueChunk(toSseChunk({ type: "file", url: part.url, mediaType: part.mediaType }));
      }
      for (const part of revisedPromptPart) {
        enqueueChunk(toSseChunk({ type: part.type, data: part.data }));
      }
      enqueueChunk(
        toSseChunk({ type: "finish", finishReason: "stop", messageMetadata: mergedMetadata }),
      );
      controller.close();
    },
  });
  return new Response(stream, { headers: UI_MESSAGE_STREAM_HEADERS });
}

/** 持久化错误消息到消息树。 */
async function saveErrorMessage(input: ErrorStreamInput) {
  const part = { type: "text", text: input.errorText, state: "done" };
  // 中文注释：错误文本写入会话，保证刷新后仍可见。
  await setSessionErrorMessage({ sessionId: input.sessionId, errorMessage: input.errorText });
  const appended = await appendMessagePart({
    sessionId: input.sessionId,
    messageId: input.assistantMessageId,
    part,
    messageKind: "error",
  });
  if (appended) return;
  if (!input.parentMessageId) return;
  // 找不到目标消息时，新建一条 assistant 错误消息。
  await saveMessage({
    sessionId: input.sessionId,
    message: {
      id: input.assistantMessageId,
      role: "assistant",
      parts: [part],
      messageKind: "error",
    } as any,
    parentMessageId: input.parentMessageId,
    allowEmpty: false,
  });
}

/** 将 JSON 转为 SSE chunk。 */
function toSseChunk(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}
