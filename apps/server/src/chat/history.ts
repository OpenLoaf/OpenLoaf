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

/** parts 直接保存/还原，但会过滤掉不应持久化的 part */
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
    _max: { index: true },
  });
  return (agg._max.index ?? 0) + 1;
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
  index: number;
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
      index: true,
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
    index: row.index,
    path: row.path,
    role: row.role,
  };
}

function extractAgentId(message: AnyUIMessage): string | undefined {
  const id = (message as any)?.metadata?.agent?.id;
  return typeof id === "string" && id ? id : undefined;
}

function toUserParts(userText: string | null | undefined) {
  const text = (userText ?? "").trim();
  if (!text) return [];
  return [{ type: "text", text }];
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
}: {
  sessionId: string;
  message: AnyUIMessage;
  parentMessageId?: string | null;
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
        index: true,
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
      const agentId = extractAgentId(message);

      if (role === MessageRoleEnum.USER) {
        // 关键：用户消息只存 userText，不再存 parts（避免存一整坨 JSON）
        const userText = extractUserText(message);
        await tx.chatMessage.update({
          where: { id: existing.id },
          data: {
            role,
            userText,
            agentId: null,
            meta: message.metadata ?? undefined,
            parts: { deleteMany: {} },
          },
        });
      } else {
        const parts = normalizeParts(message);
        await tx.chatMessage.update({
          where: { id: existing.id },
          data: {
            role,
            userText: null,
            agentId,
            meta: message.metadata ?? undefined,
            parts: {
              deleteMany: {},
              create: parts.map((part, index) => ({ index, state: part as any })),
            },
          },
        });
      }

      return {
        id: existing.id,
        parentMessageId: existingParentId,
        depth: existing.depth,
        index: existing.index,
        path: existing.path,
      };
    }

    const parent = parentId ? await getParentNode(tx, sessionId, parentId) : null;
    if (parentId && !parent) throw new Error("parentMessageId not found in this session.");

    const index = await getNextSiblingIndex(tx, sessionId, parentId);
    const { depth, path } = computeNodePosition({ index, parent });
    const role = toMessageRole(message.role);
    const agentId = extractAgentId(message);
    const userText = role === MessageRoleEnum.USER ? extractUserText(message) : null;
    const parts = role === MessageRoleEnum.USER ? [] : normalizeParts(message);

    await tx.chatMessage.create({
      data: {
        id: message.id,
        sessionId,
        parentMessageId: parentId,
        depth,
        index,
        path,
        role,
        userText,
        agentId: role === MessageRoleEnum.USER ? null : agentId,
        meta: message.metadata ?? undefined,
        parts: {
          create: parts.map((part, index) => ({ index, state: part as any })),
        },
      },
    });

    // 关键：首条用户消息作为标题（MVP）
    if (!parent && role === MessageRoleEnum.USER) {
      const title = userText ? normalizeTitle(userText) : "";
      if (title) {
        await tx.chatSession.update({
          where: { id: sessionId },
          data: { title },
        });
      }
    }

    return { id: message.id, parentMessageId: parentId, depth, index, path };
  });
}

/**
 * 查询某个节点子树内的最新叶子（用于“切换 sibling 后自动跳到该分支的最新链”）
 * - 依赖 ChatMessage.path（物化路径）
 */
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
    include: { parts: { orderBy: { index: "asc" } } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  const messages: AnyUIMessage[] = [];
  for (const id of slice) {
    const row = byId.get(id);
    if (!row) continue;
    const parts =
      row.role === MessageRoleEnum.USER
        ? toUserParts((row as any).userText)
        : (row.parts.map((p: any) => p.state) as any[]);
    if (parts.length === 0) continue;

    messages.push({
      id: row.id,
      role: fromMessageRole(row.role),
      metadata: (row.meta as any) ?? undefined,
      parts: parts as AnyUIMessage["parts"],
    });
  }

  return messages;
}
