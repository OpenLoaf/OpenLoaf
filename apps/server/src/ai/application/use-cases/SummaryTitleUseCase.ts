import { generateId, generateText, type UIMessage } from "ai";
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import type { TenasUIMessage } from "@tenas-ai/api/types/message";
import type { AiExecuteRequest } from "@/ai/pipeline/aiTypes";
import { resolveChatModel } from "@/ai/resolveChatModel";
import { resolveRequiredInputTags, resolvePreviousChatModelId } from "@/ai/chat-stream/modelResolution";
import { initRequestContext } from "@/ai/chat-stream/chatStreamHelpers";
import { replaceRelativeFileParts } from "@/ai/chat-stream/attachmentResolver";
import { loadMessageChain } from "@/ai/chat-stream/messageChainLoader";
import { buildModelChain } from "@/ai/chat-stream/chatStreamHelpers";
import { setChatModel, setCodexOptions } from "@/ai/chat-stream/requestContext";
import { resolveCodexRequestOptions } from "@/ai/chat-stream/messageOptionResolver";
import {
  clearSessionErrorMessage,
  normalizeSessionTitle,
  resolveRightmostLeafId,
  setSessionErrorMessage,
  updateSessionTitle,
} from "@/ai/chat-stream/messageStore";
import { logger } from "@/common/logger";
import { buildModelMessages } from "@/ai/pipeline/messageConverter";

type CommandDataPart = {
  /** SSE event type. */
  type: string;
  /** SSE payload data. */
  data: Record<string, unknown>;
};

type SummaryTitleUseCaseInput = {
  /** Unified AI request payload. */
  request: AiExecuteRequest;
  /** Cookies from request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
  /** Optional command args text. */
  commandArgs?: string;
};

export class SummaryTitleUseCase {
  /** Execute /summary-title command without persisting messages. */
  async execute(input: SummaryTitleUseCaseInput): Promise<Response> {
    const sessionId = input.request.sessionId?.trim() ?? "";
    if (!sessionId) {
      return createCommandStreamResponse({
        dataParts: [],
        errorText: "请求无效：缺少 sessionId。",
      });
    }

    const { abortController } = initRequestContext({
      sessionId,
      cookies: input.cookies,
      clientId: input.request.clientId,
      tabId: input.request.tabId,
      workspaceId: input.request.workspaceId,
      projectId: input.request.projectId,
      boardId: input.request.boardId,
      selectedSkills: [],
      requestSignal: input.requestSignal,
      messageId: input.request.messageId,
    });

    const leafMessageId = await resolveRightmostLeafId(sessionId);
    if (!leafMessageId) {
      return createCommandStreamResponse({
        dataParts: [],
        errorText: "请求失败：找不到可生成标题的历史记录。",
      });
    }

    const chain = await loadMessageChain({ sessionId, leafMessageId });
    const modelChain = buildModelChain(chain as UIMessage[]);
    const modelMessages = await replaceRelativeFileParts(modelChain as UIMessage[]);
    if (modelMessages.length === 0) {
      return createCommandStreamResponse({
        dataParts: [],
        errorText: "请求失败：历史消息为空。",
      });
    }

    const promptMessage: TenasUIMessage = {
      id: generateId(),
      role: "user",
      parentMessageId: null,
      parts: [{ type: "text", text: buildSummaryTitlePrompt(input.commandArgs) }],
    };
    const promptChain = stripPromptParts([...modelMessages, promptMessage]);

    try {
      const requiredTags = !input.request.chatModelId
        ? resolveRequiredInputTags(modelMessages as UIMessage[])
        : [];
      const preferredChatModelId = !input.request.chatModelId
        ? resolvePreviousChatModelId(modelMessages as UIMessage[])
        : null;
      const resolved = await resolveChatModel({
        chatModelId: input.request.chatModelId,
        chatModelSource: input.request.chatModelSource,
        requiredTags,
        preferredChatModelId,
      });

      setChatModel(resolved.model);
      setCodexOptions(resolveCodexRequestOptions(modelMessages as UIMessage[]));

      const modelPromptMessages = await buildModelMessages(promptChain as UIMessage[]);
      const result = await generateText({
        model: resolved.model,
        system: buildSummaryTitleSystemPrompt(),
        messages: modelPromptMessages,
        abortSignal: abortController.signal,
      });

      const title = result.text ?? "";
      const normalized = normalizeSessionTitle(title);
      if (!normalized) {
        return createCommandStreamResponse({
          dataParts: [],
          errorText: "请求失败：未生成有效标题。",
        });
      }

      await updateSessionTitle({
        sessionId,
        title: normalized,
        isUserRename: false,
      });
      await clearSessionErrorMessage({ sessionId });

      return createCommandStreamResponse({
        dataParts: [
          {
            type: "data-session-title",
            data: { sessionId, title: normalized },
          },
        ],
      });
    } catch (err) {
      logger.error({ err, sessionId }, "[chat] summary-title failed");
      const errorText =
        err instanceof Error ? `请求失败：${err.message}` : "请求失败：生成标题失败。";
      await setSessionErrorMessage({ sessionId, errorMessage: errorText });
      return createCommandStreamResponse({
        dataParts: [],
        errorText,
      });
    }
  }
}

/** Build system prompt for summary title generation. */
function buildSummaryTitleSystemPrompt(): string {
  return [
    "你是一个对话标题生成器。",
    "- 只输出一个标题，不要解释。",
    "- 标题不超过 16 个字。",
    "- 不要输出引号、编号、Markdown。",
  ].join("\n");
}

/** Build summary title prompt message. */
function buildSummaryTitlePrompt(extra?: string): string {
  if (extra && extra.trim()) {
    return `请根据以上对话生成一个标题。额外要求：${extra.trim()}`;
  }
  return "请根据以上对话生成一个简短标题。";
}

/** Keep only prompt-relevant parts for command execution. */
function stripPromptParts(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    const parts = Array.isArray((message as any).parts) ? (message as any).parts : [];
    const filtered = parts.filter((part: any) => {
      const type = part?.type;
      return type === "text" || type === "file" || type === "data-skill";
    });
    return { ...(message as any), parts: filtered };
  });
}

/** Create a minimal stream response for command execution. */
function createCommandStreamResponse(input: {
  dataParts: CommandDataPart[];
  errorText?: string;
}): Response {
  if (input.errorText) {
    const body = [
      toSseChunk({ type: "start" }),
      toSseChunk({ type: "text-start", id: "error" }),
      toSseChunk({ type: "text-delta", id: "error", delta: input.errorText }),
      toSseChunk({ type: "text-end", id: "error" }),
      toSseChunk({ type: "finish", finishReason: "error" }),
    ].join("");
    return new Response(body, { headers: UI_MESSAGE_STREAM_HEADERS });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const enqueueChunk = (chunk: string) => {
        controller.enqueue(encoder.encode(chunk));
      };
      for (const part of input.dataParts) {
        enqueueChunk(
          toSseChunk({
            type: part.type,
            data: part.data,
            transient: true,
          }),
        );
      }
      enqueueChunk(toSseChunk({ type: "finish", finishReason: "stop" }));
      controller.close();
    },
  });
  return new Response(stream, { headers: UI_MESSAGE_STREAM_HEADERS });
}

/** Convert JSON payload into SSE chunk. */
function toSseChunk(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`;
}
