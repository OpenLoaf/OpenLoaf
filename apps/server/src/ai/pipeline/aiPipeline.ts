import { generateId, generateText, type UIMessage } from "ai";
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import type { TenasUIMessage } from "@tenas-ai/api/types/message";
import { resolveChatModel } from "@/ai/resolveChatModel";
import { resolveRequiredInputTags, resolvePreviousChatModelId } from "@/ai/chat-stream/modelResolution";
import { initRequestContext } from "@/ai/chat-stream/chatStreamHelpers";
import { replaceRelativeFileParts } from "@/ai/chat-stream/attachmentResolver";
import {
  clearSessionErrorMessage,
  normalizeSessionTitle,
  resolveRightmostLeafId,
  setSessionErrorMessage,
  updateSessionTitle,
} from "@/ai/chat-stream/messageStore";
import { loadMessageChain } from "@/ai/chat-stream/messageChainLoader";
import { buildModelChain } from "@/ai/chat-stream/chatStreamHelpers";
import { runChatStream, runChatImageRequest } from "@/ai/chat-stream/chatStreamService";
import type { ChatStreamRequest } from "@/ai/chat-stream/chatStreamTypes";
import type { ChatImageRequest } from "@/ai/chat-stream/chatImageTypes";
import { setChatModel, setCodexOptions } from "@/ai/chat-stream/requestContext";
import {
  getProjectRootPath,
  getWorkspaceRootPath,
  getWorkspaceRootPathById,
} from "@tenas-ai/api/services/vfsService";
import { resolveParentProjectRootPaths } from "@/ai/utils/projectRoots";
import { resolveCodexRequestOptions } from "@/ai/chat-stream/messageOptionResolver";
import { logger } from "@/common/logger";
import { parseCommandAtStart } from "./commandParser";
import type { AiExecuteRequest } from "./aiTypes";
import { extractSkillNamesFromText, resolveSkillByName } from "./skillResolver";
import type { SkillMatch } from "./skillRegistry";
import { buildModelMessages } from "./messageConverter";

