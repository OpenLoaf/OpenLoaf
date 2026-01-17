import { z } from "zod";
import { t, shieldedProcedure } from "../index";
import { chatSchemas } from "./absChat";
import {
  buildProjectTitleMap,
  collectProjectSubtreeIds,
  findProjectNodeWithParent,
  readWorkspaceProjectTrees,
} from "../services/projectTreeService";
import {
  getWorkspaceProjectTitleMap,
  syncWorkspaceProjectsFromDisk,
} from "../services/projectDbService";
import {
  clearProjectChatData,
  getProjectChatStats,
} from "../services/projectChatService";
import type { ChatMessageKind } from "../types/message";

/**
 * Chat UIMessage 结构（MVP）
 * - 直接给前端渲染使用（兼容 @ai-sdk/react 的 UIMessage 形状）
 */
export type ChatUIMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  /** 消息树：父消息 ID（根节点为 null） */
  parentMessageId: string | null;
  parts: any[];
  metadata?: any;
  /** Message kind for compaction/preface handling. */
  messageKind?: ChatMessageKind;
  /** 产生该消息的 agent 信息（便于 UI 直接读取） */
  agent?: any;
};

/** Session summary for history list. */
export type ChatSessionSummary = {
  /** Session id. */
  id: string;
  /** Session title. */
  title: string;
  /** Session created time. */
  createdAt: Date;
  /** Session updated time. */
  updatedAt: Date;
  /** Whether the session is pinned. */
  isPin: boolean;
  /** Whether the title is renamed by user. */
  isUserRename: boolean;
  /** Error message for last failed request. */
  errorMessage: string | null;
  /** Project id bound to session. */
  projectId: string | null;
  /** Project name resolved from tree. */
  projectName: string | null;
};

const DEFAULT_VIEW_LIMIT = 50;
const MAX_VIEW_LIMIT = 200;
const LEAF_CANDIDATES = 50;

type UsageTotals = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
};

const ZERO_USAGE: UsageTotals = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  reasoningTokens: 0,
  cachedInputTokens: 0,
};

/** Extract token usage from message metadata (best-effort). */
function extractUsageTotals(metadata: unknown): UsageTotals {
  const meta = metadata as any;
  const usage = meta?.totalUsage ?? meta?.usage ?? meta?.tokenUsage ?? null;
  if (!usage || typeof usage !== "object") return ZERO_USAGE;

  const toNumber = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))
        ? Number(value)
        : 0;

  return {
    inputTokens: toNumber(usage.inputTokens ?? usage.promptTokens ?? usage.input_tokens),
    outputTokens: toNumber(usage.outputTokens ?? usage.completionTokens ?? usage.output_tokens),
    totalTokens: toNumber(usage.totalTokens ?? usage.total_tokens),
    reasoningTokens: toNumber(usage.reasoningTokens ?? usage.reasoning_tokens),
    cachedInputTokens: toNumber(usage.cachedInputTokens ?? usage.cached_input_tokens),
  };
}

/** Merge multiple UsageTotals into one. */
function sumUsageTotals(list: UsageTotals[]): UsageTotals {
  const total = { ...ZERO_USAGE };
  for (const item of list) {
    total.inputTokens += item.inputTokens;
    total.outputTokens += item.outputTokens;
    total.totalTokens += item.totalTokens;
    total.reasoningTokens += item.reasoningTokens;
    total.cachedInputTokens += item.cachedInputTokens;
  }
  return total;
}

/** Normalize optional id value. */
function normalizeOptionalId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Resolve boardId filter for session listing. */
function resolveBoardIdFilter(value: string | null | undefined): string | null | undefined {
  if (value === null) {
    // 中文注释：显式 null 代表仅查询未绑定 board 的会话。
    return null;
  }
  return normalizeOptionalId(value);
}

function isRenderableRow(row: {
  role: string;
  parts: unknown;
  messageKind?: ChatMessageKind | null;
}): boolean {
  const kind = row.messageKind ?? "normal";
  if (kind === "session_preface" || kind === "compact_prompt") return false;
  if (kind === "compact_summary") return true;
  if (row.role === "user") return true;
  const parts = row.parts;
  return Array.isArray(parts) && parts.length > 0;
}

