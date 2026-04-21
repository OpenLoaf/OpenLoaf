/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * /debug/macos-helper-mock — test-only endpoint for the ai-browser-test
 * macos-control suite. Switches which canned scenario the mock helper
 * returns for a given chat session.
 *
 * Only registered when OPENLOAF_MACOS_HELPER_MOCK=1. Localhost only.
 */
import type { Hono } from 'hono'
import { z } from 'zod'
import {
  macosHelperMockEnabled,
  setScenario,
  clearScenario,
} from '@/desktop/macosHelperMockStore'
import { logger } from '@/common/logger'

const setSchema = z.object({
  action: z.literal('set-scenario'),
  sessionId: z.string().min(1),
  scenario: z.string().min(1),
})
const clearSchema = z.object({
  action: z.literal('clear'),
  sessionId: z.string().min(1),
})
const bodySchema = z.union([setSchema, clearSchema])

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

export function registerMacosHelperMockRoutes(app: Hono) {
  if (!macosHelperMockEnabled()) {
    logger.debug('[macos-control-mock] endpoint disabled (OPENLOAF_MACOS_HELPER_MOCK not set)')
    return
  }

  app.post('/debug/macos-helper-mock', async (c) => {
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
      if (data.action === 'set-scenario') {
        setScenario(data.sessionId, data.scenario)
        return c.json({ ok: true, sessionId: data.sessionId, scenario: data.scenario })
      }
      clearScenario(data.sessionId)
      return c.json({ ok: true, sessionId: data.sessionId, scenario: null })
    } catch (err) {
      return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400)
    }
  })

  app.get('/debug/macos-helper-mock/ping', (c) => c.json({ ok: true, enabled: true }))

  logger.info('[macos-control-mock] /debug/macos-helper-mock endpoint registered')
}
