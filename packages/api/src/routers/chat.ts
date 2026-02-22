import { z } from 'zod'
import { t, shieldedProcedure } from '../../generated/routers/helpers/createRouter'
import { chatSchemas } from './absChat'
import {
  buildProjectTitleMap,
  collectProjectSubtreeIds,
  findProjectNodeWithParent,
  readWorkspaceProjectTrees,
} from '../services/projectTreeService'
import {
  getWorkspaceProjectTitleMap,
  syncWorkspaceProjectsFromDisk,
} from '../services/projectDbService'
import {
  clearProjectChatData,
  getProjectChatStats,
} from '../services/projectChatService'
import type { ChatMessageKind } from '../types/message'

/**
 * Chat UIMessage 结构（MVP）
 * - 直接给前端渲染使用（兼容 @ai-sdk/react 的 UIMessage 形状）
 */
export type ChatUIMessage = {
  id: string
  role: 'system' | 'user' | 'assistant' | 'subagent'
  /** 消息树：父消息 ID（根节点为 null） */
  parentMessageId: string | null
  parts: any[]
  metadata?: any
  /** Message kind for compaction handling. */
  messageKind?: ChatMessageKind
  /** 产生该消息的 agent 信息（便于 UI 直接读取） */
  agent?: any
}

/** Session summary for history list. */
export type ChatSessionSummary = {
  /** Session id. */
  id: string
  /** Session title. */
  title: string
  /** Session created time. */
  createdAt: Date
  /** Session updated time. */
  updatedAt: Date
  /** Whether the session is pinned. */
  isPin: boolean
  /** Whether the title is renamed by user. */
  isUserRename: boolean
  /** Error message for last failed request. */
  errorMessage: string | null
  /** Project id bound to session. */
  projectId: string | null
  /** Project name resolved from tree. */
  projectName: string | null
  /** Session message count. */
  messageCount: number
}

const MAX_VIEW_LIMIT = 200

/** Normalize optional id value. */
function normalizeOptionalId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/** Resolve boardId filter for session listing. */
function resolveBoardIdFilter(value: string | null | undefined): string | null | undefined {
  if (value === null) {
    // 中文注释：显式 null 代表仅查询未绑定 board 的会话。
    return null
  }
  return normalizeOptionalId(value)
}

