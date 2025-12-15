import { z } from "zod";
import { t, shieldedProcedure } from "../index";

/**
 * Chat UIMessage 结构（MVP）
 * - 目标：返回的结构能被 `apps/web/src/components/chat/message/MessageList.tsx` 直接渲染
 * - 说明：这里不强依赖 ai-sdk 的复杂类型推断，避免 Prisma + tRPC 组合导致 TS 推断过深
 */
export type ChatUIMessage = {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  parts: any[];
  metadata?: any;
};

const getChatMessageHistoryInputSchema = z.object({
  /** 会话 id（等同于 SSE 的 sessionId / useChat 的 id） */
  sessionId: z.string().min(1),
  /** 分页大小 */
  take: z.number().min(1).max(200).default(50),
  /**
   * 游标（上一页最后一条 messageId）
   * - 采用 messageId cursor，简单稳定
   */
  cursor: z.string().optional(),
});

const getChatMessageHistoryOutputSchema = z.object({
  /** 按 createdAt 倒序返回（最新在前） */
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["system", "user", "assistant", "tool"]),
      parts: z.array(z.any()),
      metadata: z.any().optional(),
    })
  ),
  /** 继续分页用的 cursor；没有更多则为 null */
  nextCursor: z.string().nullable(),
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
      // 兜底：未知角色当作 assistant 展示（避免前端崩）
      return "assistant";
  }
}

export const chatRouter = t.router({
  /**
   * 获取某个 session 的历史消息（分页、倒序）
   * - 倒序返回：便于“加载更多”场景（先拿最新）
   * - parts：按 index 升序还原
   * - meta：透传到 UIMessage.metadata（例如 token usage）
   */
  getChatMessageHistory: shieldedProcedure
    .input(getChatMessageHistoryInputSchema)
    .output(getChatMessageHistoryOutputSchema)
    .query(async ({ ctx, input }) => {
      const take = input.take ?? 50;
      const rows = await ctx.prisma.chatMessage.findMany({
        where: { sessionId: input.sessionId },
        orderBy: { createdAt: "desc" },
        take: take + 1, // 多取 1 条用于判断是否还有下一页
        cursor: input.cursor ? { id: input.cursor } : undefined,
        skip: input.cursor ? 1 : undefined,
        include: {
          parts: {
            orderBy: { index: "asc" },
          },
        },
      });

      const hasMore = rows.length > take;
      const sliced = hasMore ? rows.slice(0, take) : rows;
      const nextCursor = hasMore ? sliced[sliced.length - 1]!.id : null;

      const messages: ChatUIMessage[] = sliced.map((m) => ({
        id: m.id,
        role: mapDbRoleToUiRole(m.role),
        // state 存的是 ai-sdk 的 part 原始结构；没有就退化成 { type }
        parts: m.parts.map((p) => p.state ?? { type: p.type }),
        metadata: m.meta ?? undefined,
      }));

      return { messages, nextCursor };
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
