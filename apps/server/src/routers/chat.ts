/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import {
  BaseChatRouter,
  chatSchemas,
  t,
  shieldedProcedure,
  appRouterDefine,
  type ChatMessageKind,
  type ChatUIMessage,
  type SessionUpdateEvent,
} from '@openloaf/api'
import { z } from 'zod'
import { scheduleEventBus } from '@/services/scheduleEventBus'
import { replaceFileTokensWithNames } from '@/common/chatTitle'
import {
  getChatViewFromFile,
  loadMessageTree,
  resolveChainFromLeaf,
  resolveRightmostLeaf,
  writeSessionJson,
  deleteMessageSubtree as deleteSubtreeFromFile,
  updateMessageParts as updatePartsInFile,
  updateMessageMetadata as updateMetadataInFile,
  getMessageById,
  deleteAllChatFiles,
  resolveMessagesJsonlPath,
  readJsonlRaw,
  registerAgentDir,
  readSessionJson,
  readSessionJsonAutoTest,
} from '@/ai/services/chat/repositories/chatFileStore'
import { readSessionAutoTestSummary } from '@openloaf/api/services/sessionAutoTestService'
import { resolveSessionDir } from '@/ai/services/chat/repositories/chatSessionPathResolver'
import { copySessionToBoard } from '@/ai/services/chat/copySessionToBoard'
import { readAutoTestEvaluation } from '@/ai/services/chat/autoTestEvaluation'
import { promises as fsPromises } from 'node:fs'
import nodePath from 'node:path'
import { getErrorMessage } from '@/shared/errorMessages'

const TITLE_MAX_CHARS = 30
const TITLE_CONTEXT_TAKE = 24

function isRenderableRow(row: {
  role: string
  parts: unknown
  messageKind?: ChatMessageKind | null
}): boolean {
  const kind = row.messageKind ?? 'normal'
  if (kind === 'compact_prompt') return false
  if (kind === 'compact_summary') return true
  if (row.role === 'subagent') return false
  if (row.role === 'user') return true
  const parts = row.parts
  return Array.isArray(parts) && parts.length > 0
}

function extractTextFromParts(parts: unknown): string {
  const arr = Array.isArray(parts) ? (parts as any[]) : []
  const chunks: string[] = []
  for (const part of arr) {
    if (!part || typeof part !== 'object') continue
    if (typeof (part as any).text === 'string') {
      const text = String((part as any).text)
      chunks.push(replaceFileTokensWithNames(text))
    }
  }
  return chunks.join('\n').trim()
}

function normalizeTitle(raw: string): string {
  let title = (raw ?? '').trim()
  title = title.replace(/^["'""''《》]+/, '').replace(/["'""''《》]+$/, '')
  title = title.split('\n')[0]?.trim() ?? ''
  if (title.length > TITLE_MAX_CHARS) title = title.slice(0, TITLE_MAX_CHARS)
  return title.trim()
}

/** Resolve session preface text from stored message parts. */
async function resolveSessionPrefaceText(
  prisma: any,
  sessionId: string,
): Promise<string> {
  const row = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { sessionPreface: true },
  })
  return typeof row?.sessionPreface === 'string' ? row.sessionPreface : ''
}

/** 清理 parts 中未决的 approval-requested 状态，避免前端显示"等待审批"。 */
function sanitizeApprovalParts(parts: unknown[]): unknown[] {
  return parts.map((part: any) => {
    if (!part || typeof part !== 'object') return part
    const approval = part.approval
    if (!approval || typeof approval !== 'object') return part
    if (approval.approved === true || approval.approved === false) return part
    // 未决审批 → 标记为已取消
    return {
      ...part,
      state: 'output-denied',
      approval: { ...approval, approved: false },
      output: part.output ?? '[Cancelled: agent completed before approval]',
    }
  })
}

function buildTitlePrompt(chainRows: Array<{ role: string; parts: unknown }>): string {
  const lines: string[] = []
  for (const row of chainRows) {
    const text = extractTextFromParts(row.parts)
    if (!text) continue
    if (row.role === 'user') lines.push(`User: ${text}`)
    else if (row.role === 'assistant') lines.push(`Assistant: ${text}`)
    else lines.push(`System: ${text}`)
  }
  return lines.join('\n').trim()
}

