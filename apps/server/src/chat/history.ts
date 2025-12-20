import { prisma } from "@teatime-ai/db";
import {
  type MessageRole as MessageRoleType,
  type Prisma,
} from "@teatime-ai/db/prisma/generated/client";
import type { TeatimeUIMessage } from "@teatime-ai/api/types/message";

const MAX_SESSION_TITLE_CHARS = 16;
const DEFAULT_BRANCH_TAKE = 50;
const PATH_SEGMENT_WIDTH = 8;

// 关键：metadata 禁止保存消息树字段，避免冗余与不一致
const FORBIDDEN_METADATA_KEYS = [
  "id",
  "sessionId",
  "parentMessageId",
  "path",
] as const;

/** 校验 role：DB 与 UI 都是小写枚举，非预期值统一降级为 user */
function normalizeRole(role: unknown): MessageRoleType {
  if (role === "assistant" || role === "system" || role === "user") return role;
  return "user";
}

/**
 * 判断该 part 是否应该跳过持久化
 * - `step-start` 属于步骤边界标记，不是用户/模型内容
 */
function isSkippablePart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  return (part as any).type === "step-start";
}

/** 标准化 parts：确保为数组，并过滤掉不应持久化的 part */
function normalizeParts(parts: unknown): unknown[] {
  const arr = Array.isArray(parts) ? parts : [];
  return arr.filter((p) => !isSkippablePart(p));
}

/** 判断一条消息是否有可渲染内容（用于跳过“空 assistant”） */
function hasRenderableParts(role: MessageRoleType, parts: unknown[]): boolean {
  if (role === "user") return true;
  return parts.length > 0;
}

/** 从 parts 中提取文本（用于生成标题） */
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

/** 清理 metadata：移除禁止字段（消息树信息必须只存在于列） */
function sanitizeMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object") return null;
  const raw = metadata as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if ((FORBIDDEN_METADATA_KEYS as readonly string[]).includes(k)) continue;
    next[k] = v;
  }
  return Object.keys(next).length > 0 ? next : null;
}

async function ensureSession(tx: Prisma.TransactionClient, sessionId: string) {
  await tx.chatSession.upsert({
    where: { id: sessionId },
    update: {},
    create: { id: sessionId },
  });
}

/**
 * 获取父节点信息（用于计算 path）
 * - 只允许同 session 内引用，避免错误串链
 */
async function getParentNode(
  tx: Prisma.TransactionClient,
  sessionId: string,
  parentMessageId: string,
) {
  const parent = await tx.chatMessage.findUnique({
    where: { id: parentMessageId },
    select: { id: true, sessionId: true, path: true },
  });
  if (!parent) return null;
  if (parent.sessionId !== sessionId) return null;
  return parent;
}

function toPathSegment(seq: number): string {
  // 关键：固定宽度分段，保证字符串排序 === “最右分支”策略
  return String(seq).padStart(PATH_SEGMENT_WIDTH, "0");
}

/**
 * 获取同 parent 下的下一个 path 分段序号（从 1 开始递增）
 * - 消息树只用 parentMessageId + path 表达（减少冗余字段）
 */
async function getNextPathSegmentSeq(
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

/** 计算新节点的 path（物化路径） */
function computeNodePath({
  parentPath,
  nextSegmentSeq,
}: {
  parentPath: string | null;
  nextSegmentSeq: number;
}) {
  const seg = toPathSegment(nextSegmentSeq);
  return parentPath ? `${parentPath}/${seg}` : seg;
}

function getPathPrefixes(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  const prefixes: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    prefixes.push(segments.slice(0, i + 1).join("/"));
  }
  return prefixes;
}

export type SavedChatMessageNode = {
  id: string;
  parentMessageId: string | null;
  path: string;
};

/**
 * 读取已存在的消息节点（用于 retry / 只读场景）
 * - retry 时不能再次保存同 id 的 user 消息
 */
export async function requireExistingChatMessageNode({
  sessionId,
  messageId,
}: {
  sessionId: string;
  messageId: string;
}): Promise<SavedChatMessageNode & { role: MessageRoleType }> {
  const row = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      sessionId: true,
      parentMessageId: true,
      path: true,
      role: true,
    },
  });
  if (!row || row.sessionId !== sessionId) {
    throw new Error("messageId not found in this session.");
  }
  return {
    id: row.id,
    parentMessageId: row.parentMessageId ?? null,
    path: row.path,
    role: row.role,
  };
}

/**
 * 保存一条消息节点（消息树）
 * - 必须提供 message.id
 * - parentMessageId 不传则默认为 null（根节点）
 */
