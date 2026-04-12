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
  type InferUIMessageChunk,
  JsonToSseTransformStream,
  type ModelMessage,
  smoothStream,
  UI_MESSAGE_STREAM_HEADERS,
  type UIMessage,
} from "ai";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { backgroundProcessManager } from "@/ai/services/background/BackgroundProcessManager";
import { logger } from "@/common/logger";
import type { ChatMessageKind, OpenLoafUIMessage, TokenUsage } from "@openloaf/api";
import { readBasicConf } from "@/modules/settings/openloafConfStore";
import { resolveMessagesJsonlPath } from "@/ai/services/chat/repositories/chatFileStore";
import {
  getCliSummary,
  getSessionId,
  getPlanUpdate,
  getCurrentPlanNo,
  setCurrentPlanNo,
  markPlanNoAllocated,
  popAgentFrame,
  pushAgentFrame,
  setAbortSignal,
  setUiWriter,
} from "@/ai/shared/context/requestContext";
import { savePlanFile, markPlanFileStatus } from "@/ai/services/chat/planFileService";
import { prisma } from "@openloaf/db";
import { setCachedCcSession } from "@/ai/models/cli/claudeCode/claudeCodeSessionStore";
import type { MasterAgentRunner } from "@/ai/services/masterAgentRunner";
import { toSseChunk } from "@/ai/services/chat/chatStreamUtils";
import { buildModelMessages } from "@/ai/shared/messageConverter";
import { getChatViewFromFile } from "@/ai/services/chat/repositories/chatFileStore";
import {
  appendMessagePart,
  clearSessionErrorMessage,
  saveMessage,
  setSessionErrorMessage,
  type UIMessageLike,
} from "@/ai/services/chat/repositories/messageStore";
import { buildBranchLogMessages } from "@/ai/services/chat/chatHistoryLogMessageBuilder";
import { buildTokenUsageMetadata, buildTimingMetadata, mergeAbortMetadata } from "./metadataBuilder";
import { APICallError } from "@ai-sdk/provider";

