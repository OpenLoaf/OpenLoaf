import { generateId } from "ai";
import { prisma } from "@tenas-ai/db";
import type { MessageRole as DbMessageRole, Prisma } from "@tenas-ai/db/prisma/generated/client";
import type { ChatMessageKind, TenasUIMessage } from "@tenas-ai/api";
import { replaceFileTokensWithNames } from "@/common/chatTitle";
import { getBoardId, getProjectId, getWorkspaceId } from "@/ai/shared/context/requestContext";
import { toNumberOrUndefined } from "@/ai/utils/number-utils";
import { isRecord } from "@/ai/utils/type-guards";

/** Max session title length. */
const MAX_SESSION_TITLE_CHARS = 16;
/** Initial title word limit for spaced text. */
const INITIAL_TITLE_WORD_LIMIT = 10;
/** Initial title character limit for no-space text. */
const INITIAL_TITLE_CHAR_LIMIT = 10;
/** Fixed width for each path segment. */
const PATH_SEGMENT_WIDTH = 2;
/** Max siblings per parent. */
const MAX_PATH_SEGMENT_SEQ = 99;
/** Metadata keys that should never be persisted. */
const FORBIDDEN_METADATA_KEYS = ["id", "sessionId", "parentMessageId", "path"] as const;

/** Normalize message kind from unknown input. */
function normalizeMessageKind(value: unknown): ChatMessageKind | null {
  if (value == null) return null;
  if (
    value === "compact_prompt" ||
    value === "compact_summary"
  ) {
    return value;
  }
  return "normal";
}

/** Input for saving a chat message. */
export type SaveMessageInput = {
  /** Session id. */
  sessionId: string;
  /** Message payload. */
  message: TenasUIMessage | UIMessageLike;
  /** Parent message id. */
  parentMessageId: string | null;
  /** Workspace id for session binding. */
  workspaceId?: string;
  /** Project id for session binding. */
  projectId?: string;
  /** Board id for session binding. */
  boardId?: string;
  /** Allow empty assistant message. */
  allowEmpty?: boolean;
  /** Created time override. */
  createdAt?: Date;
};

/** Result for saving a chat message. */
export type SaveMessageResult = {
  /** Message id. */
  id: string;
  /** Parent message id. */
  parentMessageId: string | null;
  /** Materialized path. */
  path: string;
};

/** Resolve rightmost leaf id for a session. */
export async function resolveRightmostLeafId(sessionId: string): Promise<string | null> {
  const row = await prisma.chatMessage.findFirst({
    where: { sessionId },
    orderBy: [{ path: "desc" }, { id: "desc" }],
    select: { id: true },
  });
  return row?.id ?? null;
}

/** Ensure session preface text exists for the chat session. */
export async function ensureSessionPreface(input: {
  /** Session id. */
  sessionId: string;
  /** Preface text content. */
  text: string;
  /** Created time override. */
  createdAt?: Date;
  /** Workspace id for session binding. */
  workspaceId?: string;
  /** Project id for session binding. */
  projectId?: string;
  /** Board id for session binding. */
  boardId?: string;
}): Promise<void> {
  const text = String(input.text ?? "").trim();
  if (!text) return;

  await prisma.$transaction(async (tx) => {
    await ensureSession(tx, input.sessionId, {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      boardId: input.boardId,
    });
    const existing = await tx.chatSession.findUnique({
      where: { id: input.sessionId },
      select: { sessionPreface: true },
    });
    // 中文注释：内容未变化时跳过更新，避免重复写入。
    if ((existing?.sessionPreface ?? "") === text) return;
    await tx.chatSession.update({
      where: { id: input.sessionId },
      data: { sessionPreface: text },
    });
  });
}

/** Save a compaction prompt message (user) for context trimming. */
export async function saveCompactPromptMessage(input: {
  /** Session id. */
  sessionId: string;
  /** Parent message id. */
  parentMessageId: string | null;
  /** Prompt text for compaction. */
  text: string;
  /** Created time override. */
  createdAt?: Date;
}): Promise<SaveMessageResult> {
  const message: TenasUIMessage = {
    id: generateId(),
    role: "user",
    parentMessageId: input.parentMessageId,
    messageKind: "compact_prompt",
    parts: [{ type: "text", text: input.text }],
  };
  return saveMessage({
    sessionId: input.sessionId,
    message,
    parentMessageId: input.parentMessageId,
    createdAt: input.createdAt,
  });
}

