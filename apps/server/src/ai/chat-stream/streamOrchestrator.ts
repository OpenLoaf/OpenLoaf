import {
  createAgentUIStream,
  createUIMessageStream,
  JsonToSseTransformStream,
  UI_MESSAGE_STREAM_HEADERS,
  type UIMessage,
} from "ai";
import { logger } from "@/common/logger";
import type { ChatMessageKind, TokenUsage } from "@tenas-ai/api";
import {
  getSessionId,
  popAgentFrame,
  pushAgentFrame,
  setAbortSignal,
  setUiWriter,
} from "@/ai/chat-stream/requestContext";
import type { MasterAgentRunner } from "@/ai/agents/masterAgent/masterAgentRunner";
import {
  appendMessagePart,
  clearSessionErrorMessage,
  saveMessage,
  setSessionErrorMessage,
} from "./messageStore";
import { buildTokenUsageMetadata, buildTimingMetadata, mergeAbortMetadata } from "./metadataBuilder";

/** 构建错误 SSE 响应的输入。 */
export type ErrorStreamInput = {
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
export type ChatStreamResponseInput = {
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
export type ImageStreamResponseInput = {
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
        const uiStream = await createAgentUIStream({
          agent: input.agentRunner.agent,
          uiMessages: input.modelMessages as any[],
          originalMessages: input.modelMessages as any[],
          abortSignal: input.abortController.signal,
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

              const responseWithKind = input.assistantMessageKind
                ? { ...(responseMessage as any), messageKind: input.assistantMessageKind }
                : (responseMessage as any);

              await saveMessage({
                sessionId: currentSessionId,
                message: {
                  ...responseWithKind,
                  id: input.assistantMessageId,
                  metadata: mergeAbortMetadata(mergedMetadata, { isAborted, finishReason }),
                } as any,
                parentMessageId: input.parentMessageId,
                allowEmpty: isAborted,
                createdAt: input.requestStartAt,
              });
              if (!isAborted && finishReason !== "error") {
                // 中文注释：仅在成功完成时清空会话错误。
                await clearSessionErrorMessage({ sessionId: currentSessionId });
              }
            } catch (err) {
              logger.error({ err }, "[chat] save assistant failed");
            } finally {
              popAgentFrameOnce();
            }
          },
        });

        writer.merge(uiStream as any);
      } catch (err) {
        popAgentFrameOnce();
        throw err;
      }
    },
  });

  const stepThinkingStream = stream.pipeThrough(
    new TransformStream({
      transform(chunk: any, controller) {
        controller.enqueue(chunk);
        const type = chunk?.type;
        // step 结束后进入“思考中”，直到下一步或结束。
        if (type === "finish-step") {
          controller.enqueue({ type: "data-step-thinking", data: { active: true } });
        } else if (type === "start-step" || type === "finish") {
          controller.enqueue({ type: "data-step-thinking", data: { active: false } });
        }
      },
    }),
  );

  const sseStream = stepThinkingStream.pipeThrough(new JsonToSseTransformStream());
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
    } as any,
    parentMessageId: input.parentMessageId,
    allowEmpty: false,
  });
}

/** 将 JSON 转为 SSE chunk。 */
function toSseChunk(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}
