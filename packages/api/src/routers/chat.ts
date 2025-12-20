import { z } from "zod";
import { t, shieldedProcedure } from "../index";

/**
 * Chat UIMessage 结构（MVP）
 * - 直接给前端渲染使用（兼容 @ai-sdk/react 的 UIMessage 形状）
 */
export type ChatUIMessage = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  /** 消息树：父消息 ID（根节点为 null） */
  parentMessageId: string | null;
  parts: any[];
  metadata?: any;
};

const messageSchema = z.object({
  id: z.string(),
  role: z.enum(["system", "user", "assistant", "tool"]),
  parentMessageId: z.string().nullable(),
  parts: z.array(z.any()),
  metadata: z.any().optional(),
});

function mapDbRoleToUiRole(role: string): ChatUIMessage["role"] {
  switch (role) {
    case "USER":
      return "user";
    case "ASSISTANT":
      return "assistant";
    case "SYSTEM":
      return "system";
    case "TOOL":
      return "tool";
    default:
      return "assistant";
  }
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
    select: { id: true, role: true, uiMessageJson: true },
  });
  for (const row of candidates) {
    if (row.role === "USER") return row.id;
    const parts = (row.uiMessageJson as any)?.parts;
    if (Array.isArray(parts) && parts.length > 0) return row.id;
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
    select: { id: true, role: true, uiMessageJson: true },
  });
  for (const row of candidates) {
    if (row.role === "USER") return row.id;
    const parts = (row.uiMessageJson as any)?.parts;
    if (Array.isArray(parts) && parts.length > 0) return row.id;
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
    orderBy: [{ parentMessageId: "asc" }, { siblingIndex: "asc" }, { id: "asc" }],
    select: { id: true, parentMessageId: true },
  });

  const byParent = new Map<string, Array<{ id: string; parentMessageId: string | null }>>();
  for (const s of siblings) {
    const key = String(s.parentMessageId ?? "__root__");
    const list = byParent.get(key) ?? [];
    list.push({ id: String(s.id), parentMessageId: (s.parentMessageId ?? null) as any });
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

const getChatBranchOutputSchema = z.object({
  /** 本次返回对应的 leafMessageId（用于前端维护“当前分支”） */
  leafMessageId: z.string().nullable(),
  /** 当前分支链上的 messageId 列表（按时间正序） */
  branchMessageIds: z.array(z.string()),
  /** 按时间正序返回（最早在前） */
  messages: z.array(messageSchema),
  /** 继续向更早祖先翻页用的 cursor；没有更多则为 null */
  nextCursor: z.string().nullable(),
  /** messageId -> siblings 导航信息（用于左右切换分支） */
  siblingNav: z.record(
    z.string(),
    z.object({
      parentMessageId: z.string().nullable(),
      prevSiblingId: z.string().nullable(),
      nextSiblingId: z.string().nullable(),
      siblingIndex: z.number().int().min(1),
      siblingTotal: z.number().int().min(1),
    }),
  ),
});

const resolveLatestLeafInputSchema = z.object({
  sessionId: z.string().min(1),
  startMessageId: z.string().min(1),
});

const listChatMessagesInputSchema = z.object({
  sessionId: z.string().min(1),
  /** 同 depth 的消息列表（可选） */
  depth: z.number().int().min(0).optional(),
  take: z.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const chatRouter = t.router({
  /**
   * 获取当前分支链（消息树）
   * - 默认从“最右叶子”开始
   * - 支持 resolveToLatestLeaf：用于“切换 sibling 后跳到该分支最新链”
   */
  getChatBranch: shieldedProcedure
    .input(getChatBranchInputSchema)
    .output(getChatBranchOutputSchema)
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

      // 关键：path 不再保存 messageId（改为 index 片段），分支链需要沿 parentMessageId 回溯
      const chainRows: any[] = [];
      let currentId: string | null = leafMessageId;
      let nextCursor: string | null = null;
      for (let i = 0; i < take && currentId; i += 1) {
        const row: any = await ctx.prisma.chatMessage.findUnique({
          where: { id: currentId },
          select: {
            id: true,
            sessionId: true,
            parentMessageId: true,
            role: true,
            uiMessageJson: true,
          },
        });
        if (!row || row.sessionId !== input.sessionId) break;
        chainRows.push(row);
        currentId = row.parentMessageId ?? null;
        if (i === take - 1) nextCursor = row.parentMessageId ?? null;
      }
      chainRows.reverse();
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
          uiMessageJson: true,
        },
      });
      // 关键：只回放 subAgent 输出，避免把 sibling/分支内容混进当前链导致重复显示
      const filteredChildrenRows = childrenRows.filter(
        (r: any) => (r?.uiMessageJson as any)?.metadata?.agent?.kind === "sub",
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
          const raw = (r.uiMessageJson as any) ?? {};
          const parts = Array.isArray(raw?.parts) ? raw.parts : [];
          // 关键：占位 assistant 没有任何内容，不应该被返回给前端渲染
          if (!parts || parts.length === 0) return;
          messages.push({
            id: r.id,
            role: mapDbRoleToUiRole(r.role),
            parentMessageId: r.parentMessageId ?? null,
            parts,
            metadata: raw?.metadata ?? undefined,
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
   * 会话消息列表（倒序分页）
   * - 支持按 depth 过滤（用于“同 depth 消息”视图）
   */
  listChatMessages: shieldedProcedure
    .input(listChatMessagesInputSchema)
    .query(async ({ ctx, input }) => {
      const take = input.take ?? 50;
      const rows = await ctx.prisma.chatMessage.findMany({
        where: {
          sessionId: input.sessionId,
          ...(typeof input.depth === "number" ? { depth: input.depth } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        skip: input.cursor ? 1 : undefined,
        select: {
          id: true,
          role: true,
          parentMessageId: true,
          depth: true,
          createdAt: true,
        },
      });

      const hasMore = rows.length > take;
      const sliced = hasMore ? rows.slice(0, take) : rows;
      const nextCursor = hasMore ? sliced[sliced.length - 1]!.id : null;

      return { messages: sliced, nextCursor };
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
});

export type ChatRouter = typeof chatRouter;
