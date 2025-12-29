import { prisma } from "@teatime-ai/db";
import type { MessageRole as DbMessageRole, Prisma } from "@teatime-ai/db/prisma/generated/client";
import type { TeatimeUIMessage } from "@teatime-ai/api/types/message";

const MAX_SESSION_TITLE_CHARS = 16;
// 物化路径每段固定 2 位（01..99），用于保证 DB 按字符串排序时等价于按数字排序。
// 产品约束：同级最多 99 个节点；超过后直接报错，避免出现 3 位段导致排序与查询不稳定。
const PATH_SEGMENT_WIDTH = 2;
const MAX_PATH_SEGMENT_SEQ = 99;

// metadata 禁止保存消息树字段，避免冗余与不一致。
const FORBIDDEN_METADATA_KEYS = ["id", "sessionId", "parentMessageId", "path"] as const;
// 用于 resourceUris 读取的最小结果类型。
type SessionResourceUris = { resourceUris?: unknown } | null;

function normalizeRole(role: unknown): DbMessageRole {
  if (role === "assistant" || role === "system" || role === "user") return role;
  return "user";
}

function isSkippablePart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  return (part as any).type === "step-start";
}

function normalizeParts(parts: unknown): unknown[] {
  const arr = Array.isArray(parts) ? parts : [];
  return arr.filter((p) => !isSkippablePart(p));
}

/**
 * Checks whether parts already contain a manual-stop marker.
 */
function hasManualStopPart(parts: unknown[]): boolean {
  return parts.some(
    (part) => (part as any)?.type === "data-manual-stop",
  );
}

/**
 * Ensures manual-stop markers are not lost on message updates.
 */
function mergeManualStopPart(existingParts: unknown[], nextParts: unknown[]): unknown[] {
  if (!hasManualStopPart(existingParts)) return nextParts;
  if (hasManualStopPart(nextParts)) return nextParts;
  // 中文注释：保留手动中断标记，避免后续更新覆盖。
  return [...nextParts, ...existingParts.filter((part) => (part as any)?.type === "data-manual-stop")];
}

function sanitizeMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = metadata as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if ((FORBIDDEN_METADATA_KEYS as readonly string[]).includes(k)) continue;
    next[k] = v;
  }
  return Object.keys(next).length ? next : null;
}

function toNumberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function mergeTotalUsage(prev: unknown, next: unknown): unknown | undefined {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);

  const prevUsage = isRecord(prev) ? prev : undefined;
  const nextUsage = isRecord(next) ? next : undefined;
  if (!prevUsage && !nextUsage) return undefined;

  // totalUsage 按字段累加（适配审批续跑/重试等多次写入同一条 assistant message 的场景）。
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

function mergeMetadataWithAccumulatedUsage(prev: unknown, next: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!next) return null;
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const prevRecord = isRecord(prev) ? prev : {};

  const merged: Record<string, unknown> = { ...prevRecord, ...next };

  const prevTotal = isRecord(prevRecord.totalUsage) ? prevRecord.totalUsage : undefined;
  const nextTotal = isRecord(next.totalUsage) ? next.totalUsage : undefined;
  const combinedTotal = mergeTotalUsage(prevTotal, nextTotal);
  if (combinedTotal) merged.totalUsage = combinedTotal;
  else if ("totalUsage" in merged) delete merged.totalUsage;

  const prevTeatime = isRecord(prevRecord.teatime) ? prevRecord.teatime : undefined;
  const nextTeatime = isRecord(next.teatime) ? next.teatime : undefined;
  if (prevTeatime || nextTeatime) {
    // 中文注释：assistantElapsedMs 需要在多次写入同一条 assistant 消息时累加。
    const mergedTeatime: Record<string, unknown> = {
      ...(prevTeatime ?? {}),
      ...(nextTeatime ?? {}),
    };
    const prevElapsed = toNumberOrUndefined(prevTeatime?.assistantElapsedMs);
    const nextElapsed = toNumberOrUndefined(nextTeatime?.assistantElapsedMs);
    if (prevElapsed != null || nextElapsed != null) {
      mergedTeatime.assistantElapsedMs = (prevElapsed ?? 0) + (nextElapsed ?? 0);
    } else {
      delete mergedTeatime.assistantElapsedMs;
    }
    merged.teatime = Object.keys(mergedTeatime).length ? mergedTeatime : undefined;
  }

  return Object.keys(merged).length ? merged : null;
}

function extractTitleTextFromParts(parts: unknown[]): string {
  const chunks: string[] = [];
  for (const part of parts as any[]) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "text" && typeof part.text === "string") chunks.push(part.text);
    else if (typeof part.text === "string") chunks.push(part.text);
  }
  return chunks.join("\n").trim();
}