async function generateTitleFromHistory(historyText: string): Promise<string> {
  const { auxiliaryInfer } = await import('@/ai/services/auxiliaryInferenceService')
  const { CAPABILITY_SCHEMAS } = await import('@/ai/services/auxiliaryCapabilities')
  const result = await auxiliaryInfer({
    capabilityKey: 'chat.title',
    context: historyText,
    schema: CAPABILITY_SCHEMAS['chat.title'],
    fallback: { title: '' },
    noCache: true,
  })
  return normalizeTitle(result.title)
}

type UsageTotals = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  reasoningTokens: number
  cachedInputTokens: number
}

const ZERO_USAGE: UsageTotals = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  reasoningTokens: 0,
  cachedInputTokens: 0,
}

function extractUsageTotals(metadata: unknown): UsageTotals {
  const meta = metadata as any
  const usage = meta?.totalUsage ?? meta?.usage ?? meta?.tokenUsage ?? null
  if (!usage || typeof usage !== 'object') return ZERO_USAGE

  const toNumber = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value)
      ? value
      : typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
        ? Number(value)
        : 0

  return {
    inputTokens: toNumber(usage.inputTokens ?? usage.promptTokens ?? usage.input_tokens),
    outputTokens: toNumber(usage.outputTokens ?? usage.completionTokens ?? usage.output_tokens),
    totalTokens: toNumber(usage.totalTokens ?? usage.total_tokens),
    reasoningTokens: toNumber(
      usage.outputTokenDetails?.reasoningTokens
      ?? usage.reasoningTokens ?? usage.reasoning_tokens,
    ),
    cachedInputTokens: toNumber(
      usage.inputTokenDetails?.cacheReadTokens
      ?? usage.cachedInputTokens ?? usage.cached_input_tokens,
    ),
  }
}

function sumUsageTotals(list: UsageTotals[]): UsageTotals {
  const total = { ...ZERO_USAGE }
  for (const item of list) {
    total.inputTokens += item.inputTokens
    total.outputTokens += item.outputTokens
    total.totalTokens += item.totalTokens
    total.reasoningTokens += item.reasoningTokens
    total.cachedInputTokens += item.cachedInputTokens
  }
  return total
}