/** Save a compaction summary message (assistant) for context trimming. */
export async function saveCompactSummaryMessage(input: {
  /** Session id. */
  sessionId: string;
  /** Parent message id. */
  parentMessageId: string | null;
  /** Summary text. */
  text: string;
  /** Created time override. */
  createdAt?: Date;
}): Promise<SaveMessageResult> {
  const message: TenasUIMessage = {
    id: generateId(),
    role: "assistant",
    parentMessageId: input.parentMessageId,
    messageKind: "compact_summary",
    parts: [{ type: "text", text: input.text }],
  };
  return saveMessage({
    sessionId: input.sessionId,
    message,
    parentMessageId: input.parentMessageId,
    createdAt: input.createdAt,
  });
}

/** Set the latest error message for a chat session. */
export async function setSessionErrorMessage(input: {
  /** Session id. */
  sessionId: string;
  /** Error message to persist. */
  errorMessage: string;
}): Promise<void> {
  const trimmed = input.errorMessage.trim();
  if (!trimmed) return;
  await prisma.chatSession.updateMany({
    where: { id: input.sessionId },
    data: { errorMessage: trimmed },
  });
}

/** Clear the error message for a chat session. */
export async function clearSessionErrorMessage(input: {
  /** Session id. */
  sessionId: string;
}): Promise<void> {
  await prisma.chatSession.updateMany({
    where: { id: input.sessionId },
    data: { errorMessage: null },
  });
}

/** Resolve stored session preface text for a chat session. */
export async function resolveSessionPrefaceText(sessionId: string): Promise<string> {
  const row = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { sessionPreface: true },
  });
  // 中文注释：未设置时返回空字符串，避免前端/模型链路误判为错误。
  return typeof row?.sessionPreface === "string" ? row.sessionPreface : "";
}

/** Save a chat message node. */
export async function saveMessage(input: SaveMessageInput): Promise<SaveMessageResult> {
  const messageId = String((input.message as any)?.id ?? "").trim();
  if (!messageId) throw new Error("message.id is required.");

  const messageKind = normalizeMessageKind((input.message as any)?.messageKind);
  const role = normalizeRole((input.message as any)?.role);
  const parts = normalizeParts((input.message as any)?.parts);
  const metadata = sanitizeMetadata((input.message as any)?.metadata);
  // 逻辑：compact prompt 不参与会话标题生成。
  const title =
    role === "user" && messageKind !== "compact_prompt"
      ? normalizeTitle(extractTitleTextFromParts(parts))
      : "";
  const workspaceId = normalizeOptionalId(input.workspaceId) ?? getWorkspaceId();
  const projectId = normalizeOptionalId(input.projectId) ?? getProjectId();
  const boardId = normalizeOptionalId(input.boardId) ?? getBoardId();

  const allowEmpty = Boolean(input.allowEmpty);
  if (!allowEmpty && role !== "user" && parts.length === 0) {
    // assistant/system 空内容没有回放价值，直接跳过保存。
    return { id: messageId, parentMessageId: input.parentMessageId, path: "" };
  }

  return prisma.$transaction(async (tx) => {
    await ensureSession(tx, input.sessionId, {
      title: title || undefined,
      workspaceId,
      projectId,
      boardId,
    });
    if (title) {
      // 中文注释：首条用户消息到来后补写标题（不覆盖手动改名）。
      await tx.chatSession.updateMany({
        where: { id: input.sessionId, isUserRename: false, title: "新对话" },
        data: { title },
      });
    }

    const existing = await tx.chatMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        sessionId: true,
        parentMessageId: true,
        path: true,
        metadata: true,
        parts: true,
      },
    });
    if (existing) {
      if (existing.sessionId !== input.sessionId) {
        throw new Error("message.id already exists in another session.");
      }

      // assistant/system 续跑时需要更新 parts/metadata。
      if (role !== "user") {
        const mergedMetadata = mergeMetadataWithAccumulatedUsage(existing.metadata as any, metadata);
        await tx.chatMessage.update({
          where: { id: messageId },
          data: {
            ...(parts.length ? { parts: parts as any } : {}),
            ...(mergedMetadata ? { metadata: mergedMetadata as any } : {}),
            ...(messageKind ? { messageKind } : {}),
          },
        });
      }

      return {
        id: existing.id,
        parentMessageId: existing.parentMessageId ?? null,
        path: existing.path,
      };
    }

    const parentId = input.parentMessageId ?? null;
    const parent = parentId ? await getParentNode(tx, input.sessionId, parentId) : null;
    if (parentId && !parent) throw new Error("parentMessageId not found in this session.");

    const nextSiblingSeq = await getNextSiblingSeq(tx, input.sessionId, parentId);
    const path = computePath(parent?.path ?? null, nextSiblingSeq);

    const created = await tx.chatMessage.create({
      data: {
        id: messageId,
        sessionId: input.sessionId,
        parentMessageId: parentId,
        path,
        role,
        messageKind: messageKind ?? "normal",
        parts: parts as any,
        metadata: (metadata as any) ?? undefined,
        createdAt: input.createdAt,
      },
      select: { id: true, parentMessageId: true, path: true },
    });

    return {
      id: created.id,
      parentMessageId: created.parentMessageId ?? null,
      path: created.path,
    };
  });
}