export async function saveChatMessageNode({
  sessionId,
  message,
  parentMessageId,
  allowEmpty,
}: {
  sessionId: string;
  message: TeatimeUIMessage;
  parentMessageId?: string | null;
  /** 是否允许保存空消息（用于“占位 assistant”父节点） */
  allowEmpty?: boolean;
}): Promise<SavedChatMessageNode> {
  if (!message?.id) throw new Error("message.id is required.");
  // 关键：允许前端把“根节点 parentMessageId”传空字符串（视为 null），避免误判为缺失父节点。
  const parentIdRaw = parentMessageId ?? null;
  const parentId =
    typeof parentIdRaw === "string" && parentIdRaw.trim().length === 0 ? null : parentIdRaw;

  return prisma.$transaction(async (tx) => {
    await ensureSession(tx, sessionId);

    const existing = await tx.chatMessage.findUnique({
      where: { id: message.id },
      select: {
        id: true,
        sessionId: true,
        parentMessageId: true,
        path: true,
      },
    });

    const role = normalizeRole(message.role);
    const parts = normalizeParts((message as any).parts);
    const metadata = sanitizeMetadata((message as any).metadata);
    if (!allowEmpty && !hasRenderableParts(role, parts)) {
      // 关键：空 assistant/system/tool 没有渲染价值，也不应成为 leaf
      if (existing) {
        return {
          id: existing.id,
          parentMessageId: existing.parentMessageId ?? null,
          path: existing.path,
        };
      }
      // 如果是新消息且为空，则不落库（MVP）
      const parent = parentId ? await getParentNode(tx, sessionId, parentId) : null;
      const nextSegmentSeq = await getNextPathSegmentSeq(tx, sessionId, parentId);
      const path = computeNodePath({ parentPath: parent?.path ?? null, nextSegmentSeq });
      return { id: message.id, parentMessageId: parentId, path };
    }

    if (existing) {
      if (existing.sessionId !== sessionId) {
        throw new Error("message.id already exists in another session.");
      }
      const existingParentId = existing.parentMessageId ?? null;
      if (existingParentId !== parentId) {
        throw new Error("message.id already exists with a different parentMessageId.");
      }

      await tx.chatMessage.update({
        where: { id: existing.id },
        data: {
          role,
          parts: parts as any,
          metadata: (metadata as any) ?? undefined,
        },
      });

      return {
        id: existing.id,
        parentMessageId: existingParentId,
        path: existing.path,
      };
    }

    const parent = parentId ? await getParentNode(tx, sessionId, parentId) : null;
    if (parentId && !parent) throw new Error("parentMessageId not found in this session.");

    const nextSegmentSeq = await getNextPathSegmentSeq(tx, sessionId, parentId);
    const path = computeNodePath({ parentPath: parent?.path ?? null, nextSegmentSeq });

    await tx.chatMessage.create({
      data: {
        id: message.id,
        sessionId,
        parentMessageId: parentId,
        path,
        role,
        parts: parts as any,
        metadata: (metadata as any) ?? undefined,
      },
    });

    // 关键：首条用户消息作为标题（MVP）
    if (!parent && role === "user") {
      const title = normalizeTitle(extractTitleTextFromParts(parts));
      if (title) {
        await tx.chatSession.update({
          where: { id: sessionId },
          data: { title },
        });
      }
    }

    return { id: message.id, parentMessageId: parentId, path };
  });
}

/**
 * 读取某个 leaf 的祖先链（用于渲染与发给 LLM）
 * - 返回按时间顺序（root -> leaf）
 * - take 为链路长度上限（从 leaf 往上截断）
 */
export async function loadBranchMessages({
  sessionId,
  leafMessageId,
  take = DEFAULT_BRANCH_TAKE,
}: {
  sessionId: string;
  leafMessageId: string;
  take?: number;
}): Promise<TeatimeUIMessage[]> {
  const leaf = await prisma.chatMessage.findUnique({
    where: { id: leafMessageId },
    select: { id: true, sessionId: true, path: true },
  });
  if (!leaf || leaf.sessionId !== sessionId) return [];

  // 关键：基于物化路径一次性取完整链路（避免逐条 findUnique 回溯）
  const allPaths = getPathPrefixes(String(leaf.path));
  const selectedPaths = allPaths.length > take ? allPaths.slice(-take) : allPaths;

  const rows = await prisma.chatMessage.findMany({
    where: { sessionId, path: { in: selectedPaths } },
    orderBy: [{ path: "asc" }],
    select: { id: true, role: true, parentMessageId: true, parts: true, metadata: true },
  });

  const messages: TeatimeUIMessage[] = [];
  for (const row of rows) {
    if (!row) continue;

    const role = row.role;
    const parts = normalizeParts(row.parts);
    if (!hasRenderableParts(role, parts)) continue;

    const agent = (row.metadata as any)?.agent;
    const uiMessage = {
      id: row.id,
      role,
      parts: parts as any,
      metadata: (row.metadata as any) ?? undefined,
      parentMessageId: row.parentMessageId ?? null,
      // 关键：agent 信息来自 metadata.agent（持久化层不再拆列）
      agent: agent ?? undefined,
    } satisfies TeatimeUIMessage;
    messages.push(uiMessage);
  }

  return messages;
}
