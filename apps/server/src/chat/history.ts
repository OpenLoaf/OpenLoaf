import { prisma } from "@teatime-ai/db";
import {
  MessageRole as MessageRoleEnum,
  type MessageRole as MessageRoleType,
  type Prisma,
} from "@teatime-ai/db/prisma/generated/client";
import type { UIMessage } from "ai";

type AnyUIMessage = UIMessage<any, any, any>;

const MAX_SESSION_TITLE_CHARS = 16;
const DEFAULT_BRANCH_TAKE = 50;
const PATH_SEGMENT_WIDTH = 8;
const REDUNDANT_METADATA_KEYS = ["parentMessageId", "depth", "totalUsage"] as const;

/** UIMessage.role -> DB enum */
function toMessageRole(role: AnyUIMessage["role"]): MessageRoleType {
  switch (role) {
    case "assistant":
      return MessageRoleEnum.ASSISTANT;
    case "system":
      return MessageRoleEnum.SYSTEM;
    case "user":
    default:
      return MessageRoleEnum.USER;
  }
}

/** DB enum -> UIMessage.role */
function fromMessageRole(role: MessageRoleType): AnyUIMessage["role"] {
  switch (role) {
    case MessageRoleEnum.ASSISTANT:
      return "assistant";
    case MessageRoleEnum.SYSTEM:
      return "system";
    case MessageRoleEnum.USER:
    default:
      return "user";
  }
}

/**
 * 判断该 part 是否应该跳过持久化
 * - `step-start` 属于步骤边界标记，不是用户/模型内容
 */
function isSkippablePart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  return (part as any).type === "step-start";
}

/**
 * 标准化 UIMessage.parts：
 * - 过滤掉不应持久化的 part（例如 step-start）
 */
function normalizeParts(message: AnyUIMessage): AnyUIMessage["parts"] {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts.filter((part) => !isSkippablePart(part));
}

function extractUserText(message: AnyUIMessage): string {
  const parts = Array.isArray(message.parts) ? (message.parts as any[]) : [];
  const chunks: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    if (part.type === "text" && typeof part.text === "string") {
      chunks.push(part.text);
      continue;
    }
    if (typeof part.text === "string") chunks.push(part.text);
  }
  return chunks.join("\n").trim();
}

/**
 * 从 UIMessage.metadata 中提取 totalUsage（用于单独列存储）
 * - 只做结构透传，不做强校验（MVP）
 */
function extractTotalUsage(message: AnyUIMessage): unknown | null {
  const usage = (message as any)?.metadata?.totalUsage;
  return usage === undefined ? null : usage;
}

/** 移除 metadata 中的冗余字段（parent/depth/totalUsage 等） */
function stripRedundantMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const raw = metadata as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if ((REDUNDANT_METADATA_KEYS as readonly string[]).includes(k)) continue;
    next[k] = v;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * 规范化待写入 DB 的 UIMessage：
 * - 确保 parts 为数组
 * - 过滤掉不应持久化的 part
 * - 去掉冗余字段：id/parentMessageId/depth/totalUsage 等
 */
function normalizeUiMessageForDb(
  message: AnyUIMessage,
): { uiMessageJson: Record<string, unknown>; totalUsage: unknown | null } {
  const normalizedParts = normalizeParts(message);
  const totalUsage = extractTotalUsage(message);
  const metadata = stripRedundantMetadata((message as any)?.metadata);

  // 关键：uiMessageJson 只保存“渲染快照”，消息树信息以列为准（避免冗余/不一致）
  return {
    totalUsage,
    uiMessageJson: {
      parts: normalizedParts as any,
      ...(metadata ? { metadata } : {}),
    },
  };
}

/**
 * 判断一条消息是否有可渲染内容（用于跳过“空 assistant”）
 * - USER 允许只存 text part
 * - ASSISTANT/SYSTEM/TOOL 如果 parts 为空，则直接跳过落库/回放
 */