function getPathPrefixes(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  const prefixes: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    prefixes.push(segments.slice(0, i + 1).join("/"));
  }
  return prefixes;
}

/**
 * Load main-chain rows for a leaf node.
 * - Returns ordered rows (root -> leaf)
 * - Supports truncation from the leaf side via `limit`
 */
async function loadMainChainRows({
  prisma,
  sessionId,
  leafMessageId,
  limit,
}: {
  prisma: any;
  sessionId: string;
  leafMessageId: string;
  limit: number;
}): Promise<{ chainRows: any[]; nextCursorBeforeMessageId: string | null }> {
  const leaf = await prisma.chatMessage.findUnique({
    where: { id: leafMessageId },
    select: { id: true, sessionId: true, path: true },
  });
  if (!leaf || leaf.sessionId !== sessionId) {
    return { chainRows: [], nextCursorBeforeMessageId: null };
  }

  const allPaths = getPathPrefixes(String(leaf.path));
  const selectedPaths = allPaths.length > limit ? allPaths.slice(-limit) : allPaths;

  const chainRows = await prisma.chatMessage.findMany({
    where: { sessionId, path: { in: selectedPaths } },
    orderBy: [{ path: "asc" }],
    select: {
      id: true,
      sessionId: true,
      parentMessageId: true,
      role: true,
      parts: true,
      metadata: true,
      messageKind: true,
    },
  });

  // 当链路被截断时，用“本页最早节点 id”作为游标；下一页从它的 parent 往上继续取。
  const isTruncated = allPaths.length > limit;
  const nextCursorBeforeMessageId = isTruncated ? (chainRows[0]?.id ?? null) : null;
  return { chainRows, nextCursorBeforeMessageId };
}

/** Resolve latest renderable leaf id in a subtree. */
async function resolveLatestLeafId({
  prisma,
  sessionId,
  startMessageId,
}: {
  prisma: any;
  sessionId: string;
  startMessageId: string;
}): Promise<string | null> {
  const start = await prisma.chatMessage.findUnique({
    where: { id: startMessageId },
    select: { sessionId: true, path: true },
  });
  if (!start || start.sessionId !== sessionId) return null;

  // SQLite/Prisma 对 JSON 过滤支持有限，这里用“按 path 倒序取候选 + JS 过滤”实现。
  const candidates = await prisma.chatMessage.findMany({
    where: {
      sessionId,
      path: { startsWith: start.path },
    },
    orderBy: [{ path: "desc" }],
    take: LEAF_CANDIDATES,
    select: { id: true, role: true, parts: true, messageKind: true },
  });
  for (const row of candidates) {
    if (isRenderableRow(row)) return row.id;
  }
  return null;
}

/** 查询整个会话的“最右叶子”（默认选中分支） */
async function resolveSessionRightmostLeafId({
  prisma,
  sessionId,
}: {
  prisma: any;
  sessionId: string;
}): Promise<string | null> {
  const candidates = await prisma.chatMessage.findMany({
    where: {
      sessionId,
    },
    orderBy: [{ path: "desc" }],
    take: LEAF_CANDIDATES,
    select: { id: true, role: true, parts: true, messageKind: true },
  });
  for (const row of candidates) {
    if (isRenderableRow(row)) return row.id;
  }
  return null;
}

/** 计算当前消息在 siblings（同 parent）里的 prev/next（按 index 顺序） */
async function buildSiblingNavByMessageId({
  prisma,
  sessionId,
  branchRows,
}: {
  prisma: any;
  sessionId: string;
  branchRows: Array<{ id: string; parentMessageId: string | null }>;
}): Promise<
  Record<
    string,
    {
      parentMessageId: string | null;
      prevSiblingId: string | null;
      nextSiblingId: string | null;
      siblingIndex: number;
      siblingTotal: number;
    }
  >