/** Append a part to an existing message by id. */
export async function appendMessagePart(input: {
  /** Session id. */
  sessionId: string;
  /** Target message id. */
  messageId: string;
  /** Part payload. */
  part: unknown;
}): Promise<boolean> {
  const existing = await prisma.chatMessage.findUnique({
    where: { id: input.messageId },
    select: { id: true, sessionId: true, parts: true },
  });
  if (!existing || existing.sessionId !== input.sessionId) return false;
  const parts = Array.isArray(existing.parts) ? [...existing.parts] : [];
  parts.push(input.part as any);
  await prisma.chatMessage.update({
    where: { id: existing.id },
    data: { parts: parts as any },
  });
  return true;
}

/** Normalize message role. */
function normalizeRole(role: unknown): DbMessageRole {
  if (role === "assistant" || role === "system" || role === "user") return role;
  return "user";
}

/** Filter message parts for persistence. */
function normalizeParts(parts: unknown): unknown[] {
  const arr = Array.isArray(parts) ? parts : [];
  return arr.filter((part) => !(part && typeof part === "object" && (part as any).type === "step-start"));
}

/** Sanitize metadata fields before persistence. */
function sanitizeMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = metadata as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if ((FORBIDDEN_METADATA_KEYS as readonly string[]).includes(key)) continue;
    next[key] = value;
  }
  return Object.keys(next).length ? next : null;
}

/** Merge usage fields by summing values. */
function mergeTotalUsage(prev: unknown, next: unknown): unknown | undefined {
  const prevUsage = isRecord(prev) ? prev : undefined;
  const nextUsage = isRecord(next) ? next : undefined;
  if (!prevUsage && !nextUsage) return undefined;

  // totalUsage 按字段累加，适配同一条 assistant 多次写入。
  const keys = [
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "reasoningTokens",
    "cachedInputTokens",
  ] as const;

  const out: Record<string, number> = {};
  for (const key of keys) {
    const a = toNumberOrUndefined(prevUsage?.[key]);
    const b = toNumberOrUndefined(nextUsage?.[key]);
    if (a == null && b == null) continue;
    out[key] = (a ?? 0) + (b ?? 0);
  }
  return Object.keys(out).length ? out : undefined;
}

/** Merge metadata while accumulating usage and timing. */
function mergeMetadataWithAccumulatedUsage(
  prev: unknown,
  next: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!next) return null;
  const prevRecord = isRecord(prev) ? prev : {};

  const merged: Record<string, unknown> = { ...prevRecord, ...next };

  const prevTotal = isRecord(prevRecord.totalUsage) ? prevRecord.totalUsage : undefined;
  const nextTotal = isRecord(next.totalUsage) ? next.totalUsage : undefined;
  const combinedTotal = mergeTotalUsage(prevTotal, nextTotal);
  if (combinedTotal) merged.totalUsage = combinedTotal;
  else if ("totalUsage" in merged) delete merged.totalUsage;

  const prevTenas = isRecord(prevRecord.tenas) ? prevRecord.tenas : undefined;
  const nextTenas = isRecord(next.tenas) ? next.tenas : undefined;
  if (prevTenas || nextTenas) {
    // assistantElapsedMs 需要在多次写入时累加。
    const mergedTenas: Record<string, unknown> = {
      ...(prevTenas ?? {}),
      ...(nextTenas ?? {}),
    };
    const prevElapsed = toNumberOrUndefined(prevTenas?.assistantElapsedMs);
    const nextElapsed = toNumberOrUndefined(nextTenas?.assistantElapsedMs);
    if (prevElapsed != null || nextElapsed != null) {
      mergedTenas.assistantElapsedMs = (prevElapsed ?? 0) + (nextElapsed ?? 0);
    } else {
      delete mergedTenas.assistantElapsedMs;
    }
    merged.tenas = Object.keys(mergedTenas).length ? mergedTenas : undefined;
  }

  return Object.keys(merged).length ? merged : null;
}

/** Extract title text from message parts. */
function extractTitleTextFromParts(parts: unknown[]): string {
  const chunks: string[] = [];
  for (const part of parts as any[]) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "text" && typeof part.text === "string") {
      chunks.push(replaceFileTokensWithNames(part.text));
    } else if (typeof part.text === "string") {
      chunks.push(replaceFileTokensWithNames(part.text));
    }
  }
  const raw = chunks.join("\n").trim();
  return trimTitleByWordsOrChars(raw);
}

