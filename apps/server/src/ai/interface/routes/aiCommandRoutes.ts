import type { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import {
  createUIMessageStream,
  JsonToSseTransformStream,
  UI_MESSAGE_STREAM_HEADERS,
  streamText,
} from 'ai'
import type { ChatModelSource } from '@tenas-ai/api/common'
import { resolveChatModel } from '@/ai/models/resolveChatModel'
import { logger } from '@/common/logger'

/** Extract bearer token from request headers. */
function resolveBearerToken(c: any): string | null {
  const authHeader = c.req.header('authorization') ?? c.req.header('Authorization')
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

/** Register /api/ai/command route for Plate.js AI chat menu. */
export function registerAiCommandRoutes(app: Hono) {
  app.post('/api/ai/command', async (c) => {
    let body: Record<string, unknown>
    try {
      body = (await c.req.json()) as Record<string, unknown>
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const messages = Array.isArray(body.messages) ? body.messages : []
    if (messages.length === 0) {
      return c.json({ error: 'messages is required' }, 400)
    }

    const chatModelId = typeof body.chatModelId === 'string' ? body.chatModelId : undefined
    const chatModelSource = (typeof body.chatModelSource === 'string' ? body.chatModelSource : undefined) as ChatModelSource | undefined
    const saasAccessToken = resolveBearerToken(c)

    let resolved
    try {
      resolved = await resolveChatModel({
        chatModelId,
        chatModelSource,
        saasAccessToken,
      })
    } catch (err) {
      logger.error({ err }, '[ai-command] resolveChatModel failed')
      return c.json({ error: 'Failed to resolve model' }, 500)
    }

    // 逻辑：使用 AI SDK streamText 直接流式生成，不走完整 Agent 流程。
    const result = streamText({
      model: resolved.model as any,
      messages: messages as any,
      abortSignal: c.req.raw.signal,
    })

    // 逻辑：返回 Vercel AI SDK 标准 SSE 流格式。
    const uiStream = createUIMessageStream({
      execute: async ({ writer }) => {
        const msgId = crypto.randomUUID()
        const reader = result.textStream.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            writer.write({ type: 'text-delta', id: msgId, delta: value })
          }
        } finally {
          reader.releaseLock()
        }
      },
    })

    const sseStream = uiStream.pipeThrough(new JsonToSseTransformStream())
    return new Response(sseStream as any, {
      headers: UI_MESSAGE_STREAM_HEADERS,
    })
  })
}