> {
  // 说明：分支链最多 take 条（默认 50），没必要为每条消息做 4 次 DB roundtrip。
  // 这里按 parentMessageId 批量拉取 siblings，并在内存中计算 prev/next/idx/total。
  const parentIds = new Set<string>();
  let needsRoot = false;
  for (const row of branchRows) {
    if (row.parentMessageId === null) needsRoot = true;
    else parentIds.add(row.parentMessageId);
  }

  const or: any[] = [];
  const parentIdList = Array.from(parentIds);
  if (parentIdList.length > 0) or.push({ parentMessageId: { in: parentIdList } });
  if (needsRoot) or.push({ parentMessageId: null });

  if (or.length === 0) return {};

  const siblings = await prisma.chatMessage.findMany({
    where: {
      sessionId,
      OR: or,
    },
    // 关键：不再存 siblingIndex，按 path（固定宽度分段）排序即可得到稳定的 sibling 顺序
    orderBy: [{ parentMessageId: "asc" }, { path: "asc" }, { id: "asc" }],
    select: { id: true, parentMessageId: true, path: true },
  });

  const byParent = new Map<
    string,
    Array<{ id: string; parentMessageId: string | null; path: string }>
  >();
  for (const s of siblings) {
    const key = String(s.parentMessageId ?? "__root__");
    const list = byParent.get(key) ?? [];
    list.push({
      id: String(s.id),
      parentMessageId: (s.parentMessageId ?? null) as any,
      path: String(s.path),
    });
    byParent.set(key, list);
  }

  const navById: Record<
    string,
    {
      parentMessageId: string | null;
      prevSiblingId: string | null;
      nextSiblingId: string | null;
      siblingIndex: number;
      siblingTotal: number;
    }
  > = {};

  for (const [, list] of byParent) {
    const total = list.length;
    for (let i = 0; i < list.length; i += 1) {
      const current = list[i]!;
      navById[current.id] = {
        parentMessageId: current.parentMessageId,
        prevSiblingId: list[i - 1]?.id ?? null,
        nextSiblingId: list[i + 1]?.id ?? null,
        siblingIndex: i + 1,
        siblingTotal: total,
      };
    }
  }

  return navById;
}

const getChatViewInputSchema = z.object({
  /** 会话 id（等同于 SSE 的 sessionId / useChat 的 id） */
  sessionId: z.string().min(1),
  /**
   * 视图锚点：
   * - 不传：默认使用会话“最右叶子”
   * - 传了：用于切换 sibling 或定位到某个节点
   */
  anchor: z
    .object({
      messageId: z.string().min(1),
      /** 解析策略：切分支时通常希望跳到该子树的最新叶子 */
      strategy: z.enum(["self", "latestLeafInSubtree"]).optional(),
    })
    .optional(),
  /** 主链窗口（用于向上翻历史） */
  window: z
    .object({
      limit: z.number().min(1).max(MAX_VIEW_LIMIT).optional(),
      cursor: z
        .object({
          /** 上一页最早消息 id（下一页从该节点的 parent 往上继续取） */
          beforeMessageId: z.string().min(1),
        })
        .optional(),
    })
    .optional(),
  /** 返回内容开关（同一接口覆盖“只刷新导航”和“拉取消息”） */
  include: z
    .object({
      messages: z.boolean().optional(),
      siblingNav: z.boolean().optional(),
    })
    .optional(),
});

/** Resolve view leaf id from cursor. */
async function resolveLeafIdFromCursor({
  prisma,
  sessionId,
  beforeMessageId,
}: {
  prisma: any;
  sessionId: string;
  beforeMessageId: string;
}): Promise<string | null> {
  const row = await prisma.chatMessage.findUnique({
    where: { id: beforeMessageId },
    select: { sessionId: true, parentMessageId: true },
  });
  if (!row || row.sessionId !== sessionId) return null;
  return (row.parentMessageId ?? null) as string | null;
}

