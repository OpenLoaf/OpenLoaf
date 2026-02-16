import type { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { streamText } from 'ai'
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

/** Register /api/ai/copilot route for Plate.js inline completion. */
export function registerAiCopilotRoutes(app: Hono) {
  app.post('/api/ai/copilot', async (c) => {
    let body: Record<string, unknown>
    try {
      body = (await c.req.json()) as Record<string, unknown>
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt : ''
    const system = typeof body.system === 'string' ? body.system : undefined
    if (!prompt) {
      return c.json({ error: 'prompt is required' }, 400)
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
      logger.error({ err }, '[ai-copilot] resolveChatModel failed')
      return c.json({ error: 'Failed to resolve model' }, 500)
    }

    // 逻辑：Copilot 补全使用较小的 maxTokens 限制。
    const result = streamText({
      model: resolved.model as any,
      prompt,
      system,
      maxOutputTokens: 100,
      abortSignal: c.req.raw.signal,
    })

    // 逻辑：Copilot 期望纯文本流格式。
    return result.toTextStreamResponse()
  })
}
