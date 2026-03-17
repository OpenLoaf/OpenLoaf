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
import { UI_MESSAGE_STREAM_HEADERS } from 'ai'
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

/** 将 JSON 转为 SSE chunk。 */
function toSseChunk(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`
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
  app.get('/ai/chat/async/stream', async (c) => {
    const sessionId = c.req.query('sessionId')
    if (!sessionId) {
      return c.json({ error: 'sessionId is required' }, 400)
    }

    const offset = Number(c.req.query('offset') || '0')
    const session = streamSessionManager.get(sessionId)
    if (!session) {
      return c.json({ status: 'not_found' }, 404)
    }

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()

        // 使用原子性 subscribeFromOffset：先订阅再重放，保证无遗漏
        const unsubscribe = streamSessionManager.subscribeFromOffset(sessionId, offset, (event) => {
          try {
            if (event.type === 'chunk') {
              controller.enqueue(encoder.encode(toSseChunk(event.chunk)))
            } else {
              // complete / error / aborted → 关闭 SSE
              controller.close()
            }
          } catch {
            // controller 可能已关闭
            unsubscribe()
          }
        })

        // 客户端断连时仅清理 listener（流继续）
        c.req.raw.signal.addEventListener('abort', () => {
          unsubscribe()
          // 注意：不触发 StreamSession 的 abort
        })
      },
    })

    return new Response(stream, { headers: UI_MESSAGE_STREAM_HEADERS })
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
      chunkCount: session.chunks.length,
      assistantMessageId: session.assistantMessageId,
    })
  })
}

/** Parse request payload for async endpoint. */
function parseAsyncRequest(body: unknown): { request?: AiExecuteRequest; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'Invalid request body' }
  const raw = body as Record<string, unknown>

  const sessionId = toText(raw.sessionId)
  if (!sessionId) return { error: 'sessionId is required' }

  if (!Array.isArray(raw.messages)) return { error: 'messages is required' }

  // 透传所有字段（与 /ai/chat 相同的 payload 格式）
  return {
    request: {
      sessionId,
      messages: raw.messages as AiExecuteRequest['messages'],
      id: toText(raw.id) || undefined,
      messageId: toText(raw.messageId) || undefined,
      clientId: toText(raw.clientId) || undefined,
      timezone: toText(raw.timezone) || undefined,
      tabId: toText(raw.tabId) || undefined,
      trigger: toText(raw.trigger) || undefined,
      retry: typeof raw.retry === 'boolean' ? raw.retry : undefined,
      projectId: toText(raw.projectId) || undefined,
      boardId: toText(raw.boardId) || undefined,
      intent: raw.intent === 'chat' ? 'chat' : undefined,
      responseMode: 'stream',
      toolApprovalPayloads: raw.toolApprovalPayloads as any,
      chatModelId: toText(raw.chatModelId) || undefined,
      chatModelSource: raw.chatModelSource === 'local' || raw.chatModelSource === 'cloud'
        ? raw.chatModelSource
        : undefined,
      clientPlatform: raw.clientPlatform === 'desktop' || raw.clientPlatform === 'web'
        ? raw.clientPlatform
        : undefined,
      params: raw.params && typeof raw.params === 'object' && !Array.isArray(raw.params)
        ? raw.params as Record<string, unknown>
        : undefined,
    },
  }
}