function hasRenderableParts(message: AnyUIMessage): boolean {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts.length > 0;
}

function normalizeTitle(raw: string): string {
  let title = (raw ?? "").trim();
  title = title.replace(/^["'“”‘’《》]+/, "").replace(/["'“”‘’《》]+$/, "");
  title = title.split("\n")[0]?.trim() ?? "";
  if (title.length > MAX_SESSION_TITLE_CHARS) title = title.slice(0, MAX_SESSION_TITLE_CHARS);
  return title.trim();
}

async function ensureSession(tx: Prisma.TransactionClient, sessionId: string) {
  await tx.chatSession.upsert({
    where: { id: sessionId },
    update: {},
    create: { id: sessionId },
  });
}

/**
 * 获取父节点信息（用于计算 depth/path）
 * - 这里只允许同 session 内的引用，避免错误串链
 */
async function getParentNode(
  tx: Prisma.TransactionClient,
  sessionId: string,
  parentMessageId: string,
) {
  const parent = await tx.chatMessage.findUnique({
    where: { id: parentMessageId },
    select: { id: true, sessionId: true, depth: true, path: true },
  });
  if (!parent) return null;
  if (parent.sessionId !== sessionId) return null;
  return parent;
}

function toPathSegment(index: number): string {
  // 关键：path 用固定宽度的 index 片段，保证字符串排序 === 分支“最右”策略
  return String(index).padStart(PATH_SEGMENT_WIDTH, "0");
}

/**
 * 获取同 parent 下的下一个 index（从 1 开始递增）
 * - 关键：这是消息树“最右叶子”策略的基础（按 index 决定 sibling 顺序）
 */
async function getNextSiblingIndex(
  tx: Prisma.TransactionClient,
  sessionId: string,
  parentMessageId: string | null,
): Promise<number> {
  const agg = await tx.chatMessage.aggregate({
    where: { sessionId, parentMessageId: parentMessageId ?? null },
    _max: { siblingIndex: true },
  });
  return (agg._max.siblingIndex ?? 0) + 1;
}

/** 计算新节点的 depth/index/path */
function computeNodePosition({
  index,
  parent,
}: {
  index: number;
  parent: { depth: number; path: string } | null;
}) {
  const depth = parent ? parent.depth + 1 : 0;
  const seg = toPathSegment(index);
  const path = parent ? `${parent.path}/${seg}` : seg;
  return { depth, path };
}

type SavedChatMessageNode = {
  id: string;
  parentMessageId: string | null;
  depth: number;
  siblingIndex: number;
  path: string;
};

/**
 * 读取已存在的消息节点（用于 retry / 只读场景）
 * - 关键：retry 时不能再次保存同 id 的 user 消息，否则会造成“覆盖/串链/冲突”
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
      depth: true,
      siblingIndex: true,
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
    depth: row.depth,
    siblingIndex: row.siblingIndex,
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
  message: AnyUIMessage;
  parentMessageId?: string | null;
  /** 是否允许保存空消息（用于“占位 assistant”父节点） */
  allowEmpty?: boolean;
}): Promise<SavedChatMessageNode> {
  if (!message?.id) throw new Error("message.id is required.");
  const parentId = parentMessageId ?? null;

  return prisma.$transaction(async (tx) => {
    await ensureSession(tx, sessionId);

    const existing = await tx.chatMessage.findUnique({
      where: { id: message.id },
      select: {
        id: true,
        sessionId: true,
        parentMessageId: true,
        depth: true,
        siblingIndex: true,
        path: true,
      },
    });

    if (existing) {
      if (existing.sessionId !== sessionId) {
        throw new Error("message.id already exists in another session.");
      }
      const existingParentId = existing.parentMessageId ?? null;
      if (existingParentId !== parentId) {
        throw new Error("message.id already exists with a different parentMessageId.");
      }

      const role = toMessageRole(message.role);
      const normalized = normalizeUiMessageForDb(message);
      if (
        !allowEmpty &&
        role !== MessageRoleEnum.USER &&
        !hasRenderableParts({ ...(message as any), parts: normalized.uiMessageJson.parts } as any)
      ) {
        // 关键：空 assistant/system/tool 没有渲染价值，也不应成为 leaf
        return {
          id: existing.id,
          parentMessageId: existingParentId,
          depth: existing.depth,
          siblingIndex: existing.siblingIndex,
          path: existing.path,
        };
      }

      await tx.chatMessage.update({
        where: { id: existing.id },
        data: {
          role,
          totalUsage: normalized.totalUsage as any,
          uiMessageJson: normalized.uiMessageJson as any,
        },
      });

      return {
        id: existing.id,
        parentMessageId: existingParentId,
        depth: existing.depth,
        siblingIndex: existing.siblingIndex,
        path: existing.path,
      };
    }

    const parent = parentId ? await getParentNode(tx, sessionId, parentId) : null;
    if (parentId && !parent) throw new Error("parentMessageId not found in this session.");

    const siblingIndex = await getNextSiblingIndex(tx, sessionId, parentId);
    const { depth, path } = computeNodePosition({ index: siblingIndex, parent });
    const role = toMessageRole(message.role);
    const normalized = normalizeUiMessageForDb(message);
    if (
      !allowEmpty &&
      role !== MessageRoleEnum.USER &&
      !hasRenderableParts({ ...(message as any), parts: normalized.uiMessageJson.parts } as any)
    ) {
      // 关键：空 assistant/system/tool 直接跳过落库（避免默认分支选中空消息）
      return { id: message.id, parentMessageId: parentId, depth, siblingIndex, path };
    }

    await tx.chatMessage.create({
      data: {
        id: message.id,
        sessionId,
        parentMessageId: parentId,
        depth,
        siblingIndex,
        path,
        role,
        totalUsage: normalized.totalUsage as any,
        uiMessageJson: normalized.uiMessageJson as any,
      },
    });

    // 关键：首条用户消息作为标题（MVP）
    if (!parent && role === MessageRoleEnum.USER) {
      const title = normalizeTitle(extractUserText({ ...(message as any), parts: normalized.uiMessageJson.parts } as any));
      if (title) {
        await tx.chatSession.update({
          where: { id: sessionId },
          data: { title },
        });
      }
    }

    return { id: message.id, parentMessageId: parentId, depth, siblingIndex, path };
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
}): Promise<AnyUIMessage[]> {
  // 关键：path 不再保存 messageId（改为 index 片段），祖先链需要沿 parentMessageId 向上回溯
  const chain: string[] = [];
  let currentId: string | null = leafMessageId;
  for (let i = 0; i < take && currentId; i += 1) {
    const row: { id: string; sessionId: string; parentMessageId: string | null } | null =
      await prisma.chatMessage.findUnique({
        where: { id: currentId },
        select: { id: true, sessionId: true, parentMessageId: true },
      });
    if (!row || row.sessionId !== sessionId) break;
    chain.push(row.id);
    currentId = row.parentMessageId ?? null;
  }
  const slice = chain.reverse();
  if (slice.length === 0) return [];

  const rows = await prisma.chatMessage.findMany({
    where: { id: { in: slice } },
    select: { id: true, role: true, uiMessageJson: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const messages: AnyUIMessage[] = [];
  for (const id of slice) {
    const row = byId.get(id);
    if (!row) continue;
    const raw = (row.uiMessageJson as any) ?? {};
    const message: AnyUIMessage = {
      id: row.id,
      role: fromMessageRole(row.role as any),
      parts: (Array.isArray(raw?.parts) ? raw.parts : []) as any,
      metadata: raw?.metadata ?? undefined,
    };
    if (!hasRenderableParts(message)) continue;
    messages.push(message);
  }

  return messages;
}
