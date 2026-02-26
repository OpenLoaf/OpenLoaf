/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport {
  BaseChatRouter,
  chatSchemas,
  t,
  shieldedProcedure,
  appRouterDefine,
  type ChatMessageKind,
  type ChatUIMessage,
} from '@openloaf/api'
import { z } from 'zod'
import { generateText } from 'ai'
import { xai } from '@ai-sdk/xai'
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
  registerAgentDir,
  readSessionJson,
} from '@/ai/services/chat/repositories/chatFileStore'
import { promises as fsPromises } from 'node:fs'
import nodePath from 'node:path'

const TITLE_MAX_CHARS = 16
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

function createTitleAgent() {
  return {
    name: 'session-title-agent',
    model: xai('grok-4-1-fast-reasoning'),
    system: `
你是一个"对话标题生成器"。
- 只输出一个标题，不要解释。
- 标题不超过 ${TITLE_MAX_CHARS} 个字符。
- 不要输出引号、编号、Markdown。
`,
  } as const
}

async function generateTitleFromHistory(historyText: string): Promise<string> {
  const agent = createTitleAgent()
  const res = await generateText({
    model: agent.model,
    system: agent.system,
    prompt: `请根据下面的对话内容生成一个简短标题：\n\n${historyText}`,
  })
  return normalizeTitle(res.text)
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
    reasoningTokens: toNumber(usage.reasoningTokens ?? usage.reasoning_tokens),
    cachedInputTokens: toNumber(usage.cachedInputTokens ?? usage.cached_input_tokens),
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

export class ChatRouterImpl extends BaseChatRouter {
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
        const sessions = await ctx.prisma.chatSession.deleteMany({})
        await deleteAllChatFiles()
        return { deletedSessions: sessions.count }
      }),

      // deleteMessageSubtree — 从 JSONL 删除
      deleteMessageSubtree: shieldedProcedure
        .input(z.object({
          sessionId: z.string().min(1),
          messageId: z.string().min(1),
        }))
        .mutation(async ({ input }) => {
          return deleteSubtreeFromFile(input)
        }),

      // updateMessageParts — 追加到 JSONL
      updateMessageParts: shieldedProcedure
        .input(z.object({
          sessionId: z.string().min(1),
          messageId: z.string().min(1),
          parts: z.any(),
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
          metadata: z.any(),
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

      getSessionPreface: shieldedProcedure
        .input(chatSchemas.getSessionPreface.input)
        .output(chatSchemas.getSessionPreface.output)
        .query(async ({ ctx, input }) => {
          const session = await ctx.prisma.chatSession.findUnique({
            where: { id: input.sessionId },
            select: { id: true, deletedAt: true },
          })
          if (!session || session.deletedAt) throw new Error('session not found')

          const content = await resolveSessionPrefaceText(ctx.prisma, input.sessionId)
          let jsonlPath: string | undefined
          let systemJsonRaw: string | undefined
          try {
            jsonlPath = await resolveMessagesJsonlPath(input.sessionId)
            // 逻辑：读取 system.json 原始内容，直接作为字符串返回给前端解析。
            const systemJsonPath = nodePath.join(nodePath.dirname(jsonlPath), 'system.json')
            systemJsonRaw = await fsPromises.readFile(systemJsonPath, 'utf-8')
          } catch {
            // 非关键操作
          }
          return { content, jsonlPath, systemJsonRaw }
        }),

      autoTitle: shieldedProcedure
        .input(chatSchemas.autoTitle.input)
        .output(chatSchemas.autoTitle.output)
        .mutation(async ({ ctx, input }) => {
          const session = await ctx.prisma.chatSession.findUnique({
            where: { id: input.sessionId },
            select: { id: true, title: true, isUserRename: true, deletedAt: true },
          })
          if (!session || session.deletedAt) throw new Error('session not found')

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
    })
  }
}

export const chatRouterImplementation = ChatRouterImpl.createRouter()