function normalizeTitle(raw: string): string {
  let title = (raw ?? "").trim();
  title = title.replace(/^["'“”‘’《》]+/, "").replace(/["'“”‘’《》]+$/, "");
  title = title.split("\n")[0]?.trim() ?? "";
  if (title.length > MAX_SESSION_TITLE_CHARS) title = title.slice(0, MAX_SESSION_TITLE_CHARS);
  return title.trim();
}

function toPathSegment(seq: number): string {
  if (!Number.isInteger(seq) || seq <= 0) throw new Error("Invalid path segment seq.");
  if (seq > MAX_PATH_SEGMENT_SEQ) throw new Error(`Too many sibling nodes (max ${MAX_PATH_SEGMENT_SEQ}).`);
  return String(seq).padStart(PATH_SEGMENT_WIDTH, "0");
}

/** Ensure chat session exists and bind it to a resource when requested. */
async function ensureSession(
  tx: Prisma.TransactionClient,
  sessionId: string,
  title?: string,
  resourceUri?: string,
) {
  await tx.chatSession.upsert({
    where: { id: sessionId },
    update: {},
    // 会话首次创建时，把“第一条 user 消息文本”作为标题（后续不自动更新）。
    create: { id: sessionId, ...(title ? { title } : {}) },
  });

  if (!resourceUri) return;
  // 中文注释：类型生成可能出现字段不同步，使用最小类型保证读取 resourceUris。
  const existing = (await tx.chatSession.findUnique({
    where: { id: sessionId },
    select: { resourceUris: true } as Prisma.ChatSessionSelect,
  })) as SessionResourceUris;
  const current = Array.isArray(existing?.resourceUris)
    ? (existing?.resourceUris as string[])
    : [];
  if (current.includes(resourceUri)) return;
  await tx.chatSession.update({
    where: { id: sessionId },
    data: { resourceUris: [...current, resourceUri] } as Prisma.ChatSessionUpdateInput,
  });
}

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

function computePath(parentPath: string | null, nextSiblingSeq: number) {
  const seg = toPathSegment(nextSiblingSeq);
  return parentPath ? `${parentPath}/${seg}` : seg;
}

/**
 * ChatRepositoryAdapter（MVP）：
 * - 保存 user/assistant 消息到 DB
 * - 维护 message tree：parentMessageId + 物化路径 path
 */
export const chatRepository = {
  /** 查询会话最右叶子（用于默认 parent 推断）。 */
  resolveSessionRightmostLeafId: async (sessionId: string): Promise<string | null> => {
    const row = await prisma.chatMessage.findFirst({
      where: { sessionId },
      orderBy: [{ path: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    return row?.id ?? null;
  },

  /** 保存一条消息节点（会话树）。 */
  saveMessageNode: async (input: {
    sessionId: string;
    message: TeatimeUIMessage | UIMessageLike;
    parentMessageId: string | null;
    allowEmpty?: boolean;
    createdAt?: Date;
    resourceUri?: string;
  }): Promise<{ id: string; parentMessageId: string | null; path: string }> => {
    const messageId = String((input.message as any)?.id ?? "").trim();
    if (!messageId) throw new Error("message.id is required.");

    const role = normalizeRole((input.message as any)?.role);
    const parts = normalizeParts((input.message as any)?.parts);
    const metadata = sanitizeMetadata((input.message as any)?.metadata);
    const title =
      role === "user" ? normalizeTitle(extractTitleTextFromParts(parts)) : "";

    const allowEmpty = Boolean(input.allowEmpty);
    if (!allowEmpty && role !== "user" && parts.length === 0) {
      // 空 assistant/system 没有回放价值，直接跳过保存。
      return { id: messageId, parentMessageId: input.parentMessageId, path: "" };
    }

    return prisma.$transaction(async (tx) => {
      await ensureSession(tx, input.sessionId, title || undefined, input.resourceUri);

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

        // assistant/system 在“续跑”场景下需要更新 parts/metadata（同一条 messageId 继续补全）。
        if (role !== "user") {
          const mergedMetadata = mergeMetadataWithAccumulatedUsage(existing.metadata as any, metadata);
          const updatedParts =
            parts.length && Array.isArray(existing.parts)
              ? mergeManualStopPart(existing.parts as unknown[], parts)
              : parts;
          await tx.chatMessage.update({
            where: { id: messageId },
            data: {
              ...(updatedParts.length ? { parts: updatedParts as any } : {}),
              ...(mergedMetadata ? { metadata: mergedMetadata as any } : {}),
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
  },
  /** 追加一个 part 到指定 messageId（MVP）。 */
  appendMessagePartById: async (input: {
    sessionId: string;
    messageId: string;
    part: unknown;
  }): Promise<boolean> => {
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
  },
} as const;

type UIMessageLike = {
  id: string;
  role: "system" | "user" | "assistant";
  parts?: unknown[];
  metadata?: unknown;
};
