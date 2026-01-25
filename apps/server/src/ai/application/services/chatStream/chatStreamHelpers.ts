import { generateId, type UIMessage } from "ai";
import type { TenasUIMessage } from "@tenas-ai/api/types/message";
import { logger } from "@/common/logger";
import { setAssistantMessageId, setRequestContext } from "@/ai/shared/context/requestContext";
import { loadMessageChain } from "@/ai/infrastructure/repositories/messageChainLoader";
import {
  resolveRightmostLeafId,
  resolveSessionPrefaceText,
  saveMessage,
} from "@/ai/infrastructure/repositories/messageStore";
import type { ChatImageRequestResult } from "@/ai/application/dto/chatImageTypes";
import { replaceRelativeFileParts } from "@/ai/infrastructure/adapters/attachmentResolver";

/** Format invalid request errors for client display. */
export function formatInvalidRequestMessage(message: string): string {
  const trimmed = message.trim() || "Invalid request.";
  if (trimmed.startsWith("请求无效：")) return trimmed;
  return `请求无效：${trimmed}`;
}

/** Format image errors for client display. */
export function formatImageErrorMessage(error: unknown): string {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "图片生成失败。";
  const trimmed = message.trim() || "图片生成失败。";
  if (trimmed.startsWith("请求失败：")) return trimmed;
  return `请求失败：${trimmed}`;
}

/** Build an error result for image requests. */
export function createChatImageErrorResult(
  status: number,
  error: string,
): ChatImageRequestResult {
  return { ok: false, status, error };
}

type RequestInitResult = {
  /** Abort controller for the current request. */
  abortController: AbortController;
  /** Assistant message id for the current response. */
  assistantMessageId: string;
  /** Request start time for metadata. */
  requestStartAt: Date;
};

type SaveLastMessageResult =
  | {
      ok: true;
      /** Leaf message id after saving. */
      leafMessageId: string;
      /** Parent user message id for assistant. */
      assistantParentUserId: string | null;
    }
  | {
      ok: false;
      /** HTTP status code for error. */
      status: number;
      /** Formatted error text for client. */
      errorText: string;
    };

type LoadMessageChainResult =
  | {
      ok: true;
      /** Full message chain loaded from storage. */
      messages: UIMessage[];
      /** Messages with file parts resolved. */
      modelMessages: UIMessage[];
    }
  | {
      ok: false;
      /** Formatted error text for client. */
      errorText: string;
    };

/** Initialize request context, abort controller, and assistant message id. */
export function initRequestContext(input: {
  /** Chat session id. */
  sessionId: string;
  /** Cookie snapshot for request. */
  cookies: Record<string, string>;
  /** Web client id for session association. */
  clientId?: string | null;
  /** Tab id for UI event targeting. */
  tabId?: string | null;
  /** Workspace id for request scope. */
  workspaceId?: string | null;
  /** Project id for request scope. */
  projectId?: string | null;
  /** Board id for request scope. */
  boardId?: string | null;
  /** Selected skills for this request. */
  selectedSkills?: string[] | null;
  /** Tool approval payloads keyed by toolCallId. */
  toolApprovalPayloads?: Record<string, Record<string, unknown>> | null;
  /** Abort signal from the incoming request. */
  requestSignal: AbortSignal;
  /** Optional message id override. */
  messageId?: string | null;
}): RequestInitResult {
  const boardId =
    typeof input.boardId === "string" && input.boardId.trim() ? input.boardId.trim() : undefined;
  setRequestContext({
    sessionId: input.sessionId,
    cookies: input.cookies,
    clientId: input.clientId || undefined,
    tabId: input.tabId || undefined,
    workspaceId: input.workspaceId || undefined,
    projectId: input.projectId || undefined,
    // 逻辑：仅在请求参数中显式选择时注入技能列表。
    selectedSkills:
      Array.isArray(input.selectedSkills) && input.selectedSkills.length > 0
        ? [...input.selectedSkills]
        : undefined,
    toolApprovalPayloads:
      input.toolApprovalPayloads && Object.keys(input.toolApprovalPayloads).length > 0
        ? { ...input.toolApprovalPayloads }
        : undefined,
    ...(boardId ? { boardId } : {}),
  });

  const abortController = new AbortController();
  input.requestSignal.addEventListener("abort", () => {
    abortController.abort();
  });

  const requestStartAt = new Date();
  const assistantMessageId =
    typeof input.messageId === "string" && input.messageId ? input.messageId : generateId();
  setAssistantMessageId(assistantMessageId);

  return {
    abortController,
    assistantMessageId,
    requestStartAt,
  };
}

