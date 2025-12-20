import { prisma } from "@teatime-ai/db";
import type { MessageRole as DbMessageRole, Prisma } from "@teatime-ai/db/prisma/generated/client";
import type { TeatimeUIMessage } from "@teatime-ai/api/types/message";

const MAX_SESSION_TITLE_CHARS = 16;
// 中文注释：物化路径每段固定 2 位（01..99），用于保证 DB 按字符串排序时等价于按数字排序。
// 中文注释：产品约束：同级最多 99 个节点；超过后直接报错，避免出现 3 位段导致排序与查询不稳定。
const PATH_SEGMENT_WIDTH = 2;
const MAX_PATH_SEGMENT_SEQ = 99;

// 中文注释：metadata 禁止保存消息树字段，避免冗余与不一致。
const FORBIDDEN_METADATA_KEYS = ["id", "sessionId", "parentMessageId", "path"] as const;

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

async function ensureSession(tx: Prisma.TransactionClient, sessionId: string, title?: string) {
  await tx.chatSession.upsert({
    where: { id: sessionId },
    update: {},
    // 中文注释：会话首次创建时，把“第一条 user 消息文本”作为标题（后续不自动更新）。
    create: { id: sessionId, ...(title ? { title } : {}) },
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
      // 中文注释：空 assistant/system 没有回放价值，直接跳过保存。
      return { id: messageId, parentMessageId: input.parentMessageId, path: "" };
    }

    return prisma.$transaction(async (tx) => {
      await ensureSession(tx, input.sessionId, title || undefined);

      const existing = await tx.chatMessage.findUnique({
        where: { id: messageId },
        select: { id: true, sessionId: true, parentMessageId: true, path: true },
      });
      if (existing) {
        if (existing.sessionId !== input.sessionId) {
          throw new Error("message.id already exists in another session.");
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
} as const;

type UIMessageLike = {
  id: string;
  role: "system" | "user" | "assistant";
  parts?: unknown[];
  metadata?: unknown;
};