/** 从 AI SDK 错误中提取用户可读的错误信息（优先使用 responseBody 中的详情）。 */
function extractErrorText(err: unknown): string {
  if (APICallError.isInstance(err)) {
    if (err.responseBody) {
      try {
        const body = JSON.parse(err.responseBody) as Record<string, unknown>;
        const msg = typeof body.error === "string"
          ? body.error
          : typeof (body.error as Record<string, unknown>)?.message === "string"
            ? (body.error as Record<string, unknown>).message as string
            : typeof body.message === "string"
              ? body.message
              : undefined;
        if (msg) return msg;
      } catch {
        return err.responseBody;
      }
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

type ToolResultPayload = {
  timed_out?: boolean;
  timedOut?: boolean;
  completed_id?: string | null;
  completedId?: string | null;
  status?: Record<string, unknown>;
};

/**
 * CLI provider 在 finish-step 事件 providerMetadata 中注入的业务字段。
 * SDK 的 TextStreamPart['finish-step'] 已包含 providerMetadata，但其类型
 * 为 ProviderMetadata（索引签名），我们在此显式声明预期的业务 key。
 */
type CliProviderMetadata = {
  sdkAssistantUuid?: string;
  sdkSessionId?: string;
  [key: string]: unknown;
};

/**
 * messageMetadata 回调中 part 的 providerMetadata 形状（仅 CLI provider 注入）。
 * part 类型是 TextStreamPart<ToolSet>，其 finish-step 成员包含 providerMetadata。
 * 通过此接口明确字段，避免 as any。
 */
type PartWithCliProviderMeta = {
  type: string;
  providerMetadata?: CliProviderMetadata;
  [key: string]: unknown;
};

/**
 * CLI thinking part：在流完成后注入到 baseParts 中，
 * 使刷新后仍可显示 CLI 执行历史。
 */
type CliThinkingPart = {
  type: "tool-cli-thinking";
  toolCallId: string;
  toolName: string;
  variant: string;
  title: string;
  output: unknown;
  state: string;
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
  /** Continue mode: partial assistant parts to replay before model stream. */
  replayParts?: unknown[];
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

/** Check whether Agent result should be marked as transient (async mode with running agents). */
function shouldMarkAgentTransient(payload: ToolResultPayload | null): boolean {
  if (!payload) return false;
  // 中文注释：Agent 异步模式超时（仍在运行）时标记为 transient。
  if (payload.timed_out === true || payload.timedOut === true) return true;
  const completedId =
    typeof payload.completed_id === "string"
      ? payload.completed_id.trim()
      : typeof payload.completedId === "string"
        ? payload.completedId.trim()
        : "";
  if (completedId) return false;
  // 中文注释：Agent 异步模式下 completedId 为空且存在 running 状态时，视为仍在运行。
  if (payload.status && typeof payload.status === "object") {
    const statuses = Object.values(payload.status);
    return statuses.some((value) => String(value).toLowerCase() === "running");
  }
  return false;
}

/** Annotate tool-result chunks with transient flag. */
function applyTransientFlag(chunk: Record<string, unknown>): Record<string, unknown> {
  if (!chunk || typeof chunk !== "object") return chunk;
  if (chunk.type !== "tool-result") return chunk;
  const toolName = typeof chunk.toolName === "string" ? chunk.toolName : "";
  if (toolName !== "Agent") return chunk;
  const payload = parseToolResultPayload(chunk.output ?? chunk.result);
  if (!shouldMarkAgentTransient(payload)) return chunk;
  return { ...chunk, isTransient: true };
}

/** Annotate response parts with transient flag for persistence. */
function applyTransientFlagToParts(parts: unknown[]): unknown[] {
  if (!Array.isArray(parts)) return parts;
  return parts.map((part) => {
    if (!part || typeof part !== "object") return part;
    const p = part as Record<string, unknown>;
    const rawType = typeof p.type === "string" ? String(p.type) : "";
    const toolName =
      typeof p.toolName === "string"
        ? String(p.toolName)
        : rawType.startsWith("tool-")
          ? rawType.slice("tool-".length)
          : "";
    if (toolName !== "Agent") return part;
    const payload = parseToolResultPayload(p.output ?? p.result);
    if (!shouldMarkAgentTransient(payload)) return part;
    return { ...p, isTransient: true };
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type boundary: OpenLoafUIMessage[] is structurally compatible but generic inference requires any[]
    originalMessages: input.modelMessages as any[],
    onError: (err) => {
      // 只记录一次错误，避免 SDK 内部重复日志。
      logger.error({ err }, "[chat] ui stream error");
      if (input.abortController.signal.aborted) {
        return "aborted";
      }
      const errorText = extractErrorText(err);
      void saveErrorMessage({
        sessionId: input.sessionId,
        assistantMessageId: input.assistantMessageId,
        parentMessageId: input.parentMessageId,
        errorText,
      }).catch((error) => {
        logger.error({ err: error }, "[chat] save stream error failed");
      });
      return errorText;
    },
    execute: async ({ writer }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type boundary: writer generic param is constrained to UIMessage but setUiWriter accepts UIMessageStreamWriter<any>
      setUiWriter(writer as any);
      setAbortSignal(input.abortController.signal);
      pushAgentFrame(input.agentRunner.frame);

      try {
        // ─── While-loop state (P2: end-of-turn drain + synthetic user message) ───
        // After each turn finishes we drain pending bg-task notifications and,
        // if any are present, inject a synthetic user message and spin another
        // turn so the AI absorbs completion events without the user having to
        // type anything.
        let uiHistoryMessages: UIMessage[] = input.modelMessages as UIMessage[];
        let modelMessages = await buildModelMessages(
          uiHistoryMessages,
          input.agentRunner.agent.tools,
        );
        let currentAssistantMessageId = input.assistantMessageId;
        let currentParentMessageId: string | null = input.parentMessageId;
        let currentTurnStartedAt: Date = input.requestStartAt;

        const MAX_BG_NOTIFICATIONS = 20;
        const BG_TURN_DEADLINE_MS = 60_000;
        let totalBgDrained = 0;
        const bgLoopStartMs = Date.now();

        // AI 调试模式 — 每步 LLM 请求/响应实时写入独立文件
        const isDebugMode = readBasicConf().chatPrefaceEnabled;
        const debugSessionId = input.sessionId;
        const debugAttemptTag = (() => {
          const now = new Date();
          const hh = String(now.getHours()).padStart(2, "0");
          const mm = String(now.getMinutes()).padStart(2, "0");
          const ss = String(now.getSeconds()).padStart(2, "0");
          return `${hh}${mm}${ss}`;
        })();

        // ── Continue mode: 回放 partial assistant 的旧 parts ──
        let replayDone = false;

        // eslint-disable-next-line no-constant-condition -- intentional: end-of-turn drain loop, exit via break
        while (true) {
        const localAssistantId = currentAssistantMessageId;
        const localParentId = currentParentMessageId;
        const localStartedAt = currentTurnStartedAt;
        const localUiHistory = uiHistoryMessages;
        const debugMessageId = localAssistantId;

        // 首次迭代时回放 partial assistant 的旧 parts，使前端看到完整的历史内容
        if (!replayDone && input.replayParts && input.replayParts.length > 0) {
          replayDone = true;
          for (const part of input.replayParts) {
            if (!part || typeof part !== "object") continue;
            const p = part as Record<string, unknown>;
            const type = typeof p.type === "string" ? p.type : "";

            if (type === "text" && typeof p.text === "string" && p.text) {
              writer.write({ type: "text-delta", textDelta: p.text } as any);
            } else if (p.toolCallId && p.toolName) {
              // 回放完整的工具调用
              writer.write({
                type: "tool-call",
                toolCallId: p.toolCallId,
                toolName: p.toolName,
                args: p.input ?? p.args ?? {},
              } as any);
              // 回放工具结果（如果有）
              if (p.output !== undefined || p.result !== undefined) {
                writer.write({
                  type: "tool-result",
                  toolCallId: p.toolCallId,
                  result: p.output ?? p.result,
                } as any);
              }
            }
          }
        }

        const agentStream = await input.agentRunner.agent.stream({
          messages: modelMessages,
          abortSignal: input.abortController.signal,
          experimental_transform: smoothStream({
            delayInMs: 10,
            chunking: new Intl.Segmenter("zh", { granularity: "word" }),
          }),
          ...(isDebugMode ? {
            experimental_onStepStart: (event: any) => {
              void writeDebugStepFile({
                sessionId: debugSessionId,
                assistantMessageId: debugMessageId,
                attemptTag: debugAttemptTag,
                stepNumber: event.stepNumber,
                kind: "request",
                data: {
                  stepNumber: event.stepNumber,
                  model: event.model,
                  system: event.system,
                  messages: event.messages,
                  activeTools: event.activeTools,
                  toolChoice: event.toolChoice,
                },
              });
            },
            onStepFinish: (event: any) => {
              void writeDebugStepFile({
                sessionId: debugSessionId,
                assistantMessageId: debugMessageId,
                attemptTag: debugAttemptTag,
                stepNumber: event.stepNumber,
                kind: "response",
                data: {
                  stepNumber: event.stepNumber,
                  text: event.text,
                  toolCalls: event.toolCalls,
                  toolResults: event.toolResults,
                  finishReason: event.finishReason,
                  usage: event.usage,
                },
              });
            },
          } : {}),
        });
        const uiStream = agentStream.toUIMessageStream({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type boundary: see createUIMessageStream above
          originalMessages: localUiHistory as any[],
          generateMessageId: () => localAssistantId,
          messageMetadata: ({ part }) => {
            const usageMetadata = buildTokenUsageMetadata(part);
            if (part?.type !== "finish") return usageMetadata;
            const timingMetadata = buildTimingMetadata({
              startedAt: localStartedAt,
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
            // TextStreamPart 的各成员均含 providerMetadata，用 PartWithCliProviderMeta 明确字段。
            const sdkMeta = (part as unknown as PartWithCliProviderMeta).providerMetadata;
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
                startedAt: localStartedAt,
                finishedAt: new Date(),
              });
              const baseMetadata =
                responseMessage && typeof responseMessage === "object"
                  ? (responseMessage.metadata as unknown)
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
              // 检测 approval-requested 的 SubmitPlan 工具调用。
              const pendingPlanPart = (responseMessage.parts ?? []).find(
                (p: any) =>
                  (p?.toolName === "SubmitPlan" || p?.type === "tool-SubmitPlan") &&
                  p?.state === "approval-requested",
              ) as any;
              if (pendingPlanPart && !getPlanUpdate()) {
                try {
                  const planInput = pendingPlanPart.input;
                  // SubmitPlan: PLAN file already exists on disk (AI wrote it with Write tool).
                  // Resolve path via Write's resolver so it matches where AI actually wrote the file.
                  const planFilePathInput = typeof planInput?.planFilePath === "string" ? planInput.planFilePath : "";
                  if (planFilePathInput) {
                    const { readPlanFileFromAbsPath, derivePlanNoFromPath } = await import("@/ai/services/chat/planFileService");
                    const { resolveWriteTargetPath } = await import("@/ai/tools/fileTools");
                    try {
                      const { absPath } = await resolveWriteTargetPath(planFilePathInput);
                      const planNoFromPath = derivePlanNoFromPath(planFilePathInput);
                      const planData = await readPlanFileFromAbsPath(absPath, planNoFromPath);
                      if (planData) {
                        if (planNoFromPath > 0) {
                          setCurrentPlanNo(planNoFromPath);
                          markPlanNoAllocated();
                          await markPlanFileStatus(currentSessionId, planNoFromPath, "pending").catch(() => {});
                        }
                        writer.write({
                          type: "data-plan-file",
                          data: { planNo: planNoFromPath, filePath: planData.filePath, actionName: planData.actionName, status: "pending" },
                          transient: true,
                        } as unknown as InferUIMessageChunk<UIMessage>);
                      }
                    } catch (err) {
                      logger.warn({ err, sessionId: currentSessionId, planFilePathInput }, "[chat] resolve SubmitPlan file failed");
                    }
                  }
                } catch (err) {
                  logger.warn({ err, sessionId: currentSessionId }, "[chat] save pending PLAN file failed");
                }
              }

              const rawPlanUpdate = getPlanUpdate();
              if (rawPlanUpdate) {
                const planNo = getCurrentPlanNo();
                // 衍生文件写入 + 通知前端打开 stack。
                if (planNo) {
                  try {
                    const planFilePath = await savePlanFile(currentSessionId, planNo, {
                      actionName: rawPlanUpdate.actionName ?? "计划",
                      explanation: rawPlanUpdate.explanation,
                      plan: rawPlanUpdate.plan,
                      status: "active",
                    });
                    writer.write({
                      type: "data-plan-file",
                      data: {
                        planNo,
                        filePath: planFilePath,
                        actionName: rawPlanUpdate.actionName ?? "计划",
                        status: "active",
                      },
                      transient: true,
                    } as unknown as InferUIMessageChunk<UIMessage>);
                  } catch (err) {
                    logger.warn({ err, sessionId: currentSessionId, planNo }, "[chat] save PLAN file failed");
                  }
                }
              }

              const finalizedMetadata =
                mergeAbortMetadata(mergedMetadata, { isAborted, finishReason }) ?? {};
              const baseParts = applyTransientFlagToParts(responseMessage.parts ?? []);

              // 注入 CLI 摘要 part，使刷新后仍可显示 CLI 执行历史。
              if (cliSummary) {
                const cliThinkingPart: CliThinkingPart = {
                  type: "tool-cli-thinking",
                  toolCallId: "cc-summary",
                  toolName: "cli-thinking",
                  variant: "cli-thinking",
                  title: "CLI 输出",
                  output: cliSummary,
                  state: "output-available",
                };
                (baseParts as CliThinkingPart[]).push(cliThinkingPart);
              }

              // OpenLoafUIMessage extends UIMessage and adds parentMessageId / messageKind.
              // responseMessage is typed as UIMessage (SDK), so we spread via unknown to
              // carry over those extra fields that the SDK passes at runtime.
              const normalizedResponseMessage = {
                ...(responseMessage as unknown as OpenLoafUIMessage),
                parts: baseParts,
              };
              const branchLogMessages = buildBranchLogMessages({
                modelMessages: localUiHistory,
                assistantResponseMessage: normalizedResponseMessage as UIMessage,
                assistantMessageId: localAssistantId,
                parentMessageId: localParentId ?? "",
                metadata: finalizedMetadata,
                assistantMessageKind: input.assistantMessageKind,
              });
              const finalizedAssistantMessage = branchLogMessages.at(-1);

              await saveMessage({
                sessionId: currentSessionId,
                message: finalizedAssistantMessage ?? {
                  // Fallback: build a minimal UIMessageLike when buildBranchLogMessages returns nothing.
                  ...(responseMessage as unknown as OpenLoafUIMessage),
                  id: localAssistantId,
                  metadata: finalizedMetadata,
                },
                parentMessageId: localParentId,
                allowEmpty: isAborted,
                createdAt: localStartedAt,
              });
              if (!isAborted && finishReason !== "error") {
                // 中文注释：仅在成功完成时清空会话错误。
                await clearSessionErrorMessage({ sessionId: currentSessionId });
              }

              try {
                const snapshot = await getChatViewFromFile({
                  sessionId: currentSessionId,
                  anchor: { messageId: localAssistantId, strategy: "self" },
                  window: { limit: 50 },
                  includeToolOutput: true,
                });
                // 中文注释：流完成后主动下发 canonical branch snapshot，
                // 让前端用服务端真相覆盖 retry/resend 期间的本地临时切链。
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type boundary: data-branch-snapshot is a business-defined transient chunk not registered in OpenLoafUIDataTypes
                writer.write({
                  type: "data-branch-snapshot",
                  data: {
                    sessionId: currentSessionId,
                    snapshot,
                  },
                  transient: true,
                } as unknown as InferUIMessageChunk<UIMessage>);
              } catch (error) {
                logger.warn(
                  {
                    err: error,
                    sessionId: currentSessionId,
                    assistantMessageId: localAssistantId,
                  },
                  "[chat] build branch snapshot failed",
                );
              }

              // SDK 返回的真正 session ID 更新到 DB（CLI persist/resume）
              // finalizedMetadata is Record<string, unknown>; extract field with explicit cast.
              const sdkSessionId = typeof finalizedMetadata.sdkSessionId === "string"
                ? finalizedMetadata.sdkSessionId
                : undefined;
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
        // 关键：不在 start-step 时立即清除 thinking，而是等首个内容 chunk 到达后再清除，
        // 避免 start-step → 首 token 之间的空白期让用户感觉卡住。
        let stepThinkingActive = false;
        let hasPendingApproval = false;
        const CONTENT_CHUNK_TYPES = new Set([
          "text-delta",
          "reasoning",
          "tool-call-streaming-start",
          "tool-call-delta",
          "tool-call",
        ]);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type boundary: uiStream is AsyncIterableStream; pipeThrough requires ReadableStream
        const wrappedStream = (uiStream as ReadableStream<Record<string, unknown>>).pipeThrough(
          new TransformStream<Record<string, unknown>, Record<string, unknown>>({
            transform(chunk, controller) {
              const normalized = applyTransientFlag(chunk);
              controller.enqueue(normalized);
              const type = typeof chunk.type === "string" ? chunk.type : "";
              // Track pending tool approvals — if any tool needs user approval,
              // the while-loop must NOT drain notifications or start a new turn.
              if (type === "tool-approval-request") {
                hasPendingApproval = true;
              }
              type StepThinkingChunk = { type: "data-step-thinking"; data: { active: boolean }; transient: true };
              const mkStepThinking = (active: boolean): StepThinkingChunk => ({
                type: "data-step-thinking",
                data: { active },
                transient: true,
              });
              if (type === "finish-step") {
                stepThinkingActive = true;
                writer.write(mkStepThinking(true) as unknown as InferUIMessageChunk<UIMessage>);
              } else if (type === "finish") {
                stepThinkingActive = false;
                writer.write(mkStepThinking(false) as unknown as InferUIMessageChunk<UIMessage>);
              } else if (stepThinkingActive && CONTENT_CHUNK_TYPES.has(type)) {
                // 新步骤的首个内容 chunk 到达，清除思考指示器
                stepThinkingActive = false;
                writer.write(mkStepThinking(false) as unknown as InferUIMessageChunk<UIMessage>);
              }
            },
          }),
        );
        // 逻辑：手动 reader loop 代替 writer.merge —— while-loop 需要在本圈
        // 真正读完 stream（触发 toUIMessageStream.onFinish）之后才能 drain 通知
        // 并决定是否进入下一圈。writer.merge 是 fire-and-forget，不会让 execute await。
        const reader = (wrappedStream as ReadableStream<Record<string, unknown>>).getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            writer.write(value as unknown as InferUIMessageChunk<UIMessage>);
          }
        } finally {
          try {
            reader.releaseLock();
          } catch {}
        }

        // ========== End-of-turn drain ==========
        // Guard: skip drain when the turn ended with a pending tool approval.
        // The user must approve/deny before we can inject synthetic messages.
        if (hasPendingApproval) break;

        const drainSessionId = getSessionId() ?? input.sessionId;
        const notifications = backgroundProcessManager.drainNotifications(
          drainSessionId,
          "later",
        );
        if (notifications.length === 0) break;

        totalBgDrained += notifications.length;
        const exceededBudget =
          totalBgDrained > MAX_BG_NOTIFICATIONS ||
          Date.now() - bgLoopStartMs > BG_TURN_DEADLINE_MS;

        // 构造 synthetic user message — 外层 <system-reminder> 包裹内层 bg-task-notification XML
        const innerXml = notifications.map((n) => n.xmlContent).join("\n");
        const wrappedContent = `<system-reminder>\n${innerXml}\n</system-reminder>`;
        const syntheticUserId = randomUUID();
        const taskIds = notifications.map((n) => n.taskId);
        const syntheticUiMessage: UIMessageLike = {
          id: syntheticUserId,
          role: "user",
          parts: [{ type: "text", text: wrappedContent }],
          metadata: {
            openloaf: {
              syntheticKind: "bg-notification",
              isMeta: true,
              taskIds,
            },
          },
        };

        // 持久化 synthetic user message（父节点是本圈的 assistant）
        try {
          await saveMessage({
            sessionId: drainSessionId,
            message: syntheticUiMessage,
            parentMessageId: localAssistantId,
            allowEmpty: false,
          });
        } catch (persistErr) {
          logger.error(
            { err: persistErr, sessionId: drainSessionId, syntheticUserId },
            "[chat] save synthetic user message failed",
          );
        }

        // 累积到下一圈的 UI 历史 + 模型消息
        try {
          const response = await agentStream.response;
          if (Array.isArray(response?.messages) && response.messages.length > 0) {
            modelMessages = [...modelMessages, ...(response.messages as ModelMessage[])];
          }
        } catch (respErr) {
          logger.warn(
            { err: respErr, sessionId: drainSessionId },
            "[chat] read agentStream.response failed",
          );
        }
        modelMessages = [
          ...modelMessages,
          { role: "user", content: wrappedContent } as ModelMessage,
        ];
        uiHistoryMessages = [
          ...uiHistoryMessages,
          syntheticUiMessage as unknown as UIMessage,
        ];

        // 立即推一次 branch-snapshot 让前端显示 synthetic user message
        try {
          const snapshot = await getChatViewFromFile({
            sessionId: drainSessionId,
            anchor: { messageId: syntheticUserId, strategy: "self" },
            window: { limit: 50 },
            includeToolOutput: true,
          });
          writer.write({
            type: "data-branch-snapshot",
            data: { sessionId: drainSessionId, snapshot },
            transient: true,
          } as unknown as InferUIMessageChunk<UIMessage>);
        } catch (snapErr) {
          logger.warn(
            { err: snapErr, sessionId: drainSessionId, syntheticUserId },
            "[chat] synthetic branch snapshot failed",
          );
        }

        if (exceededBudget) {
          // 预算超限：记录降级 system-reminder，告诉 AI 后台任务仍在继续
          const reason =
            totalBgDrained > MAX_BG_NOTIFICATIONS
              ? "too-many-notifications"
              : "turn-deadline";
          const degradedContent =
            "<system-reminder>\n" +
            "<bg-task-budget-exceeded>\n" +
            `  <reason>${reason}</reason>\n` +
            "  <note>Remaining background tasks are still running. Use BgList to check status or wait for the user's next message.</note>\n" +
            "</bg-task-budget-exceeded>\n" +
            "</system-reminder>";
          const degradedUserId = randomUUID();
          try {
            await saveMessage({
              sessionId: drainSessionId,
              message: {
                id: degradedUserId,
                role: "user",
                parts: [{ type: "text", text: degradedContent }],
                metadata: {
                  openloaf: {
                    syntheticKind: "bg-budget-exceeded",
                    isMeta: true,
                    taskIds: [],
                  },
                },
              } satisfies UIMessageLike,
              parentMessageId: syntheticUserId,
              allowEmpty: false,
            });
          } catch (degErr) {
            logger.error(
              { err: degErr, sessionId: drainSessionId },
              "[chat] save bg-budget-exceeded message failed",
            );
          }
          break;
        }

        // Next turn: fresh assistant message id + new parent = synthetic user
        currentParentMessageId = syntheticUserId;
        currentAssistantMessageId = randomUUID();
        currentTurnStartedAt = new Date();
        } // end while-loop
      } catch (err) {
        popAgentFrameOnce();
        try {
          await setSessionErrorMessage({
            sessionId: input.sessionId,
            errorMessage: extractErrorText(err),
          });
        } catch (saveErr) {
          logger.warn(
            { err: saveErr, sessionId: input.sessionId },
            "[chat] persist session error failed",
          );
        }
        throw err;
      }
    },
  });

  const sseStream = stream.pipeThrough(new JsonToSseTransformStream());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type boundary: ReadableStream<Uint8Array> is assignable to BodyInit at runtime but TS overloads don't accept it directly
  return new Response(sseStream as unknown as BodyInit, { headers: UI_MESSAGE_STREAM_HEADERS });
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
    } satisfies UIMessageLike,
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
  // messageKind is a business extension beyond UIMessageLike's declared fields;
  // the messageStore normalizer reads it via `(input.message as any)?.messageKind`.
  const errorMessage = {
    id: input.assistantMessageId,
    role: "assistant" as const,
    parts: [part],
    messageKind: "error",
  };
  await saveMessage({
    sessionId: input.sessionId,
    message: errorMessage as UIMessageLike,
    parentMessageId: input.parentMessageId,
    allowEmpty: false,
  });
}

/**
 * AI 调试模式 — 将单步 LLM 请求或响应写入独立 JSON 文件。
 *
 * 文件名格式：debug_api_${hhmmss}_${messageId}_step${N}_request.json
 *           debug_api_${hhmmss}_${messageId}_step${N}_response.json
 */
async function writeDebugStepFile(input: {
  sessionId: string;
  assistantMessageId: string;
  attemptTag: string;
  stepNumber: number;
  kind: "request" | "response";
  data: unknown;
}): Promise<void> {
  try {
    const jsonlPath = await resolveMessagesJsonlPath(input.sessionId);
    const sessionDir = path.dirname(jsonlPath);
    const debugDir = path.join(sessionDir, "debug", `${input.attemptTag}_${input.assistantMessageId}`);
    await fs.mkdir(debugDir, { recursive: true });
    const fileName = `step${input.stepNumber}_${input.kind}.json`;
    const debugPath = path.join(debugDir, fileName);

    await fs.writeFile(debugPath, JSON.stringify(input.data, null, 2), "utf-8");
  } catch (err) {
    logger.warn(
      { err, sessionId: input.sessionId, step: input.stepNumber, kind: input.kind },
      "[chat] failed to write debug step file",
    );
  }
}

