import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import type { TenasUIMessage } from "@tenas-ai/api/types/message";
import type { ChatStreamRequest } from "@/ai/chat/types";
import type { ChatImageMessageInput, ChatImageRequest } from "@/ai/image/types";
import type { AiExecuteRequest } from "@/ai/chat/types";
import { ChatStreamUseCase } from "@/ai/chat/ChatStreamUseCase";
import { SummaryTitleUseCase } from "@/ai/summary/SummaryTitleUseCase";
import { ImageRequestUseCase } from "@/ai/image/ImageRequestUseCase";
import {
  getProjectRootPath,
  getWorkspaceRootPath,
  getWorkspaceRootPathById,
} from "@tenas-ai/api/services/vfsService";
import { resolveParentProjectRootPaths } from "@/ai/utils/projectRoots";
import { CommandParser } from "@/ai/tools/CommandParser";
import { SkillSelector, type SkillMatch } from "@/ai/tools/SkillSelector";

type AiExecuteServiceInput = {
  /** Unified AI request payload. */
  request: AiExecuteRequest;
  /** Cookies from request. */
  cookies: Record<string, string>;
  /** Raw request signal. */
  requestSignal: AbortSignal;
};

export class AiExecuteService {
  /** Execute unified AI request. */
  async execute(input: AiExecuteServiceInput): Promise<Response> {
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
      lastMessage.role === "user" ? CommandParser.parseCommandAtStart(lastText) : null;

    // 逻辑：指令优先，summary-title 不落库。
    if (commandContext?.id === "summary-title") {
      return new SummaryTitleUseCase().execute({
        request,
        cookies: input.cookies,
        requestSignal: input.requestSignal,
        commandArgs: commandContext.argsText,
      });
    }

    let selectedSkills: string[] = [];
    let enrichedLastMessage = lastMessage;

    // 逻辑：仅在非指令用户输入时解析 /skill/。
    if (lastMessage.role === "user" && !commandContext) {
      selectedSkills = SkillSelector.extractSkillNamesFromText(lastText);
      const skillMatches = await resolveSkillMatches({
        names: selectedSkills,
        request,
      });
      if (skillMatches.length > 0) {
        const skillParts = buildSkillParts(skillMatches);
        // 中文注释：将 skill 内容放在用户文本前，便于模型优先读取。
        const nextParts = [
          ...skillParts,
          ...filterNonSkillParts(lastMessage.parts ?? []),
        ];
        enrichedLastMessage = {
          ...lastMessage,
          parts: nextParts,
        };
      }
    }

    // 逻辑：image+json 走图片接口，其他走聊天流。
    if (request.intent === "image" && request.responseMode === "json") {
      const imageRequest = buildChatImageRequest({
        request,
        sessionId,
        lastMessage: enrichedLastMessage,
        selectedSkills,
      });
      const result = await new ImageRequestUseCase().execute({
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
    return new ChatStreamUseCase().execute({
      request: chatRequest,
      cookies: input.cookies,
      requestSignal: input.requestSignal,
    });
  }
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
    timezone: input.request.timezone,
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
    toolApprovalPayloads: input.request.toolApprovalPayloads,
  };
}

/** Build chat request for image pipeline. */
function buildChatImageRequest(input: {
  request: AiExecuteRequest;
  sessionId: string;
  lastMessage: TenasUIMessage;
  selectedSkills: string[];
}): ChatImageRequest {
  const imageMessage: ChatImageMessageInput = {
    ...input.lastMessage,
    parentMessageId: input.lastMessage.parentMessageId ?? null,
  };
  return {
    sessionId: input.sessionId,
    messages: [imageMessage],
    id: input.request.id,
    messageId: input.request.messageId,
    clientId: input.request.clientId,
    timezone: input.request.timezone,
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
    ? getProjectRootPath(input.request.projectId) ?? undefined
    : undefined;
  const workspaceRootFromId = input.request.workspaceId
    ? getWorkspaceRootPathById(input.request.workspaceId)
    : null;
  const workspaceRoot = workspaceRootFromId ?? getWorkspaceRootPath() ?? undefined;
  const parentRoots = await resolveParentProjectRootPaths(input.request.projectId);
  const matches: SkillMatch[] = [];
  for (const name of input.names) {
    const match = await SkillSelector.resolveSkillByName(name, {
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
  // 逻辑：统一 SSE/JSON 错误返回，保持结构不变。
  if (expectsJson) {
    return new Response(JSON.stringify({ error: errorText }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  return createCommandStreamResponse({ dataParts: [], errorText });
}