/** Save the last message and resolve parent linkage. */
export async function saveLastMessageAndResolveParent(input: {
  /** Chat session id. */
  sessionId: string;
  /** Last incoming message. */
  lastMessage: TenasUIMessage;
  /** Request start timestamp. */
  requestStartAt: Date;
  /** Formatter for invalid request errors. */
  formatInvalid: (message: string) => string;
  /** Formatter for save errors. */
  formatSaveError: (message: string) => string;
}): Promise<SaveLastMessageResult> {
  try {
    if (input.lastMessage.role === "user") {
      const explicitParent =
        typeof input.lastMessage.parentMessageId === "string" ||
        input.lastMessage.parentMessageId === null
          ? (input.lastMessage.parentMessageId as string | null)
          : undefined;
      const parentMessageIdToUse =
        explicitParent === undefined ? await resolveRightmostLeafId(input.sessionId) : explicitParent;

      const saved = await saveMessage({
        sessionId: input.sessionId,
        message: input.lastMessage as any,
        parentMessageId: parentMessageIdToUse ?? null,
        createdAt: input.requestStartAt,
      });
      return {
        ok: true,
        leafMessageId: saved.id,
        assistantParentUserId: saved.id,
      };
    }
    if (input.lastMessage.role === "assistant") {
      const parentId =
        typeof input.lastMessage.parentMessageId === "string" ? input.lastMessage.parentMessageId : null;
      if (!parentId) {
        return {
          ok: false,
          status: 400,
          errorText: input.formatInvalid("assistant 缺少 parentMessageId。"),
        };
      }

      await saveMessage({
        sessionId: input.sessionId,
        message: input.lastMessage as any,
        parentMessageId: parentId,
        allowEmpty: true,
        createdAt: input.requestStartAt,
      });
      return {
        ok: true,
        leafMessageId: String(input.lastMessage.id),
        assistantParentUserId: parentId,
      };
    }
    return {
      ok: false,
      status: 400,
      errorText: input.formatInvalid("不支持的消息角色。"),
    };
  } catch (err) {
    logger.error({ err }, "[chat] save last message failed");
    return {
      ok: false,
      status: 500,
      errorText: input.formatSaveError("保存消息出错。"),
    };
  }
}

/** Build the model chain by trimming to the latest compact summary. */
export function buildModelChain(
  messages: UIMessage[],
  options?: {
    /** Whether to keep compact prompt in the model chain. */
    includeCompactPrompt?: boolean;
    /** Preface text injected as the first user message. */
    sessionPrefaceText?: string;
  },
): UIMessage[] {
  const fullChain = Array.isArray(messages) ? messages : [];
  if (fullChain.length === 0) return [];
  const includeCompactPrompt = Boolean(options?.includeCompactPrompt);
  const sessionPrefaceText = String(options?.sessionPrefaceText ?? "").trim();

  let latestSummaryIndex = -1;
  for (let i = 0; i < fullChain.length; i += 1) {
    const message = fullChain[i] as any;
    const kind = message?.messageKind;
    if (kind === "compact_summary") latestSummaryIndex = i;
  }

  const baseSlice = latestSummaryIndex >= 0 ? fullChain.slice(latestSummaryIndex) : fullChain;
  const trimmed = includeCompactPrompt
    ? baseSlice
    : baseSlice.filter((message: any) => message?.messageKind !== "compact_prompt");

  if (!sessionPrefaceText) return trimmed;
  return [
    {
      id: "__session_preface__",
      role: "user",
      parts: [{ type: "text", text: sessionPrefaceText }],
    } as UIMessage,
    ...trimmed,
  ];
}

/** Load message chain and replace file parts. */
export async function loadAndPrepareMessageChain(input: {
  /** Chat session id. */
  sessionId: string;
  /** Leaf message id for chain loading. */
  leafMessageId: string;
  /** Parent user message id for assistant. */
  assistantParentUserId: string | null;
  /** Whether to include compact prompt in model chain. */
  includeCompactPrompt?: boolean;
  /** Formatter for chain errors. */
  formatError: (message: string) => string;
}): Promise<LoadMessageChainResult> {
  const messages = await loadMessageChain({
    sessionId: input.sessionId,
    leafMessageId: input.leafMessageId,
  });
  const sessionPrefaceText = await resolveSessionPrefaceText(input.sessionId);
  logger.debug(
    {
      sessionId: input.sessionId,
      leafMessageId: input.leafMessageId,
      messageCount: Array.isArray(messages) ? messages.length : null,
    },
    "[chat] load message chain",
  );

  const modelChain = buildModelChain(messages as UIMessage[], {
    includeCompactPrompt: input.includeCompactPrompt,
    sessionPrefaceText,
  });
  const modelMessages = await replaceRelativeFileParts(modelChain as UIMessage[]);
  if (messages.length === 0) {
    return { ok: false, errorText: input.formatError("历史消息不存在。") };
  }
  if (!input.assistantParentUserId) {
    return { ok: false, errorText: input.formatError("找不到父消息。") };
  }
  return { ok: true, messages: messages as UIMessage[], modelMessages };
}
