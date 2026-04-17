/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * /debug/cloud-mock — test-only endpoint for the ai-browser-test skill.
 * Controls cloudMockStore state per session.
 *
 * Guard rails:
 *   - Only registered when OPENLOAF_CLOUD_MOCK=1 (or NODE_ENV=test)
 *   - Only accepts requests from localhost (127.0.0.1 / ::1)
 *   - Paths must resolve inside the ai-browser-test skill fixtures directory
 *     (no arbitrary filesystem writes)
 */
import type { Hono } from 'hono'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import {
  cloudMockEnabled,
  setCaptureMode,
  setMockMode,
  clearMock,
} from '@/ai/tools/cloud/cloudMockStore'
import { logger } from '@/common/logger'

const SKILL_FIXTURES_ROOT = path.resolve(
  process.cwd(),
  // server 的 cwd 通常是 apps/server —— 从这里回到 monorepo 根再进 skill fixtures
  '..',
  '..',
  '.agents/skills/ai-browser-test/fixtures/cloud-mocks',
)

const setCaptureSchema = z.object({
  action: z.literal('set-capture'),
  sessionId: z.string().min(1),
  captureDir: z.string().min(1),
  meta: z.record(z.string(), z.unknown()).default({}),
})
const setMockSchema = z.object({
  action: z.literal('set-mock'),
  sessionId: z.string().min(1),
  fixtureDir: z.string().min(1),
})
const clearSchema = z.object({
  action: z.literal('clear'),
  sessionId: z.string().min(1),
})

const bodySchema = z.union([setCaptureSchema, setMockSchema, clearSchema])

function isLocalhostRequest(c: any): boolean {
  const addr = c?.req?.header?.('x-forwarded-for')
    ?? c?.req?.raw?.headers?.get?.('x-forwarded-for')
    ?? ''
  if (addr) {
    // 反代场景（有 X-Forwarded-For）：明确只放行 localhost 链
    const first = String(addr).split(',')[0]?.trim() ?? ''
    return first === '127.0.0.1' || first === '::1'
  }
  // 无反代：直接看 hono 的 socket
  const remote = c?.req?.raw?.remoteAddress
    ?? c?.env?.incoming?.socket?.remoteAddress
    ?? ''
  if (!remote) return true  // 开发环境 node fetch adapter 可能不暴露，保守放行
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1'
}

/** 目标目录必须落在 SKILL_FIXTURES_ROOT 里，防 path traversal。 */
function assertInsideFixtures(abs: string): void {
  const norm = path.resolve(abs)
  if (!norm.startsWith(SKILL_FIXTURES_ROOT + path.sep) && norm !== SKILL_FIXTURES_ROOT) {
    throw new Error(`path must be inside fixtures/cloud-mocks: ${abs}`)
  }
}

export function registerCloudMockRoutes(app: Hono) {
  if (!cloudMockEnabled()) {
    logger.debug('[cloudMock] endpoint disabled (OPENLOAF_CLOUD_MOCK not set)')
    return
  }

  app.post('/debug/cloud-mock', async (c) => {
    if (!isLocalhostRequest(c)) {
      return c.json({ ok: false, error: 'localhost only' }, 403)
    }
    let body: unknown
    try { body = await c.req.json() } catch {
      return c.json({ ok: false, error: 'Invalid JSON body' }, 400)
    }
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ ok: false, error: 'Invalid payload', details: parsed.error.format() }, 400)
    }
    const data = parsed.data
    try {
      if (data.action === 'set-capture') {
        assertInsideFixtures(data.captureDir)
        setCaptureMode(data.sessionId, path.resolve(data.captureDir), data.meta)
        return c.json({ ok: true, mode: 'capture', sessionId: data.sessionId })
      }
      if (data.action === 'set-mock') {
        assertInsideFixtures(data.fixtureDir)
        if (!existsSync(data.fixtureDir)) {
          return c.json({ ok: false, error: `fixtureDir not found: ${data.fixtureDir}` }, 404)
        }
        setMockMode(data.sessionId, path.resolve(data.fixtureDir))
        return c.json({ ok: true, mode: 'mock', sessionId: data.sessionId })
      }
      clearMock(data.sessionId)
      return c.json({ ok: true, mode: 'off', sessionId: data.sessionId })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return c.json({ ok: false, error: msg }, 400)
    }
  })

  app.get('/debug/cloud-mock/ping', (c) => c.json({ ok: true, enabled: true }))

  logger.info('[cloudMock] /debug/cloud-mock endpoint registered')
}
