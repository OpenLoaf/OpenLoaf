import {
  createAgentUIStream,
  createUIMessageStream,
  JsonToSseTransformStream,
  UI_MESSAGE_STREAM_HEADERS,
  type UIMessage,
} from "ai";
import { logger } from "@/common/logger";
import {
  getSessionId,
  popAgentFrame,
  pushAgentFrame,
  setAbortSignal,
  setUiWriter,
} from "@/ai/chat-stream/requestContext";
import type { MasterAgentRunner } from "@/ai/agents/masterAgent/masterAgentRunner";
import { appendMessagePart, saveMessage } from "./messageStore";
import { buildTokenUsageMetadata, buildTimingMetadata, mergeAbortMetadata } from "./metadataBuilder";

/** Input for building an error SSE response. */
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

/** Input for building the main chat stream response. */
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
};

/** Build SSE response for errors. */
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

/** Build SSE response for chat stream. */
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

              await saveMessage({
                sessionId: currentSessionId,
                message: {
                  ...(responseMessage as any),
                  id: input.assistantMessageId,
                  metadata: mergeAbortMetadata(mergedMetadata, { isAborted, finishReason }),
                } as any,
                parentMessageId: input.parentMessageId,
                allowEmpty: isAborted,
                createdAt: input.requestStartAt,
              });
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

/** Persist error message into the chat tree. */
async function saveErrorMessage(input: ErrorStreamInput) {
  const part = { type: "text", text: input.errorText, state: "done" };
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

/** Convert JSON to SSE chunk. */
function toSseChunk(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}
