/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/**
 * /debug/mcp-mock — test-only endpoint used by ai-browser-test to inject
 * fake MCP tools (e.g. Notion) into MCP_TOOL_REGISTRY. See mcpMockStore.ts
 * for rationale. Localhost only.
 */
import type { Hono } from 'hono'
import { z } from 'zod'
import {
  mcpMockEnabled,
  registerMockPreset,
  clearMockPreset,
  clearAllMockPresets,
  listAvailablePresets,
  type McpMockPreset,
} from '@/ai/services/mcpMockStore'
import { logger } from '@/common/logger'

const registerSchema = z.object({
  action: z.literal('register'),
  preset: z.string().min(1),
})
const clearSchema = z.object({
  action: z.literal('clear'),
  preset: z.string().min(1).optional(),
})
const bodySchema = z.union([registerSchema, clearSchema])

function isLocalhostRequest(c: any): boolean {
  const addr =
    c?.req?.header?.('x-forwarded-for') ??
    c?.req?.raw?.headers?.get?.('x-forwarded-for') ??
    ''
  if (addr) {
    const first = String(addr).split(',')[0]?.trim() ?? ''
    return first === '127.0.0.1' || first === '::1'
  }
  const remote =
    c?.req?.raw?.remoteAddress ??
    c?.env?.incoming?.socket?.remoteAddress ??
    ''
  if (!remote) return true
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
}

export function registerMcpMockRoutes(app: Hono) {
  if (!mcpMockEnabled()) {
    logger.debug('[mcp-mock] endpoint disabled')
    return
  }

  app.post('/debug/mcp-mock', async (c) => {
    if (!isLocalhostRequest(c)) {
      return c.json({ ok: false, error: 'localhost only' }, 403)
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ ok: false, error: 'Invalid JSON body' }, 400)
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ ok: false, error: 'Invalid payload', issues: parsed.error.issues }, 400)
    }
    const data = parsed.data
    try {
      if (data.action === 'register') {
        const result = registerMockPreset(data.preset as McpMockPreset)
        return c.json({ ok: true, preset: data.preset, ...result })
      }
      if (data.preset) {
        clearMockPreset(data.preset as McpMockPreset)
      } else {
        clearAllMockPresets()
      }
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400)
    }
  })

  app.get('/debug/mcp-mock/ping', (c) =>
    c.json({ ok: true, enabled: true, presets: listAvailablePresets() }),
  )

  logger.info('[mcp-mock] /debug/mcp-mock endpoint registered')
}