/** Trim title to the first N words (whitespace) or N characters. */
function trimTitleByWordsOrChars(input: string): string {
  const normalized = input.replace(/\s+/gu, " ").trim();
  if (!normalized) return "";
  // 逻辑：含空格按词切分，否则按字符切分。
  if (normalized.includes(" ")) {
    const words = normalized.split(/\s+/gu).filter(Boolean);
    return words.slice(0, INITIAL_TITLE_WORD_LIMIT).join(" ");
  }
  return Array.from(normalized).slice(0, INITIAL_TITLE_CHAR_LIMIT).join("");
}

/** Normalize session title. */
function normalizeTitle(raw: string): string {
  let title = (raw ?? "").trim();
  title = title.replace(/^["'“”‘’《》]+/, "").replace(/["'“”‘’《》]+$/, "");
  title = title.split("\n")[0]?.trim() ?? "";
  if (title.length > MAX_SESSION_TITLE_CHARS) title = title.slice(0, MAX_SESSION_TITLE_CHARS);
  return title.trim();
}

/** Normalize session title input. */
export function normalizeSessionTitle(raw: string): string {
  return normalizeTitle(raw);
}

/** Update chat session title. */
export async function updateSessionTitle(input: {
  /** Session id. */
  sessionId: string;
  /** Title text. */
  title: string;
  /** Whether the title is manually renamed. */
  isUserRename?: boolean;
}): Promise<boolean> {
  const normalized = normalizeTitle(input.title);
  if (!normalized) return false;
  const result = await prisma.chatSession.updateMany({
    where: { id: input.sessionId },
    data: {
      title: normalized,
      ...(typeof input.isUserRename === "boolean" ? { isUserRename: input.isUserRename } : {}),
    },
  });
  return result.count > 0;
}

/** Normalize optional id. */
function normalizeOptionalId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Convert sequence into a fixed-width path segment. */
function toPathSegment(seq: number): string {
  if (!Number.isInteger(seq) || seq <= 0) throw new Error("Invalid path segment seq.");
  if (seq > MAX_PATH_SEGMENT_SEQ) throw new Error(`Too many sibling nodes (max ${MAX_PATH_SEGMENT_SEQ}).`);
  return String(seq).padStart(PATH_SEGMENT_WIDTH, "0");
}

/** Ensure chat session exists. */
async function ensureSession(
  tx: Prisma.TransactionClient,
  sessionId: string,
  input: {
    /** Session title for first message. */
    title?: string;
    /** Workspace id for session binding. */
    workspaceId?: string;
    /** Project id for session binding. */
    projectId?: string;
    /** Board id for session binding. */
    boardId?: string;
  },
) {
  const workspaceId = normalizeOptionalId(input.workspaceId);
  const projectId = normalizeOptionalId(input.projectId);
  const boardId = normalizeOptionalId(input.boardId);
  // 中文注释：仅在请求提供绑定信息时写入，避免覆盖为空。
  await tx.chatSession.upsert({
    where: { id: sessionId },
    update: {
      ...(workspaceId ? { workspaceId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(boardId ? { boardId } : {}),
    },
    create: {
      id: sessionId,
      ...(input.title ? { title: input.title } : {}),
      ...(workspaceId ? { workspaceId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(boardId ? { boardId } : {}),
    },
  });
}

/** Resolve parent node for path computation. */
async function getParentNode(
  tx: Prisma.TransactionClient,
  sessionId: string,
  parentMessageId: string,
): Promise<{ id: string; path: string } | null> {
  const parent = await tx.chatMessage.findUnique({
    where: { id: parentMessageId },
    select: { id: true, sessionId: true, path: true },
  });
  if (!parent || parent.sessionId !== sessionId) return null;
  return { id: parent.id, path: parent.path };
}

/** Get next sibling sequence for path calculation. */
async function getNextSiblingSeq(
  tx: Prisma.TransactionClient,
  sessionId: string,
  parentMessageId: string | null,
): Promise<number> {
  const lastSibling = await tx.chatMessage.findFirst({
    where: { sessionId, parentMessageId: parentMessageId ?? null },
    orderBy: [{ path: "desc" }, { id: "desc" }],
    select: { path: true },
  });
  if (!lastSibling?.path) return 1;
  const lastSeg = lastSibling.path.split("/").pop() ?? "";
  const last = Number.parseInt(lastSeg, 10);
  if (!Number.isFinite(last) || last <= 0) return 1;
  return last + 1;
}

/** Compute materialized path for new node. */
function computePath(parentPath: string | null, nextSiblingSeq: number) {
  const seg = toPathSegment(nextSiblingSeq);
  return parentPath ? `${parentPath}/${seg}` : seg;
}

/** Minimal message shape for persistence. */
type UIMessageLike = {
  /** Message id. */
  id: string;
  /** Message role. */
  role: "system" | "user" | "assistant";
  /** Message parts. */
  parts?: unknown[];
  /** Message metadata. */
  metadata?: unknown;
};