const getChatViewInputSchema = z.object({
  /** 会话 id（等同于 SSE 的 sessionId / useChat 的 id） */
  sessionId: z.string().min(1),
  /**
   * 视图锚点：
   * - 不传：默认使用会话"最右叶子"
   * - 传了：用于切换 sibling 或定位到某个节点
   */
  anchor: z
    .object({
      messageId: z.string().min(1),
      /** 解析策略：切分支时通常希望跳到该子树的最新叶子 */
      strategy: z.enum(['self', 'latestLeafInSubtree']).optional(),
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
  /** 返回内容开关（同一接口覆盖"只刷新导航"和"拉取消息"） */
  include: z
    .object({
      messages: z.boolean().optional(),
      siblingNav: z.boolean().optional(),
    })
    .optional(),
  /** 是否返回工具输出内容（默认 true；历史加载可关闭） */
  includeToolOutput: z.boolean().optional(),
})

const getSubAgentHistoryInputSchema = z.object({
  sessionId: z.string().min(1),
  toolCallId: z.string().min(1),
})

export const chatRouter = t.router({
  /**
   * Get chat view — 实现放在 server（tRPC router override），
   * 这里只定义 schema 占位。
   */
  getChatView: shieldedProcedure
    .input(getChatViewInputSchema)
    .query(async (): Promise<{
      leafMessageId: string | null
      branchMessageIds: string[]
      messages: ChatUIMessage[]
      siblingNav: Record<string, any>
      errorMessage?: string | null
    }> => {
      throw new Error('Not implemented: override in server chat router.')
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
      const projectId = normalizeOptionalId(input.projectId)
      const boardId = resolveBoardIdFilter(input.boardId)
      let projectIdFilter: string[] | null = null
      let projectTitleMap = new Map<string, string>()

      const projectTrees = await readWorkspaceProjectTrees(input.workspaceId)
      if (projectId) {
        const entry = findProjectNodeWithParent(projectTrees, projectId)
        if (!entry) return []
        projectIdFilter = collectProjectSubtreeIds(entry.node)
      }

      try {
        await syncWorkspaceProjectsFromDisk(ctx.prisma, input.workspaceId, projectTrees)
        projectTitleMap = await getWorkspaceProjectTitleMap(ctx.prisma, input.workspaceId)
      } catch {
        projectTitleMap = new Map<string, string>()
      }
      const fileProjectTitleMap = buildProjectTitleMap(projectTrees)
      for (const [id, title] of fileProjectTitleMap) {
        projectTitleMap.set(id, title)
      }

      const sessions = await ctx.prisma.chatSession.findMany({
        where: {
          deletedAt: null,
          workspaceId: input.workspaceId,
          ...(boardId !== undefined ? { boardId } : {}),
          ...(projectIdFilter ? { projectId: { in: projectIdFilter } } : {}),
        },
        orderBy: [{ isPin: 'desc' }, { updatedAt: 'desc' }],
        select: {
          id: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          isPin: true,
          isUserRename: true,
          errorMessage: true,
          projectId: true,
          messageCount: true,
        },
      })

      return sessions.map((session) => ({
        ...session,
        projectName: session.projectId
          ? projectTitleMap.get(session.projectId) ?? null
          : null,
      })) as ChatSessionSummary[]
    }),

  /**
   * Get sub-agent history — 实现放在 server（tRPC router override）。
   */
  getSubAgentHistory: shieldedProcedure
    .input(getSubAgentHistoryInputSchema)
    .query(async (): Promise<{
      message: ChatUIMessage | null
      messages: Array<{
        id: string
        role: string
        parentMessageId: string | null
        parts: any[]
        metadata?: any
      }>
      agentMeta: {
        name?: string
        task?: string
        agentType?: string
      } | null
    }> => {
      throw new Error('Not implemented: override in server chat router.')
    }),

  /**
   * Get project chat stats.
   */
  getProjectChatStats: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return getProjectChatStats(ctx.prisma, input.projectId)
    }),

  /**
   * Clear chat data for a project.
   */
  clearProjectChat: shieldedProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return clearProjectChatData(ctx.prisma, input.projectId)
    }),

  /**
   * 获取聊天数据统计 — 实现放在 server（tRPC router override）。
   */
  getChatStats: shieldedProcedure.query(async (): Promise<{
    sessionCount: number
    usageTotals: {
      inputTokens: number
      outputTokens: number
      totalTokens: number
      reasoningTokens: number
      cachedInputTokens: number
    }
  }> => {
    throw new Error('Not implemented: override in server chat router.')
  }),

  /**
   * Fetch session preface content (MVP).
   * - Implemented in server chat router.
   */
  getSessionPreface: shieldedProcedure
    .input(chatSchemas.getSessionPreface.input)
    .output(chatSchemas.getSessionPreface.output)
    .query(async () => {
      throw new Error('Not implemented: override in server chat router.')
    }),

  /**
   * 清除所有聊天数据
   */
  clearAllChat: shieldedProcedure.mutation(async ({ ctx }) => {
    const sessions = await ctx.prisma.chatSession.deleteMany({})
    return {
      deletedSessions: sessions.count,
    }
  }),

  /**
   * 删除消息子树
   */
  deleteMessageSubtree: shieldedProcedure
    .input(z.object({
      sessionId: z.string().min(1),
      messageId: z.string().min(1),
    }))
    .mutation(async (): Promise<{ deletedCount: number; parentMessageId: string | null }> => {
      throw new Error('Not implemented: override in server chat router.')
    }),

  /**
   * 更新消息 parts
   */
  updateMessageParts: shieldedProcedure
    .input(z.object({
      sessionId: z.string().min(1),
      messageId: z.string().min(1),
      parts: z.any(),
    }))
    .mutation(async (): Promise<boolean> => {
      throw new Error('Not implemented: override in server chat router.')
    }),

  /**
   * 更新消息 metadata
   */
  updateMessageMetadata: shieldedProcedure
    .input(z.object({
      sessionId: z.string().min(1),
      messageId: z.string().min(1),
      metadata: z.any(),
    }))
    .mutation(async (): Promise<{ metadata: Record<string, unknown> | null }> => {
      throw new Error('Not implemented: override in server chat router.')
    }),

  /**
   * 获取单条消息的 parts（用于工具输出延迟加载）
   */
  getMessageParts: shieldedProcedure
    .input(z.object({
      sessionId: z.string().min(1),
      messageId: z.string().min(1),
    }))
    .query(async (): Promise<{ id: string; parts: any[]; metadata: any } | null> => {
      throw new Error('Not implemented: override in server chat router.')
    }),

  /**
   * 根据会话历史自动生成标题（MVP）
   * - 具体实现放在 server（tRPC router override）
   */
  autoTitle: shieldedProcedure
    .input(chatSchemas.autoTitle.input)
    .output(chatSchemas.autoTitle.output)
    .mutation(async () => {
      throw new Error('Not implemented: override in server chat router.')
    }),
})

export type ChatRouter = typeof chatRouter
