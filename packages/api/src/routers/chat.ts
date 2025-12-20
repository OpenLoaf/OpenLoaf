import { z } from "zod";
import { t, shieldedProcedure } from "../index";

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
  /** 产生该消息的 agent 信息（便于 UI 直接读取） */
  agent?: any;
};

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

function isRenderableRow(row: { role: string; parts: unknown }): boolean {
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
 * 读取某个 leaf 的祖先链（基于 path 一次查询，减少 DB roundtrip）
 * - 返回按 path 正序（root -> leaf）
 * - take 为链路长度上限（从 leaf 往上截断）
 */
async function loadBranchChainRows({
  prisma,
  sessionId,
  leafMessageId,
  take,
}: {
  prisma: any;
  sessionId: string;
  leafMessageId: string;
  take: number;
}): Promise<{ chainRows: any[]; nextCursor: string | null }> {
  const leaf = await prisma.chatMessage.findUnique({
    where: { id: leafMessageId },
    select: { id: true, sessionId: true, path: true },
  });
  if (!leaf || leaf.sessionId !== sessionId) return { chainRows: [], nextCursor: null };

  const allPaths = getPathPrefixes(String(leaf.path));
  const selectedPaths = allPaths.length > take ? allPaths.slice(-take) : allPaths;

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
    },
  });

  // 关键：当链路被截断时，nextCursor 为“本页最早节点”的 parentMessageId（继续向上翻页用）
  const isTruncated = allPaths.length > take;
  const nextCursor = isTruncated ? (chainRows[0]?.parentMessageId ?? null) : null;
  return { chainRows, nextCursor };
}

