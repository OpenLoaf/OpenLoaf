/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { Hono } from 'hono'
import { streamText } from 'ai'
import type { ChatModelSource } from '@openloaf/api/common'
import { resolveChatModel } from '@/ai/models/resolveChatModel'
import { logger } from '@/common/logger'

/** Extract bearer token from request headers. */
function resolveBearerToken(c: any): string | null {
  const authHeader =
    c.req.header('authorization') ?? c.req.header('Authorization')
  if (!authHeader) return null
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || null
}

/** Register /api/ai/command route for Plate.js AI chat menu. */
export function registerAiCommandRoutes(app: Hono) {
  app.post('/ai/command', async (c) => {
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

    const ctx = body.ctx as
      | { children?: unknown; selection?: unknown; toolName?: string }
      | undefined
    const chatModelId =
      typeof body.chatModelId === 'string' ? body.chatModelId : undefined
    const chatModelSource = (
      typeof body.chatModelSource === 'string'
        ? body.chatModelSource
        : undefined
    ) as ChatModelSource | undefined
    const saasAccessToken = resolveBearerToken(c)

    let resolved
    try {
      resolved = await resolveChatModel({
        chatModelId,
        chatModelSource,
        saasAccessToken,
      })
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to resolve model'
      logger.error({ err }, '[ai-command] resolveChatModel failed')
      return c.json({ error: msg }, 500)
    }

    // 逻辑：根据 toolName 设置系统提示，让模型行为匹配操作类型。
    const toolName = ctx?.toolName
    let system: string | undefined
    if (toolName === 'edit') {
      system =
        "You are an advanced text editor. Rewrite the user's text as requested. Output only the rewritten text, no explanations."
    } else if (toolName === 'generate') {
      system =
        "You are an AI writing assistant. Generate content based on the user's request."
    } else if (toolName === 'comment') {
      system =
        'You are a writing reviewer. Provide constructive feedback on the given text.'
    }

    // 逻辑：使用 AI SDK streamText 直接流式生成。
    const result = streamText({
      model: resolved.model as any,
      messages: messages as any,
      system,
      abortSignal: c.req.raw.signal,
    })

    // 逻辑：返回标准 UI Message Stream 格式，Plate.js useChat 直接消费。
    return result.toUIMessageStreamResponse()
  })
}
