/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { generateId, generateText, type UIMessage } from "ai";
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import type { OpenLoafUIMessage } from "@openloaf/api/types/message";
import type { AiExecuteRequest } from "@/ai/services/chat/types";
import { resolveChatModel } from "@/ai/models/resolveChatModel";
import { readAgentJson, resolveAgentDir } from "@/ai/shared/defaultAgentResolver";
import { readBasicConf } from "@/modules/settings/openloafConfStore";
import {
  getProjectRootPath,
  getWorkspaceRootPath,
  getWorkspaceRootPathById,
} from "@openloaf/api/services/vfsService";
import { resolveRequiredInputTags, resolvePreviousChatModelId } from "@/ai/services/chat/modelResolution";
import { initRequestContext } from "@/ai/services/chat/chatStreamHelpers";
import { replaceRelativeFileParts } from "@/ai/services/image/attachmentResolver";
import { loadMessageChain } from "@/ai/services/chat/repositories/messageChainLoader";
import { buildModelChain } from "@/ai/services/chat/chatStreamHelpers";
import { setChatModel, setCodexOptions } from "@/ai/shared/context/requestContext";
import { resolveCodexRequestOptions } from "@/ai/services/chat/messageOptionResolver";
import {
  clearSessionErrorMessage,
  normalizeSessionTitle,
  resolveRightmostLeafId,
  resolveSessionPrefaceText,
  setSessionErrorMessage,
  updateSessionTitle,
} from "@/ai/services/chat/repositories/messageStore";
import { logger } from "@/common/logger";
import { buildModelMessages } from "@/ai/shared/messageConverter";

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
  /** SaaS access token from request header. */
  saasAccessToken?: string;
};

type ModelRole = "user" | "assistant" | "system";

/** Narrow UI messages to model-safe roles. */
function isModelRoleMessage(
  message: OpenLoafUIMessage,
): message is OpenLoafUIMessage & { role: ModelRole } {
  return message.role === "user" || message.role === "assistant" || message.role === "system";
}

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
      timezone: input.request.timezone,
      tabId: input.request.tabId,
      workspaceId: input.request.workspaceId,
      projectId: input.request.projectId,
      boardId: input.request.boardId,
      selectedSkills: [],
      toolApprovalPayloads: input.request.toolApprovalPayloads,
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
    const sessionPrefaceText = await resolveSessionPrefaceText(sessionId);
    const modelChain = buildModelChain(chain.filter(isModelRoleMessage), {
      sessionPrefaceText,
    });
    const modelMessages = await replaceRelativeFileParts(modelChain);
    if (modelMessages.length === 0) {
      return createCommandStreamResponse({
        dataParts: [],
        errorText: "请求失败：历史消息为空。",
      });
    }

    const promptMessage: UIMessage = {
      id: generateId(),
      role: "user",
      parts: [{ type: "text", text: buildSummaryTitlePrompt(input.commandArgs) }],
    };
    const promptChain = stripPromptParts([...modelMessages, promptMessage]);

    try {
      // 逻辑：从 master agent 配置读取模型。
      const basicConf = readBasicConf()
      const chatModelSource = basicConf.chatSource === 'cloud' ? 'cloud' as const : 'local' as const
      let chatModelId: string | undefined
      const roots: string[] = []
      if (input.request.projectId) {
        const pr = getProjectRootPath(input.request.projectId)
        if (pr) roots.push(pr)
      }
      if (input.request.workspaceId) {
        const wr = getWorkspaceRootPathById(input.request.workspaceId)
        if (wr) roots.push(wr)
      }
      const fallbackWs = getWorkspaceRootPath()
      if (fallbackWs && !roots.includes(fallbackWs)) roots.push(fallbackWs)
      for (const rootPath of roots) {
        const descriptor = readAgentJson(resolveAgentDir(rootPath, 'master'))
        if (!descriptor) continue
        const modelIds = chatModelSource === 'cloud' ? descriptor.modelCloudIds : descriptor.modelLocalIds
        chatModelId = Array.isArray(modelIds) ? modelIds[0]?.trim() || undefined : undefined
        if (chatModelId) break
      }

      const requiredTags = !chatModelId
        ? resolveRequiredInputTags(modelMessages)
        : [];
      const preferredChatModelId = !chatModelId
        ? resolvePreviousChatModelId(modelMessages)
        : null;
      const resolved = await resolveChatModel({
        chatModelId,
        chatModelSource,
        requiredTags,
        preferredChatModelId,
        saasAccessToken: input.saasAccessToken,
      });

      setChatModel(resolved.model);
      setCodexOptions(resolveCodexRequestOptions(modelMessages));

      const modelPromptMessages = await buildModelMessages(promptChain);
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