class ChatRouterImpl extends BaseChatRouter {
  public static createRouter() {
    return t.router({
      ...appRouterDefine.chat._def.procedures,

      // getChatView — 从文件读取
      getChatView: shieldedProcedure
        .input(z.object({
          sessionId: z.string().min(1),
          anchor: z.object({
            messageId: z.string().min(1),
            strategy: z.enum(['self', 'latestLeafInSubtree']).optional(),
          }).optional(),
          window: z.object({
            limit: z.number().min(1).max(200).optional(),
            cursor: z.object({
              beforeMessageId: z.string().min(1),
            }).optional(),
          }).optional(),
          include: z.object({
            messages: z.boolean().optional(),
            siblingNav: z.boolean().optional(),
          }).optional(),
          includeToolOutput: z.boolean().optional(),
        }))
        .query(async ({ input }) => {
          return getChatViewFromFile(input)
        }),

      // getSubAgentHistory — 从 agents/<agentId>/ 子目录读取
      getSubAgentHistory: shieldedProcedure
        .input(z.object({
          sessionId: z.string().min(1),
          toolCallId: z.string().min(1),
        }))
        .query(async ({ input }) => {
          const agentId = input.toolCallId

          await registerAgentDir(input.sessionId, agentId)
          const tree = await loadMessageTree(agentId)

          if (tree.byId.size === 0) {
            return { message: null, messages: [], agentMeta: null }
          }

          const agentSession = await readSessionJson(agentId)
          const sorted = Array.from(tree.byId.values()).sort((a, b) => {
            const ta = new Date(a.createdAt).getTime()
            const tb = new Date(b.createdAt).getTime()
            return ta - tb || a.id.localeCompare(b.id)
          })
          // 过滤空消息，清理未决审批状态
          const validMessages = sorted.filter((msg) => {
            if (msg.role !== 'user' && (!Array.isArray(msg.parts) || msg.parts.length === 0)) return false
            return true
          })
          const messages = validMessages.map((msg) => ({
            id: msg.id,
            role: msg.role,
            parentMessageId: msg.parentMessageId,
            parts: sanitizeApprovalParts(Array.isArray(msg.parts) ? msg.parts : []),
            metadata: msg.metadata ?? undefined,
          }))
          return {
            message: messages.length ? {
              id: `subagent:${agentId}`,
              role: 'subagent' as const,
              parentMessageId: null,
              parts: messages.flatMap((m) => m.parts),
              metadata: {
                toolCallId: agentId,
                name: agentSession?.title,
                task: (agentSession as any)?.task,
              },
            } : null,
            messages,
            agentMeta: agentSession ? {
              name: agentSession.title,
              task: (agentSession as any)?.task,
              agentType: (agentSession as any)?.agentType,
            } : null,
          }
        }),

      // getChatStats — 从 JSONL 统计
      getChatStats: shieldedProcedure.query(async ({ ctx }) => {
        const sessionCount = await ctx.prisma.chatSession.count({ where: { deletedAt: null } })

        // 从所有会话的 JSONL 中统计 token 使用量
        const sessions = await ctx.prisma.chatSession.findMany({
          where: { deletedAt: null },
          select: { id: true },
        })

        const usageList: UsageTotals[] = []
        for (const session of sessions) {
          try {
            const tree = await loadMessageTree(session.id)
            for (const msg of tree.byId.values()) {
              if (msg.role === 'assistant') {
                usageList.push(extractUsageTotals(msg.metadata))
              }
            }
          } catch {
            // 跳过无法读取的会话
          }
        }

        return { sessionCount, usageTotals: sumUsageTotals(usageList) }
      }),

      // clearAllChat — 同时清理文件
      clearAllChat: shieldedProcedure.mutation(async ({ ctx }) => {
        // 先删文件（deleteAllChatFiles 内部依赖 DB 查询 session 列表来定位目录）
        await deleteAllChatFiles()
        const sessions = await ctx.prisma.chatSession.deleteMany({})
        return { deletedSessions: sessions.count }
      }),

      // deleteMessageSubtree — 从 JSONL 删除
      deleteMessageSubtree: shieldedProcedure
        .input(z.object({
          sessionId: z.string().min(1),
          messageId: z.string().min(1),
        }))
        .mutation(async ({ input }) => {
          const result = await deleteSubtreeFromFile(input)
          const snapshot = await getChatViewFromFile({
            sessionId: input.sessionId,
            window: { limit: 50 },
            includeToolOutput: false,
            ...(result.parentMessageId
              ? { anchor: { messageId: String(result.parentMessageId) } }
              : {}),
          })
          return {
            ...result,
            snapshot,
          }
        }),

      // updateMessageParts — 追加到 JSONL
      updateMessageParts: shieldedProcedure
        .input(z.object({
          sessionId: z.string().min(1),
          messageId: z.string().min(1),
          parts: z.array(z.unknown()),
        }))
        .mutation(async ({ input }) => {
          const parts = Array.isArray(input.parts) ? input.parts : []
          return updatePartsInFile({
            sessionId: input.sessionId,
            messageId: input.messageId,
            parts,
          })
        }),

      // updateMessageMetadata — 合并 metadata 到 JSONL
      updateMessageMetadata: shieldedProcedure
        .input(z.object({
          sessionId: z.string().min(1),
          messageId: z.string().min(1),
          metadata: z.record(z.string(), z.unknown()),
        }))
        .mutation(async ({ input }) => {
          const metadata = (input.metadata && typeof input.metadata === 'object')
            ? input.metadata as Record<string, unknown>
            : {}
          const merged = await updateMetadataInFile({
            sessionId: input.sessionId,
            messageId: input.messageId,
            metadata,
          })
          return { metadata: merged }
        }),

      // getMessageParts — 获取单条消息
      getMessageParts: shieldedProcedure
        .input(z.object({
          sessionId: z.string().min(1),
          messageId: z.string().min(1),
        }))
        .query(async ({ input }) => {
          const msg = await getMessageById(input)
          if (!msg) return null
          return {
            id: msg.id,
            parts: Array.isArray(msg.parts) ? msg.parts : [],
            metadata: msg.metadata ?? null,
          }
        }),

      copySessionToBoard: shieldedProcedure
        .input(z.object({
          sourceSessionId: z.string().min(1),
          targetBoardId: z.string().min(1).optional(),
        }))
        .mutation(async ({ ctx, input }) => {
          return copySessionToBoard({
            sourceSessionId: input.sourceSessionId,
            targetBoardId: input.targetBoardId,
            prisma: ctx.prisma as any,
          })
        }),

      getSessionPreface: shieldedProcedure
        .input(chatSchemas.getSessionPreface.input)
        .output(chatSchemas.getSessionPreface.output)
        .query(async ({ ctx, input }) => {
          if (input.isAgentSession && input.parentSessionId) {
            await registerAgentDir(input.parentSessionId, input.sessionId)
          } else {
            const session = await ctx.prisma.chatSession.findUnique({
              where: { id: input.sessionId },
              select: { id: true, deletedAt: true },
            })
            if (!session || session.deletedAt) throw new Error(getErrorMessage('CHAT_SESSION_NOT_FOUND', ctx.lang))
          }

          let content = ''
          if (!input.isAgentSession) {
            content = await resolveSessionPrefaceText(ctx.prisma, input.sessionId)
          }
          let jsonlPath: string | undefined
          let promptContent: string | undefined
          try {
            jsonlPath = await resolveMessagesJsonlPath(input.sessionId)
            const sessionDir = nodePath.dirname(jsonlPath)
            // 优先读 PROMPT.md，回退读 system.json（兼容旧会话）
            try {
              promptContent = await fsPromises.readFile(nodePath.join(sessionDir, 'PROMPT.md'), 'utf-8')
            } catch {
              try {
                const raw = await fsPromises.readFile(nodePath.join(sessionDir, 'system.json'), 'utf-8')
                const parsed = JSON.parse(raw)
                if (typeof parsed.instructions === 'string') promptContent = parsed.instructions
              } catch { /* ignore */ }
            }
            // 子 agent 从文件读取 PREFACE.md
            if (input.isAgentSession && !content) {
              try {
                content = await fsPromises.readFile(nodePath.join(sessionDir, 'PREFACE.md'), 'utf-8')
              } catch { /* ignore */ }
            }
          } catch {
            // 非关键操作
          }
          return { content, jsonlPath, promptContent }
        }),

      getSessionMessages: shieldedProcedure
        .input(chatSchemas.getSessionMessages.input)
        .output(chatSchemas.getSessionMessages.output)
        .query(async ({ ctx, input }) => {
          if (input.isAgentSession && input.parentSessionId) {
            await registerAgentDir(input.parentSessionId, input.sessionId)
          } else {
            const session = await ctx.prisma.chatSession.findUnique({
              where: { id: input.sessionId },
              select: { id: true, deletedAt: true },
            })
            if (!session || session.deletedAt) throw new Error(getErrorMessage('CHAT_SESSION_NOT_FOUND', ctx.lang))
          }

          const messages = await readJsonlRaw(input.sessionId)
          return { messages }
        }),

      getMessageDebugSteps: shieldedProcedure
        .input(chatSchemas.getMessageDebugSteps.input)
        .output(chatSchemas.getMessageDebugSteps.output)
        .query(async ({ ctx, input }) => {
          if (input.isAgentSession && input.parentSessionId) {
            await registerAgentDir(input.parentSessionId, input.sessionId)
          } else {
            const session = await ctx.prisma.chatSession.findUnique({
              where: { id: input.sessionId },
              select: { id: true, deletedAt: true },
            })
            if (!session || session.deletedAt) throw new Error(getErrorMessage('CHAT_SESSION_NOT_FOUND', ctx.lang))
          }

          const jsonlPath = await resolveMessagesJsonlPath(input.sessionId)
          const sessionDir = nodePath.dirname(jsonlPath)
          const debugDir = nodePath.join(sessionDir, 'debug')

          type DebugStepRow = { stepNumber: number; attemptTag: string; request: unknown; response: unknown }
          const emptyResult = { steps: [] as DebugStepRow[] }

          // Find ALL subdirectories matching *_<messageId>, sorted by timestamp
          let entries: string[] = []
          try {
            entries = await fsPromises.readdir(debugDir)
          } catch {
            return emptyResult
          }
          const matchDirs = entries
            .filter((e) => e.endsWith(`_${input.messageId}`))
            .sort() // timestamp prefix ensures chronological order

          if (matchDirs.length === 0) return emptyResult

          // Merge steps from all attempt directories with continuous numbering
          const allSteps: { stepNumber: number; attemptTag: string; request: unknown; response: unknown }[] = []
          let globalStep = 0

          for (const dir of matchDirs) {
            const underscoreIdx = dir.indexOf('_')
            const attemptTag = underscoreIdx > 0 ? dir.slice(0, underscoreIdx) : dir
            const stepDir = nodePath.join(debugDir, dir)
            const files = await fsPromises.readdir(stepDir)

            const stepNumbers = new Set<number>()
            for (const f of files) {
              const m = f.match(/^step(\d+)_(request|response)\.json$/)
              if (m) stepNumbers.add(Number(m[1]))
            }

            const sorted = [...stepNumbers].sort((a, b) => a - b)
            for (const n of sorted) {
              let request: unknown = null
              let response: unknown = null
              try {
                request = JSON.parse(await fsPromises.readFile(nodePath.join(stepDir, `step${n}_request.json`), 'utf-8'))
              } catch {}
              try {
                response = JSON.parse(await fsPromises.readFile(nodePath.join(stepDir, `step${n}_response.json`), 'utf-8'))
              } catch {}
              allSteps.push({ stepNumber: globalStep++, attemptTag, request, response })
            }
          }

          return { steps: allSteps }
        }),

      listSubAgents: shieldedProcedure
        .input(chatSchemas.listSubAgents.input)
        .output(chatSchemas.listSubAgents.output)
        .query(async ({ input }) => {
          const sessionDir = await resolveSessionDir(input.sessionId)
          const agentsDir = nodePath.join(sessionDir, 'agents')
          let agentDirs: string[] = []
          try {
            agentDirs = (await fsPromises.readdir(agentsDir, { withFileTypes: true }))
              .filter((d) => d.isDirectory() && d.name.startsWith('agent_'))
              .map((d) => d.name)
              .sort()
          } catch {
            return { agents: [] }
          }

          const agents: Array<{
            agentId: string
            name?: string
            task?: string
            agentType?: string
            messageCount: number
            hasDebug: boolean
          }> = []

          for (const agentId of agentDirs) {
            const agentDir = nodePath.join(agentsDir, agentId)
            let name: string | undefined
            let task: string | undefined
            let agentType: string | undefined
            try {
              const raw = await fsPromises.readFile(nodePath.join(agentDir, 'session.json'), 'utf-8')
              const meta = JSON.parse(raw)
              name = meta.title
              task = meta.task
              agentType = meta.agentType
            } catch { /* no session.json */ }

            let messageCount = 0
            try {
              const content = await fsPromises.readFile(nodePath.join(agentDir, 'messages.jsonl'), 'utf-8')
              messageCount = content.split('\n').filter((l) => l.trim()).length
            } catch { /* no messages.jsonl */ }

            let hasDebug = false
            try {
              const stat = await fsPromises.stat(nodePath.join(agentDir, 'debug'))
              hasDebug = stat.isDirectory()
            } catch { /* no debug dir */ }

            agents.push({ agentId, name, task, agentType, messageCount, hasDebug })
          }

          return { agents }
        }),

      autoTitle: shieldedProcedure
        .input(chatSchemas.autoTitle.input)
        .output(chatSchemas.autoTitle.output)
        .mutation(async ({ ctx, input }) => {
          const session = await ctx.prisma.chatSession.findUnique({
            where: { id: input.sessionId },
            select: { id: true, title: true, isUserRename: true, deletedAt: true },
          })
          if (!session || session.deletedAt) throw new Error(getErrorMessage('CHAT_SESSION_NOT_FOUND', ctx.lang))

          if (session.isUserRename) return { ok: true, title: session.title }

          // 从 JSONL 加载最右链路用于取名
          const tree = await loadMessageTree(input.sessionId)
          const leafId = resolveRightmostLeaf(tree)
          if (!leafId) return { ok: true, title: session.title }

          const fullChain = resolveChainFromLeaf(tree, leafId)
          const recentChain = fullChain.length > TITLE_CONTEXT_TAKE
            ? fullChain.slice(-TITLE_CONTEXT_TAKE)
            : fullChain
          const renderableRows = recentChain.filter((row) => isRenderableRow(row as any))
          const historyText = buildTitlePrompt(renderableRows as any[])
          if (!historyText) return { ok: true, title: session.title }

          let title = ''
          try {
            title = await generateTitleFromHistory(historyText)
          } catch {
            return { ok: true, title: session.title }
          }

          if (!title) return { ok: true, title: session.title }

          await ctx.prisma.chatSession.update({
            where: { id: input.sessionId },
            data: { title, isUserRename: false },
          })
          try {
            await writeSessionJson(input.sessionId, { title, isUserRename: false })
          } catch {
            // 非关键操作
          }

          return { ok: true, title }
        }),

      // Chat session listing for sidebar overview
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
              id: { not: { startsWith: 'task-' } },
              ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
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

          // 自动化探针字段从各会话的 session.json + EVALUATION.json 派生（只读）。
          const autoTestSummaries = await Promise.all(
            sessions.map((row) =>
              readSessionAutoTestSummary(row.id, row.projectId ?? null),
            ),
          )
          return sessions.map((row, i) => ({
            ...row,
            autoTest: autoTestSummaries[i]?.autoTest ?? false,
            autoTestScore: autoTestSummaries[i]?.autoTestScore ?? null,
            autoTestVerdict: autoTestSummaries[i]?.autoTestVerdict ?? null,
          }))
        }),

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
          const { autoTest, probeMeta } = await readSessionJsonAutoTest(input.sessionId)
          return { ...session, autoTest, probeMeta }
        }),

      // 读取自动化探针（chat-probe 等）写入的 EVALUATION.json
      getAutoTestEvaluation: shieldedProcedure
        .input(z.object({ sessionId: z.string().min(1) }))
        .query(async ({ input }) => {
          return readAutoTestEvaluation(input.sessionId)
        }),

      deleteSession: shieldedProcedure
        .input(z.object({ sessionId: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
          await ctx.prisma.chatSession.update({
            where: { id: input.sessionId },
            data: { deletedAt: new Date() },
          })

          return { success: true }
        }),

      // onSessionUpdate — 后台 Agent 消息实时推送到前端
      onSessionUpdate: shieldedProcedure
        .input(z.object({ sessionId: z.string().min(1) }))
        .subscription(async function* ({ input }) {
          const queue: SessionUpdateEvent[] = []
          let resolve: (() => void) | null = null

          const cleanupReport = scheduleEventBus.onScheduleReport((event) => {
            if (event.sourceSessionId !== input.sessionId) return
            // schedule-report 作为独立通知事件推送，前端 NEVER 将其插入消息树。
            // 见 .plans/openloaf/docs/chat-ai/task-completion-flow.md
            queue.push({
              type: 'schedule-report',
              kind: 'notification',
              taskId: event.taskId,
              status: event.status,
              title: event.title,
              summary: event.summary,
              agentName: event.agentName,
            })
            resolve?.()
          })

          const cleanupStatus = scheduleEventBus.onStatusChange((event) => {
            if (event.sourceSessionId !== input.sessionId) return
            queue.push({
              type: 'ScheduledTaskStatus-change',
              taskId: event.taskId,
              status: event.status,
              previousStatus: event.previousStatus,
              title: event.title,
            })
            resolve?.()
          })

          const { backgroundProcessManager } = await import(
            '@/ai/services/background/BackgroundProcessManager'
          )
          const cleanupBgTask = backgroundProcessManager.onSessionUpdate(
            input.sessionId,
            (task) => {
              const summary = backgroundProcessManager.summarize(task)
              queue.push({ type: 'bg-task-update', task: summary })
              resolve?.()
            },
          )

          try {
            while (true) {
              if (queue.length === 0) {
                await new Promise<void>((r) => {
                  resolve = r
                })
              }
              while (queue.length > 0) {
                yield queue.shift()!
              }
            }
          } finally {
            cleanupReport()
            cleanupStatus()
            cleanupBgTask()
          }
        }),

      cancelBackgroundProcess: shieldedProcedure
        .input(z.object({ taskId: z.string().min(1), sessionId: z.string().min(1) }))
        .mutation(async ({ input }) => {
          const { backgroundProcessManager } = await import(
            '@/ai/services/background/BackgroundProcessManager'
          )
          const task = backgroundProcessManager.get(input.taskId)
          if (!task) return { ok: false, status: 'not-found' as const }
          if (task.sessionId !== input.sessionId) {
            return { ok: false, status: 'not-found' as const }
          }
          if (task.status !== 'running') {
            return { ok: true, status: 'already-done' as const }
          }
          await backgroundProcessManager.kill(input.taskId)
          return { ok: true, status: 'killed' as const }
        }),

      listBackgroundProcesses: shieldedProcedure
        .input(z.object({ sessionId: z.string().min(1) }))
        .query(async ({ input }) => {
          const { backgroundProcessManager } = await import(
            '@/ai/services/background/BackgroundProcessManager'
          )
          const tasks = backgroundProcessManager
            .listBySession(input.sessionId)
            .map((task) => backgroundProcessManager.summarize(task))
          return { tasks }
        }),

      listPlanFiles: shieldedProcedure
        .input(z.object({ sessionId: z.string().min(1) }))
        .query(async ({ input }) => {
          const { listPlanFiles } = await import('@/ai/services/chat/planFileService')
          const entries = await listPlanFiles(input.sessionId)
          return entries.map((e) => ({
            planNo: e.planNo,
            status: e.status,
            actionName: e.actionName,
            createdAt: e.createdAt,
            updatedAt: e.updatedAt,
            fileName: e.fileName,
            filePath: e.filePath,
          }))
        }),

      readPlanFile: shieldedProcedure
        .input(
          z.object({
            sessionId: z.string().min(1),
            // New API: resolve by AI-provided path (same as Write tool). Preferred for SubmitPlan.
            planFilePath: z.string().min(1).optional(),
            // Legacy API: lookup by planNo in sessionDir.
            planNo: z.number().int().min(1).optional(),
          }),
        )
        .query(async ({ input }) => {
          const {
            readPlanFile,
            readPlanFileFromAbsPath,
            resolvePlanFileAbsPath,
            derivePlanNoFromPath,
          } = await import('@/ai/services/chat/planFileService')
          if (input.planFilePath) {
            try {
              const absPath = await resolvePlanFileAbsPath(input.sessionId, input.planFilePath)
              const planNoHint = derivePlanNoFromPath(input.planFilePath)
              const data = await readPlanFileFromAbsPath(absPath, planNoHint)
              if (!data) return null
              return {
                content: data.content,
                actionName: data.actionName,
                explanation: data.explanation,
                steps: data.steps,
                filePath: data.filePath,
                meta: data.meta,
              }
            } catch {
              return null
            }
          }
          if (typeof input.planNo === 'number') {
            const data = await readPlanFile(input.sessionId, input.planNo)
            if (!data) return null
            return {
              content: data.content,
              actionName: data.actionName,
              explanation: data.explanation,
              steps: data.steps,
              filePath: data.filePath,
              meta: data.meta,
            }
          }
          return null
        }),

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
    })
  }
}

export const chatRouterImplementation = ChatRouterImpl.createRouter()
