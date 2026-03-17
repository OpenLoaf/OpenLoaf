/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import type { Context, Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { streamSSE } from 'hono/streaming'
import type { AiExecuteRequest } from '@/ai/services/chat/types'
import { streamSessionManager } from '@/ai/services/chat/streamSessionManager'
import { startChatStreamAsync } from '@/ai/services/chat/async/chatStreamAsyncService'
import { bootstrapAi } from '@/ai/bootstrap'
import { logger } from '@/common/logger'
import { toText } from '@/routers/route-utils'

const { aiExecuteController: controller } = bootstrapAi()

/** Extract bearer token from request headers. */
function resolveBearerToken(c: Context): string | null {
  const authHeader = c.req.header('authorization') ?? c.req.header('Authorization')
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

/** Register async AI chat routes. */
export function registerAiChatAsyncRoutes(app: Hono) {
  // 发起异步对话（同步返回，LLM 流在后台启动）
  app.post('/ai/chat/async', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const parsed = parseAsyncRequest(body)
    if (!parsed.request) {
      return c.json({ error: parsed.error ?? 'Invalid request' }, 400)
    }

    const cookies = getCookie(c) || {}
    const saasAccessToken = resolveBearerToken(c)

    try {
      const result = await startChatStreamAsync({
        request: parsed.request,
        cookies,
        saasAccessToken: saasAccessToken ?? undefined,
        executeFn: (input) => controller.execute(input),
      })

      return c.json({
        sessionId: result.sessionId,
        assistantMessageId: result.assistantMessageId,
      })
    } catch (err) {
      logger.error({ err }, '[chatAsync] start failed')
      return c.json({ error: 'Failed to start async stream' }, 500)
    }
  })

  // SSE 流式消费（可重连）
  // 使用 Hono streamSSE 确保 Node.js adapter 不会设置 content-length: 0
  app.get('/ai/chat/async/stream', async (c) => {
    const sessionId = c.req.query('sessionId')
    if (!sessionId) {
      return c.json({ error: 'sessionId is required' }, 400)
    }

    const session = streamSessionManager.get(sessionId)
    if (!session) {
      return c.json({ status: 'not_found' }, 404)
    }

    // 已完成的 session 不再推流，前端应从 JSONL 加载历史
    if (session.status !== 'streaming') {
      return c.json({ status: session.status }, 200)
    }

    return streamSSE(c, async (stream) => {
      await new Promise<void>((resolve) => {
        const unsubscribe = streamSessionManager.subscribe(sessionId, (event) => {
          try {
            if (event.type === 'chunk') {
              void stream.writeSSE({ data: JSON.stringify(event.chunk) })
            } else {
              // complete / error / aborted → 关闭 SSE
              unsubscribe()
              resolve()
            }
          } catch {
            // stream 可能已关闭
            unsubscribe()
            resolve()
          }
        })

        // 客户端断连时仅清理 listener（流继续）
        stream.onAbort(() => {
          unsubscribe()
          resolve()
          // 注意：不触发 StreamSession 的 abort
        })
      })
    })
  })

  // 主动中止
  app.post('/ai/chat/async/abort', async (c) => {
    let body: Record<string, unknown>
    try {
      body = (await c.req.json()) as Record<string, unknown>
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const sessionId = toText(body.sessionId)
    if (!sessionId) {
      return c.json({ error: 'sessionId is required' }, 400)
    }

    streamSessionManager.abort(sessionId)
    return c.json({ ok: true })
  })

  // 状态查询
  app.get('/ai/chat/async/status', async (c) => {
    const sessionId = c.req.query('sessionId')
    if (!sessionId) {
      return c.json({ error: 'sessionId is required' }, 400)
    }

    const session = streamSessionManager.get(sessionId)
    if (!session) {
      return c.json({ status: 'not_found' }, 404)
    }

    return c.json({
      status: session.status,
      assistantMessageId: session.assistantMessageId,
    })
  })
}

/** Parse request payload for async endpoint. Mirrors parseAiExecuteRequest in aiExecuteRoutes. */
function parseAsyncRequest(body: unknown): { request?: AiExecuteRequest; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid request body' }
  const raw = body as Record<string, unknown>

  const sessionId = toText(raw.sessionId)
  if (!sessionId) return { error: 'sessionId is required' }

  if (!Array.isArray(raw.messages)) return { error: 'messages is required' }

  const chatModelSource = raw.chatModelSource === 'local' || raw.chatModelSource === 'cloud'
    ? raw.chatModelSource
    : undefined

  return {
    request: {
      sessionId,
      messages: raw.messages as AiExecuteRequest['messages'],
      id: toText(raw.id) || undefined,
      messageId: toText(raw.messageId) || undefined,
      clientId: toText(raw.clientId) || undefined,
      timezone: resolveTimezone(raw.timezone),
      tabId: toText(raw.tabId) || undefined,
      trigger: toText(raw.trigger) || undefined,
      retry: typeof raw.retry === 'boolean' ? raw.retry : undefined,
      projectId: toText(raw.projectId) || undefined,
      boardId: toText(raw.boardId) || undefined,
      imageSaveDir: toText(raw.imageSaveDir) || undefined,
      intent: raw.intent === 'chat' ? 'chat' : 'chat',
      responseMode: 'stream',
      toolApprovalPayloads: normalizeToolApprovalPayloads(raw.toolApprovalPayloads),
      chatModelId: toText(raw.chatModelId) || undefined,
      chatModelSource,
      clientPlatform: raw.clientPlatform === 'desktop' || raw.clientPlatform === 'web' || raw.clientPlatform === 'cli'
        ? raw.clientPlatform as 'desktop' | 'web' | 'cli'
        : undefined,
      params: raw.params && typeof raw.params === 'object' && !Array.isArray(raw.params)
        ? raw.params as Record<string, unknown>
        : undefined,
      messageIdChain: normalizeMessageIdChain(raw.messageIdChain),
    },
  }
}

/** Resolve timezone from request payload or server default. */
function resolveTimezone(value: unknown): string {
  const trimmed = toText(value)
  if (trimmed) return trimmed
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone
  return resolved || process.env.TZ || 'UTC'
}

/** Normalize tool approval payloads input. */
function normalizeToolApprovalPayloads(
  value: unknown,
): Record<string, Record<string, unknown>> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return undefined
  const normalized: Record<string, Record<string, unknown>> = {}
  for (const [toolCallId, payload] of entries) {
    if (toolCallId === '__proto__' || toolCallId === 'prototype' || toolCallId === 'constructor') continue
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) continue
    const payloadEntries = Object.entries(payload as Record<string, unknown>)
    if (payloadEntries.length === 0) {
      normalized[toolCallId] = {}
      continue
    }
    const normalizedPayload: Record<string, unknown> = {}
    for (const [key, val] of payloadEntries) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue
      normalizedPayload[key] = val
    }
    normalized[toolCallId] = normalizedPayload
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined
}

/** Normalize messageIdChain (board chat). */
function normalizeMessageIdChain(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const ids = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
  return ids.length > 0 ? ids : undefined
}