export const chatRouter = t.router({
  /**
   * Get chat view (MVP).
   * - Returns: main-chain messages (for render) + sibling nav (for branch switch)
   */
  getChatView: shieldedProcedure
    .input(getChatViewInputSchema)
    .query(async ({ ctx, input }) => {
      const includeMessages = input.include?.messages !== false;
      const includeSiblingNav = input.include?.siblingNav !== false;
      const limit = input.window?.limit ?? DEFAULT_VIEW_LIMIT;
      const anchorStrategy = input.anchor?.strategy ?? "latestLeafInSubtree";
      const sessionErrorMessage =
        (await ctx.prisma.chatSession.findUnique({
          where: { id: input.sessionId },
          select: { errorMessage: true },
        }))?.errorMessage ?? null;

      const leafFromCursor = input.window?.cursor?.beforeMessageId
        ? await resolveLeafIdFromCursor({
            prisma: ctx.prisma,
            sessionId: input.sessionId,
            beforeMessageId: input.window.cursor.beforeMessageId,
          })
        : null;

      const baseAnchorId =
        leafFromCursor ??
        input.anchor?.messageId ??
        (await resolveSessionRightmostLeafId({
          prisma: ctx.prisma,
          sessionId: input.sessionId,
        }));

      if (!baseAnchorId) {
        return {
          leafMessageId: null,
          branchMessageIds: [],
          errorMessage: sessionErrorMessage,
          ...(includeMessages ? { messages: [] as ChatUIMessage[] } : {}),
          ...(includeSiblingNav ? { siblingNav: {} as Record<string, any> } : {}),
          pageInfo: { nextCursor: null, hasMore: false },
        };
      }

      const leafMessageId =
        !leafFromCursor && anchorStrategy === "latestLeafInSubtree"
          ? await resolveLatestLeafId({
              prisma: ctx.prisma,
              sessionId: input.sessionId,
              startMessageId: baseAnchorId,
            })
          : baseAnchorId;

      if (!leafMessageId) {
        return {
          leafMessageId: null,
          branchMessageIds: [],
          errorMessage: sessionErrorMessage,
          ...(includeMessages ? { messages: [] as ChatUIMessage[] } : {}),
          ...(includeSiblingNav ? { siblingNav: {} as Record<string, any> } : {}),
          pageInfo: { nextCursor: null, hasMore: false },
        };
      }

      const { chainRows, nextCursorBeforeMessageId } = await loadMainChainRows({
        prisma: ctx.prisma,
        sessionId: input.sessionId,
        leafMessageId,
        limit,
      });

      const renderableRows = chainRows.filter((row) => isRenderableRow(row));
      const branchMessageIds = renderableRows.map((r) => String(r.id));

      const messages: ChatUIMessage[] = [];
      if (includeMessages) {
        for (const row of renderableRows) {
          messages.push({
            id: String(row.id),
            role: row.role,
            parentMessageId: row.parentMessageId ?? null,
            parts: Array.isArray(row.parts) ? row.parts : [],
            metadata: row.metadata ?? undefined,
            messageKind: row.messageKind ?? undefined,
            agent: (row.metadata as any)?.agent ?? undefined,
          });
        }
      }

      const siblingNavById = includeSiblingNav
        ? await buildSiblingNavByMessageId({
            prisma: ctx.prisma,
            sessionId: input.sessionId,
            branchRows: renderableRows.map((r) => ({
              id: String(r.id),
              parentMessageId: (r.parentMessageId ?? null) as string | null,
            })),
          })
        : {};

      const siblingNav: Record<
        string,
        {
          parentMessageId: string | null;
          prevSiblingId: string | null;
          nextSiblingId: string | null;
          siblingIndex: number;
          siblingTotal: number;
        }
      > = {};
      if (includeSiblingNav) {
        // 保证主链每个节点都有 siblingNav（即使只有 1 个 sibling 也要有），避免前端短暂缺失导致闪烁。
        for (const row of renderableRows) {
          const id = String(row.id);
          siblingNav[id] =
            siblingNavById[id] ??
            ({
              parentMessageId: row.parentMessageId ?? null,
              prevSiblingId: null,
              nextSiblingId: null,
              siblingIndex: 1,
              siblingTotal: 1,
            } as const);
        }
      }

      return {
        leafMessageId,
        branchMessageIds,
        errorMessage: sessionErrorMessage,
        ...(includeMessages ? { messages } : {}),
        ...(includeSiblingNav ? { siblingNav } : {}),
        pageInfo: {
          nextCursor: nextCursorBeforeMessageId
            ? { beforeMessageId: String(nextCursorBeforeMessageId) }
            : null,
          hasMore: Boolean(nextCursorBeforeMessageId),
        },
      };
    }),

  /**
   * List chat sessions for history panel.
   */
  listSessions: shieldedProcedure
    .input(
      z.object({
        workspaceId: z.string().trim().min(1),
        projectId: z.string().optional(),
        boardId: z.string().trim().min(1).nullable().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const projectId = normalizeOptionalId(input.projectId);
      const boardId = resolveBoardIdFilter(input.boardId);
      let projectIdFilter: string[] | null = null;
      let projectTitleMap = new Map<string, string>();

      const projectTrees = await readWorkspaceProjectTrees(input.workspaceId);
      if (projectId) {
        // 项目页只保留当前项目及其子项目的会话。
        const entry = findProjectNodeWithParent(projectTrees, projectId);
        if (!entry) return [];
        projectIdFilter = collectProjectSubtreeIds(entry.node);
      }

      try {
        await syncWorkspaceProjectsFromDisk(ctx.prisma, input.workspaceId, projectTrees);
        projectTitleMap = await getWorkspaceProjectTitleMap(ctx.prisma, input.workspaceId);
      } catch {
        // 逻辑：数据库同步失败时仍允许使用文件树回退显示项目名。
        projectTitleMap = new Map<string, string>();
      }
      const fileProjectTitleMap = buildProjectTitleMap(projectTrees);
      for (const [id, title] of fileProjectTitleMap) {
        projectTitleMap.set(id, title);
      }

      const sessions = await ctx.prisma.chatSession.findMany({
        where: {
          deletedAt: null,
          workspaceId: input.workspaceId,
          ...(boardId !== undefined ? { boardId } : {}),
          ...(projectIdFilter ? { projectId: { in: projectIdFilter } } : {}),
        },
        orderBy: [{ isPin: "desc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          isPin: true,
          isUserRename: true,
          errorMessage: true,
          projectId: true,
        },
      });

      return sessions.map((session) => ({
        ...session,
        projectName: session.projectId
          ? projectTitleMap.get(session.projectId) ?? null
          : null,
      })) as ChatSessionSummary[];
    }),

  /**
   * Get project chat stats.
   */
  getProjectChatStats: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return getProjectChatStats(ctx.prisma, input.projectId);
    }),

  /**
   * Clear chat data for a project.
   */
  clearProjectChat: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return clearProjectChatData(ctx.prisma, input.projectId);
    }),

  /**
   * 获取聊天数据统计（MVP）
   * - 会话数：未删除会话数量
   * - token 统计：从消息 metadata 中提取并累加（尽力而为）
   */
  getChatStats: shieldedProcedure.query(async ({ ctx }) => {
    const [sessionCount, assistantRows] = await ctx.prisma.$transaction([
      ctx.prisma.chatSession.count({ where: { deletedAt: null } }),
      ctx.prisma.chatMessage.findMany({
        where: { role: "assistant", session: { deletedAt: null } },
        select: { metadata: true },
      }),
    ]);

    // 说明：SQLite/Prisma 对 JSON 查询能力有限，这里用“拉取 metadata + JS 汇总”实现最小可用统计。
    const usageTotals = sumUsageTotals(
      assistantRows.map((r: any) => extractUsageTotals(r?.metadata)),
    );

    return { sessionCount, usageTotals };
  }),

  /**
   * 清除所有聊天数据（MVP）
   * - 直接物理删除：会话 / 消息 / 关联表
   */
  clearAllChat: shieldedProcedure.mutation(async ({ ctx }) => {
    const [messages, sessions] = await ctx.prisma.$transaction([
      ctx.prisma.chatMessage.deleteMany({}),
      ctx.prisma.chatSession.deleteMany({}),
    ]);

    return {
      deletedSessions: sessions.count,
      deletedMessages: messages.count,
    };
  }),

  /**
   * 根据会话历史自动生成标题（MVP）
   * - 具体实现放在 server（tRPC router override）
   */
  autoTitle: shieldedProcedure
    .input(chatSchemas.autoTitle.input)
    .output(chatSchemas.autoTitle.output)
    .mutation(async () => {
      throw new Error("Not implemented: override in server chat router.");
    }),
});

export type ChatRouter = typeof chatRouter;
