/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from 'zod'
import { t, shieldedProcedure } from '../../generated/routers/helpers/createRouter'
import { chatSchemas } from './absChat'
import {
  buildProjectIconMap,
  buildProjectTitleMap,
  collectProjectSubtreeIds,
  findProjectNodeWithParent,
  readProjectTrees,
} from '../services/projectTreeService'
import {
  getProjectTitleMap,
  syncProjectsFromDisk,
} from '../services/projectDbService'
import {
  clearProjectChatData,
  getProjectChatStats,
} from '../services/projectChatService'
import { readSessionAutoTestSummary } from '../services/sessionAutoTestService'
import type {
  AutoTestEvaluationResult,
  AutoTestVerdict,
  ChatMessageKind,
  ProbeMeta,
} from '../types/message'

/**
 * Chat UIMessage 结构（MVP）
 * - 直接给前端渲染使用（兼容 @ai-sdk/react 的 UIMessage 形状）
 */
export type ChatUIMessage = {
  id: string
  role: 'system' | 'user' | 'assistant' | 'subagent' | 'task-report'
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
  /** Project icon resolved from tree. */
  projectIcon: string | null
  /** Session message count. */
  messageCount: number
  /** 会话目录下是否有附件资源（asset/）；由写入端同步。 */
  hasAssets: boolean
  /** 由外部探针（ai-browser-test 等）写入 session.json 的自动化测试标记。 */
  autoTest: boolean
  /** EVALUATION.json 里的 aggregate.score；未评审为 null。 */
  autoTestScore: number | null
  /** EVALUATION.json 里的 aggregate.verdict；未评审为 null。 */
  autoTestVerdict: 'PASS' | 'FAIL' | 'PARTIAL' | null
}

/** Paginated session list page. */
export type ChatSessionListPage = {
  items: ChatSessionSummary[]
  total: number
  cursor: string | null
  nextCursor: string | null
  pageSize: number
  hasMore: boolean
}

export type CopySessionToBoardResult = {
  /** Target board metadata. */
  board: {
    id: string
    title: string
    folderUri: string
    projectId: string | null
  }
  /** Target session id (always equals board id). */
  targetSessionId: string
  /** Whether this call created a new board. */
  createdBoard: boolean
  /** Import batch id used for copied resources. */
  importBatchId: string
  /** Number of imported messages. */
  importedMessageCount: number
  /** Number of copied files. */
  copiedFileCount: number
  /** Imported messages in chronological order. */
  importedMessages: Array<ChatUIMessage & { createdAt: string }>
}

const MAX_VIEW_LIMIT = 200

/** Normalize optional id value. */
function normalizeOptionalId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

const DEFAULT_SESSION_PAGE_SIZE = 30
const MAX_SESSION_PAGE_SIZE = 100

/** Normalize session list page size into a safe bounded integer. */
function normalizeSessionPageSize(pageSize?: number | null): number {
  if (!pageSize || Number.isNaN(pageSize)) return DEFAULT_SESSION_PAGE_SIZE
  const normalized = Math.floor(pageSize)
  if (normalized < 1) return DEFAULT_SESSION_PAGE_SIZE
  return Math.min(normalized, MAX_SESSION_PAGE_SIZE)
}