/** Run unified AI execution pipeline. */
export async function runAiExecute(input: {
  /** Unified AI request payload. */
  request: AiExecuteRequest;
  /** Cookie snapshot for this request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
}): Promise<Response> {
  const request = input.request;
  const sessionId = request.sessionId?.trim() ?? "";
  const responseMode = request.responseMode ?? "stream";
  const expectsJson = responseMode === "json";
  if (!sessionId) {
    return createInvalidResponse("请求无效：缺少 sessionId。", expectsJson);
  }
  const messages = Array.isArray(request.messages) ? request.messages : [];
  const lastMessage = messages.at(-1) as TenasUIMessage | undefined;
  if (!lastMessage || !lastMessage.role || !lastMessage.id) {
    return createInvalidResponse("请求无效：缺少最后一条消息。", expectsJson);
  }

  const lastText = extractTextFromParts(lastMessage.parts ?? []);
  const commandContext =
    lastMessage.role === "user" ? parseCommandAtStart(lastText) : null;

  if (commandContext?.id === "summary-title") {
    return runSummaryTitleCommand({
      request,
      cookies: input.cookies,
      requestSignal: input.requestSignal,
      commandArgs: commandContext.argsText,
    });
  }

  let selectedSkills: string[] = [];
  let enrichedLastMessage = lastMessage;

  if (lastMessage.role === "user" && !commandContext) {
    selectedSkills = extractSkillNamesFromText(lastText);
    const skillMatches = await resolveSkillMatches({
      names: selectedSkills,
      request,
    });
    if (skillMatches.length > 0) {
      const skillParts = buildSkillParts(skillMatches);
      const nextParts = [
        ...filterNonSkillParts(lastMessage.parts ?? []),
        ...skillParts,
      ];
      enrichedLastMessage = {
        ...lastMessage,
        parts: nextParts,
      };
    }
  }

  if (request.intent === "image" && request.responseMode === "json") {
    const imageRequest = buildChatImageRequest({
      request,
      sessionId,
      lastMessage: enrichedLastMessage,
      selectedSkills,
    });
    const result = await runChatImageRequest({
      request: imageRequest,
      cookies: input.cookies,
      requestSignal: input.requestSignal,
    });
    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: result.status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(result.response), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const chatRequest = buildChatStreamRequest({
    request,
    sessionId,
    lastMessage: enrichedLastMessage,
    selectedSkills,
  });
  return runChatStream({
    request: chatRequest,
    cookies: input.cookies,
    requestSignal: input.requestSignal,
  });
}

type SummaryTitleCommandInput = {
  request: AiExecuteRequest;
  cookies: Record<string, string>;
  requestSignal: AbortSignal;
  commandArgs?: string;
};

/** Execute /summary-title command without persisting messages. */
async function runSummaryTitleCommand(input: SummaryTitleCommandInput): Promise<Response> {
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

/** Extract plain text from message parts. */
function extractTextFromParts(parts: unknown[]): string {
  const items = Array.isArray(parts) ? (parts as any[]) : [];
  return items
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("\n")
    .trim();
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

/** Build chat request for streaming pipeline. */
function buildChatStreamRequest(input: {
  request: AiExecuteRequest;
  sessionId: string;
  lastMessage: TenasUIMessage;
  selectedSkills: string[];
}): ChatStreamRequest {
  return {
    sessionId: input.sessionId,
    messages: [input.lastMessage],
    id: input.request.id,
    messageId: input.request.messageId,
    clientId: input.request.clientId,
    tabId: input.request.tabId,
    params: input.request.params,
    trigger: input.request.trigger,
    retry: input.request.retry,
    chatModelId: input.request.chatModelId,
    chatModelSource: input.request.chatModelSource,
    workspaceId: input.request.workspaceId,
    projectId: input.request.projectId,
    boardId: input.request.boardId,
    selectedSkills: input.selectedSkills,
  };
}

/** Build chat request for image pipeline. */
function buildChatImageRequest(input: {
  request: AiExecuteRequest;
  sessionId: string;
  lastMessage: TenasUIMessage;
  selectedSkills: string[];
}): ChatImageRequest {
  return {
    sessionId: input.sessionId,
    messages: [input.lastMessage],
    id: input.request.id,
    messageId: input.request.messageId,
    clientId: input.request.clientId,
    tabId: input.request.tabId,
    params: input.request.params,
    trigger: input.request.trigger,
    retry: input.request.retry,
    chatModelId: input.request.chatModelId ?? "",
    chatModelSource: input.request.chatModelSource,
    workspaceId: input.request.workspaceId,
    projectId: input.request.projectId,
    boardId: input.request.boardId ?? null,
    imageSaveDir: input.request.imageSaveDir,
    selectedSkills: input.selectedSkills,
  };
}

/** Resolve skill matches for a request. */
async function resolveSkillMatches(input: {
  names: string[];
  request: AiExecuteRequest;
}): Promise<SkillMatch[]> {
  if (input.names.length === 0) return [];
  const projectRoot = input.request.projectId
    ? getProjectRootPath(input.request.projectId)
    : undefined;
  const workspaceRootFromId = input.request.workspaceId
    ? getWorkspaceRootPathById(input.request.workspaceId)
    : null;
  const workspaceRoot = workspaceRootFromId ?? getWorkspaceRootPath() ?? undefined;
  const parentRoots = await resolveParentProjectRootPaths(input.request.projectId);
  const matches: SkillMatch[] = [];
  for (const name of input.names) {
    const match = await resolveSkillByName(name, {
      projectRoot,
      parentRoots,
      workspaceRoot,
    });
    if (match) matches.push(match);
  }
  return matches;
}

/** Filter non-skill parts from a message. */
function filterNonSkillParts(parts: unknown[]): unknown[] {
  const items = Array.isArray(parts) ? parts : [];
  return items.filter((part) => part && (part as any).type !== "data-skill");
}

/** Build data-skill parts. */
function buildSkillParts(matches: SkillMatch[]) {
  return matches.map((match) => ({
    type: "data-skill" as const,
    data: {
      name: match.name,
      path: match.path,
      scope: match.scope,
      content: match.content,
    },
  }));
}

type CommandDataPart = {
  type: string;
  data: Record<string, unknown>;
};

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

/** Build an invalid request response by response mode. */
function createInvalidResponse(errorText: string, expectsJson: boolean): Response {
  if (expectsJson) {
    return new Response(JSON.stringify({ error: errorText }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  return createCommandStreamResponse({ dataParts: [], errorText });
}