/** 查询某个节点子树内最新的叶子节点 */
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

  // 说明：占位 assistant 会落库（用于 subAgent 挂载），但它没有 parts，不应作为 leaf。
  // Prisma/SQLite 对 JSON path 过滤支持有限，这里用“按 path 倒序取一批候选 + JS 过滤”实现。
  const candidates = await prisma.chatMessage.findMany({
    where: {
      sessionId,
      path: { startsWith: start.path },
    },
    orderBy: [{ path: "desc" }],
    take: 50,
    select: { id: true, role: true, parts: true },
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
    take: 50,
    select: { id: true, role: true, parts: true },
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

const getChatBranchInputSchema = z.object({
  /** 会话 id（等同于 SSE 的 sessionId / useChat 的 id） */
  sessionId: z.string().min(1),
  /**
   * 起点 messageId：
   * - 不传：默认使用“最右叶子”
   * - 传了但不是叶子：可配合 resolveToLatestLeaf 跳转到该子树最新链
   */
  startMessageId: z.string().optional(),
  /** 是否把 startMessageId 解析为“该子树最新叶子” */
  resolveToLatestLeaf: z.boolean().optional(),
  /** 分支链分页大小（从 leaf 往上截断） */
  take: z.number().min(1).max(200).default(50),
  /**
   * 分页游标：上一页最早消息的 parentMessageId
   * - 传了 cursor 后，将从 cursor 作为“当前 leaf”继续向上翻页
   */
  cursor: z.string().optional(),
});

const resolveLatestLeafInputSchema = z.object({
  sessionId: z.string().min(1),
  startMessageId: z.string().min(1),
});

export const chatRouter = t.router({
  /**
   * 获取当前分支链（消息树）
   * - 默认从“最右叶子”开始
   * - 支持 resolveToLatestLeaf：用于“切换 sibling 后跳到该分支最新链”
   */
  getChatBranch: shieldedProcedure
    .input(getChatBranchInputSchema)
    .query(async ({ ctx, input }) => {
      const take = input.take ?? 50;

      const baseId =
        input.cursor ??
        input.startMessageId ??
        (await resolveSessionRightmostLeafId({
          prisma: ctx.prisma,
          sessionId: input.sessionId,
        }));
      if (!baseId) {
        return { leafMessageId: null, branchMessageIds: [], messages: [], nextCursor: null, siblingNav: {} };
      }

      const leafMessageId =
        !input.cursor && input.resolveToLatestLeaf
          ? await resolveLatestLeafId({
              prisma: ctx.prisma,
              sessionId: input.sessionId,
              startMessageId: baseId,
            })
          : baseId;
      if (!leafMessageId) {
        return { leafMessageId: null, branchMessageIds: [], messages: [], nextCursor: null, siblingNav: {} };
      }

      const { chainRows, nextCursor } = await loadBranchChainRows({
        prisma: ctx.prisma,
        sessionId: input.sessionId,
        leafMessageId,
        take,
      });
      const branchMessageIds = chainRows.map((r) => String(r.id));
      const byId = new Map(chainRows.map((r: any) => [r.id, r]));

      // 关键：返回“分支链 + 分支节点的直接子消息（不在链上）”
      // - 分支链用于主对话显示
      // - 子消息仅用于 subAgent 输出（避免把 sibling/分支内容混进当前链导致重复显示）
      const childrenRows = await ctx.prisma.chatMessage.findMany({
        where: {
          sessionId: input.sessionId,
          parentMessageId: { in: branchMessageIds },
          id: { notIn: branchMessageIds },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          parentMessageId: true,
          role: true,
          parts: true,
          metadata: true,
        },
      });
      // 关键：只回放 subAgent 输出，避免把 sibling/分支内容混进当前链导致重复显示
      const filteredChildrenRows = childrenRows.filter(
        (r: any) => (r?.metadata as any)?.agent?.kind === "sub",
      );
      const childrenByParentId = new Map<string, any[]>();
      for (const row of filteredChildrenRows) {
        const pid = String(row.parentMessageId);
        const arr = childrenByParentId.get(pid) ?? [];
        arr.push(row);
        childrenByParentId.set(pid, arr);
      }

      const messages: ChatUIMessage[] = [];
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

      const siblingNavById = await buildSiblingNavByMessageId({
        prisma: ctx.prisma,
        sessionId: input.sessionId,
        branchRows: chainRows.map((r) => ({
          id: String(r.id),
          parentMessageId: (r.parentMessageId ?? null) as string | null,
        })),
      });

      for (const id of branchMessageIds) {
        const row = byId.get(id);
        if (!row) continue;
        const pushRow = (r: any) => {
          const parts = Array.isArray(r.parts) ? r.parts : [];
          // 关键：占位 assistant 没有任何内容，不应该被返回给前端渲染
          if (!parts || parts.length === 0) return;
          messages.push({
            id: r.id,
            role: r.role,
            parentMessageId: r.parentMessageId ?? null,
            parts,
            metadata: r.metadata ?? undefined,
            agent: (r.metadata as any)?.agent ?? undefined,
          });
        };

        pushRow(row);
        for (const child of childrenByParentId.get(row.id) ?? []) {
          pushRow(child);
        }

        const nav =
          siblingNavById[String(row.id)] ??
          ({
            parentMessageId: row.parentMessageId ?? null,
            prevSiblingId: null,
            nextSiblingId: null,
            siblingIndex: 1,
            siblingTotal: 1,
          } as const);
        siblingNav[String(row.id)] = nav;
      }

      return { leafMessageId, branchMessageIds, messages, nextCursor, siblingNav };
    }),

  /**
   * 仅获取分支元信息（不返回 messages）
   * - 用于 retry/resend 后刷新 siblingNav，而不覆盖当前流式消息
   */
  getChatBranchMeta: shieldedProcedure
    .input(getChatBranchInputSchema)
    .query(async ({ ctx, input }) => {
      const take = input.take ?? 50;

      const baseId =
        input.cursor ??
        input.startMessageId ??
        (await resolveSessionRightmostLeafId({
          prisma: ctx.prisma,
          sessionId: input.sessionId,
        }));
      if (!baseId) {
        return { leafMessageId: null, branchMessageIds: [], siblingNav: {} };
      }

      const leafMessageId =
        !input.cursor && input.resolveToLatestLeaf
          ? await resolveLatestLeafId({
              prisma: ctx.prisma,
              sessionId: input.sessionId,
              startMessageId: baseId,
            })
          : baseId;
      if (!leafMessageId) {
        return { leafMessageId: null, branchMessageIds: [], siblingNav: {} };
      }

      const { chainRows } = await loadBranchChainRows({
        prisma: ctx.prisma,
        sessionId: input.sessionId,
        leafMessageId,
        take,
      });
      const branchMessageIds = chainRows.map((r) => String(r.id));

      const siblingNavById = await buildSiblingNavByMessageId({
        prisma: ctx.prisma,
        sessionId: input.sessionId,
        branchRows: chainRows.map((r) => ({
          id: String(r.id),
          parentMessageId: (r.parentMessageId ?? null) as string | null,
        })),
      });

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
      for (const row of chainRows) {
        const nav =
          siblingNavById[String(row.id)] ??
          ({
            parentMessageId: row.parentMessageId ?? null,
            prevSiblingId: null,
            nextSiblingId: null,
            siblingIndex: 1,
            siblingTotal: 1,
          } as const);
        siblingNav[String(row.id)] = nav;
      }

      return { leafMessageId, branchMessageIds, siblingNav };
    }),

  /** 获取某个节点子树内最新叶子 */
  resolveLatestLeaf: shieldedProcedure
    .input(resolveLatestLeafInputSchema)
    .query(async ({ ctx, input }) => {
      const leafMessageId = await resolveLatestLeafId({
        prisma: ctx.prisma,
        sessionId: input.sessionId,
        startMessageId: input.startMessageId,
      });
      return { leafMessageId };
    }),

  /**
   * 获取最近的会话列表
   */
  getRecentSessions: shieldedProcedure
    .input(z.object({ limit: z.number().min(1).max(10).default(3) }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 3;
      return ctx.prisma.chatSession.findMany({
        where: { deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          updatedAt: true,
        },
      });
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
    const [pageLinks, messages, sessions] = await ctx.prisma.$transaction([
      ctx.prisma.pageChatSession.deleteMany({}),
      ctx.prisma.chatMessage.deleteMany({}),
      ctx.prisma.chatSession.deleteMany({}),
    ]);

    return {
      deletedSessions: sessions.count,
      deletedMessages: messages.count,
      deletedPageLinks: pageLinks.count,
    };
  }),
});

export type ChatRouter = typeof chatRouter;