/** Decode offset cursor for paginated session list queries. */
function decodeSessionListCursor(cursor?: string | null): number {
  if (!cursor) return 0
  const offset = Number.parseInt(cursor, 10)
  if (Number.isNaN(offset) || offset < 0) return 0
  return offset
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

/** Background process summary transported to the frontend. */
export type BackgroundTaskSummary = {
  id: string
  kind: 'shell' | 'agent'
  status: 'running' | 'completed' | 'failed' | 'killed'
  description: string
  startTime: number
  endTime?: number
  pid?: number
  command?: string
  agentId?: string
  exitCode?: number
}

/** Session update event yielded by onSessionUpdate subscription. */
export type SessionUpdateEvent =
  | {
      /**
       * Scheduled task completion notification. NOT a message-tree mutation.
       * The frontend should render this as an independent notification (toast / bell),
       * NEVER insert it into the chat message tree.
       */
      type: 'schedule-report'
      kind: 'notification'
      taskId: string
      status: 'completed' | 'failed'
      title: string
      summary: string
      agentName?: string
    }
  | {
      type: 'ScheduledTaskStatus-change'
      taskId: string
      status: string
      previousStatus: string
      title: string
    }
  | {
      type: 'bg-task-update'
      task: BackgroundTaskSummary
    }

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
        projectId: z.string().optional(),
        boardId: z.string().trim().min(1).nullable().optional(),
        cursor: z.string().nullable().optional(),
        pageSize: z.number().int().min(1).max(100).nullable().optional(),
        /** 标题模糊搜索关键词；空白分词后按 AND 语义匹配。 */
        query: z.string().trim().max(200).optional(),
      }),
    )
    .query(async ({ ctx, input }): Promise<ChatSessionListPage> => {
      const projectId = normalizeOptionalId(input.projectId)
      const boardId = resolveBoardIdFilter(input.boardId)
      const pageSize = normalizeSessionPageSize(input.pageSize)
      const offset = decodeSessionListCursor(input.cursor)
      const queryTokens = (input.query ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 8)
      let projectIdFilter: string[] | null = null
      let projectTitleMap = new Map<string, string>()

      const projectTrees = await readProjectTrees()
      if (projectId) {
        const entry = findProjectNodeWithParent(projectTrees, projectId)
        if (!entry) return { items: [], total: 0, cursor: input.cursor ?? null, nextCursor: null, pageSize, hasMore: false }
        projectIdFilter = collectProjectSubtreeIds(entry.node)
      }

      try {
        await syncProjectsFromDisk(ctx.prisma, projectTrees)
        projectTitleMap = await getProjectTitleMap(ctx.prisma)
      } catch {
        projectTitleMap = new Map<string, string>()
      }
      const fileProjectTitleMap = buildProjectTitleMap(projectTrees)
      for (const [id, title] of fileProjectTitleMap) {
        projectTitleMap.set(id, title)
      }
      const projectIconMap = buildProjectIconMap(projectTrees)

      const where = {
        deletedAt: null,
        id: { not: { startsWith: 'task-' } },
        ...(boardId !== undefined ? { boardId } : {}),
        ...(projectIdFilter ? { projectId: { in: projectIdFilter } } : {}),
        // SQLite LIKE 对 ASCII 不区分大小写；CJK 直接字符匹配。每个 token 独立 AND。
        ...(queryTokens.length > 0
          ? { AND: queryTokens.map((tok) => ({ title: { contains: tok } })) }
          : {}),
      }

      const total = await ctx.prisma.chatSession.count({ where })
      const boundedOffset = Math.min(offset, total)

      const sessions = await ctx.prisma.chatSession.findMany({
        where,
        orderBy: [{ isPin: 'desc' }, { updatedAt: 'desc' }],
        skip: boundedOffset,
        take: pageSize,
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
          hasAssets: true,
        },
      })

      // 自动化探针字段并发从 session.json / EVALUATION.json 派生，只读，单行失败不阻塞列表。
      const autoTestSummaries = await Promise.all(
        sessions.map((row) => readSessionAutoTestSummary(row.id, row.projectId ?? null)),
      )
      const items = sessions.map((session, i) => ({
        ...session,
        projectName: session.projectId
          ? projectTitleMap.get(session.projectId) ?? null
          : null,
        projectIcon: session.projectId
          ? projectIconMap.get(session.projectId) ?? null
          : null,
        autoTest: autoTestSummaries[i]?.autoTest ?? false,
        autoTestScore: autoTestSummaries[i]?.autoTestScore ?? (null as number | null),
        autoTestVerdict:
          autoTestSummaries[i]?.autoTestVerdict ?? (null as AutoTestVerdict | null),
      })) as ChatSessionSummary[]

      const nextOffset = boundedOffset + items.length
      const hasMore = nextOffset < total

      return {
        items,
        total,
        cursor: input.cursor ?? null,
        nextCursor: hasMore ? String(nextOffset) : null,
        pageSize,
        hasMore,
      }
    }),

  /**
   * Get SubAgent history — 实现放在 server（tRPC router override）。
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
   * Read all messages from messages.jsonl for debug inspection.
   * - Implemented in server chat router.
   */
  getSessionMessages: shieldedProcedure
    .input(chatSchemas.getSessionMessages.input)
    .output(chatSchemas.getSessionMessages.output)
    .query(async () => {
      throw new Error('Not implemented: override in server chat router.')
    }),

  /**
   * Read debug step files for a specific assistant message.
   * - Implemented in server chat router.
   */
  getMessageDebugSteps: shieldedProcedure
    .input(chatSchemas.getMessageDebugSteps.input)
    .output(chatSchemas.getMessageDebugSteps.output)
    .query(async () => {
      throw new Error('Not implemented: override in server chat router.')
    }),

  /**
   * List sub-agents for a chat session.
   * - Implemented in server chat router.
   */
  listSubAgents: shieldedProcedure
    .input(chatSchemas.listSubAgents.input)
    .output(chatSchemas.listSubAgents.output)
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
    .mutation(async (): Promise<{
      deletedCount: number
      parentMessageId: string | null
      snapshot: {
        leafMessageId: string | null
        branchMessageIds: string[]
        messages: ChatUIMessage[]
        siblingNav: Record<string, any>
        errorMessage?: string | null
      }
    }> => {
      throw new Error('Not implemented: override in server chat router.')
    }),

  /**
   * 更新消息 parts
   */
  updateMessageParts: shieldedProcedure
    .input(z.object({
      sessionId: z.string().min(1),
      messageId: z.string().min(1),
      parts: z.array(z.record(z.string(), z.unknown())).or(z.array(z.unknown())),
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
      metadata: z.record(z.string(), z.unknown()),
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
   * Copy an existing chat session into a board-backed chat session.
   */
  copySessionToBoard: shieldedProcedure
    .input(z.object({
      sourceSessionId: z.string().min(1),
      targetBoardId: z.string().min(1).optional(),
    }))
    .mutation(async (): Promise<CopySessionToBoardResult> => {
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

  /**
   * List chat sessions for sidebar overview.
   */
  listSidebarSessions: shieldedProcedure
    .input(
      z.object({
        projectId: z.string().nullable().optional(),
        limit: z.number().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const sessions = await ctx.prisma.chatSession.findMany({
        where: {
          deletedAt: null,
          projectId: input.projectId,
        },
        orderBy: [{ isPin: 'desc' }, { updatedAt: 'desc' }],
        take: input.limit,
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

      // 占位：真正的 autoTest 从 session.json 派生，由 server chat router 覆写。
      // 这里给出类型骨架以便前端 tRPC 推导出正确的返回字段。
      return sessions.map((row) => ({ ...row, autoTest: false as boolean }))
    }),

  /**
   * Get a single chat session
   */
  getSession: shieldedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const session = await ctx.prisma.chatSession.findUnique({
        where: { id: input.sessionId },
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

      if (!session) return null
      // 占位：真正的 autoTest/probeMeta 从 session.json 派生，由 server chat router 覆写。
      return { ...session, autoTest: false as boolean, probeMeta: null as ProbeMeta | null }
    }),

  /**
   * 读取自动化探针（ai-browser-test 等）写入的 EVALUATION.json。
   * 真实实现在 server chat router 覆写，此处仅提供 tRPC 类型骨架。
   */
  getAutoTestEvaluation: shieldedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(async (): Promise<AutoTestEvaluationResult> => {
      throw new Error('Not implemented: override in server chat router.')
    }),

  /**
   * Delete a chat session
   */
  deleteSession: shieldedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.chatSession.update({
        where: { id: input.sessionId },
        data: { deletedAt: new Date() },
      })

      return { success: true }
    }),

  /**
   * Subscribe to session updates (task reports from background agents).
   * Yields SessionUpdateEvent when a background task reports to this session.
   */
  onSessionUpdate: shieldedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .subscription(async function* (): AsyncGenerator<SessionUpdateEvent> {
      throw new Error('Not implemented: override in server chat router.')
    }),

  /**
   * Update a chat session
   */
  updateSession: shieldedProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        title: z.string().optional(),
        isPin: z.boolean().optional(),
        isUserRename: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { sessionId, ...data } = input

      const session = await ctx.prisma.chatSession.update({
        where: { id: sessionId },
        data,
      })

      return session
    }),
  /**
   * Cancel a running background task (shell or agent). Server-side implementation
   * checks ownership by sessionId before killing.
   */
  cancelBackgroundProcess: shieldedProcedure
    .input(z.object({ taskId: z.string().min(1), sessionId: z.string().min(1) }))
    .mutation(
      async (): Promise<{ ok: boolean; status: 'killed' | 'already-done' | 'not-found' }> => {
        throw new Error('Not implemented: override in server chat router.')
      },
    ),

  /**
   * List background tasks currently registered for a session.
   */
  listBackgroundProcesses: shieldedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(async (): Promise<{ tasks: BackgroundTaskSummary[] }> => {
      throw new Error('Not implemented: override in server chat router.')
    }),

  /** List plan files for a session — implementation in server. */
  listPlanFiles: shieldedProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .query(async (): Promise<
      Array<{
        planNo: number
        status: string
        actionName: string
        createdAt: string
        updatedAt: string
        fileName: string
        filePath: string
      }>
    > => {
      throw new Error('Not implemented in base router')
    }),
  /** Read a single PLAN file — implementation in server. Accepts either planFilePath (preferred) or legacy planNo. */
  readPlanFile: shieldedProcedure
    .input(
      z.object({
        sessionId: z.string().min(1),
        planFilePath: z.string().min(1).optional(),
        planNo: z.number().int().min(1).optional(),
      }),
    )
    .query(async (): Promise<{
      content: string
      actionName: string
      explanation?: string
      steps: string[]
      filePath: string
      meta: Record<string, unknown>
    } | null> => {
      throw new Error('Not implemented in base router')
    }),
})

export type ChatRouter = typeof chatRouter
