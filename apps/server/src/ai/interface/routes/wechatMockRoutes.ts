/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * /debug/wechat/* — test-only endpoints for the ai-browser-test "wechat"
 * suite. Drives the iLink mock (apiClientFactory → MockApiClient) so we can
 * exercise the full poll → debounce → runChatStream → sendText loop without
 * touching the real iLink Bot / user's phone.
 *
 * Mock is inert unless a test explicitly registers an account via
 * `POST /debug/wechat/createAccount`; a real dev session with a bound WeChat
 * account still hits the real iLink.
 *
 * Localhost only.
 */
import type { Hono } from 'hono'
import { z } from 'zod'
import type { WeixinMessage } from 'wechat-ilink-client'
import {
  wechatMockEnabled,
  registerMockAccount,
  injectInbound,
  getOutbound,
  resetAllMocks,
  setMockMode,
  type MockMode,
} from '@/services/wechat/wechatMockStore'
import { upsertAccount } from '@/services/wechat/wechatAccountStore'
import { startWorkerForAccount, stopWorkerForAccount } from '@/services/wechat/wechatPollWorker'
import { __resetBridgeStateForTests } from '@/services/wechat/wechatAiBridge'
import { logger } from '@/common/logger'

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

const createAccountSchema = z.object({
  accountId: z.string().min(1),
  botId: z.string().default('mock-bot@im.bot'),
  ownerUserId: z.string().default('mock-owner-user'),
  displayName: z.string().optional(),
  mode: z.enum(['normal', 'sendFails']).default('normal'),
  startWorker: z.boolean().default(true),
})

const injectSchema = z.object({
  accountId: z.string().min(1),
  msgs: z.array(z.record(z.string(), z.unknown())).min(1),
})

const setModeSchema = z.object({
  accountId: z.string().min(1),
  mode: z.enum(['normal', 'sendFails']),
})

export function registerWeChatMockRoutes(app: Hono) {
  if (!wechatMockEnabled()) {
    logger.debug('[wechat-mock] endpoint disabled (production without OPENLOAF_WECHAT_MOCK=1)')
    return
  }

  app.post('/debug/wechat/reset', (c) => {
    if (!isLocalhostRequest(c)) return c.json({ ok: false, error: 'localhost only' }, 403)
    resetAllMocks()
    __resetBridgeStateForTests()
    return c.json({ ok: true })
  })

  app.post('/debug/wechat/createAccount', async (c) => {
    if (!isLocalhostRequest(c)) return c.json({ ok: false, error: 'localhost only' }, 403)
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'Invalid JSON' }, 400) }
    const parsed = createAccountSchema.safeParse(body)
    if (!parsed.success) return c.json({ ok: false, issues: parsed.error.issues }, 400)
    const { accountId, botId, ownerUserId, displayName, mode, startWorker } = parsed.data

    registerMockAccount(accountId, mode as MockMode)
    upsertAccount({
      id: accountId,
      botId,
      displayName: displayName ?? botId,
      botToken: 'mock-token',
      baseUrl: 'https://mock.ilink.local',
      ownerUserId,
      syncBuf: '',
      status: 'connected',
      boundAt: new Date().toISOString(),
    })
    if (startWorker) {
      const { getAccount } = await import('@/services/wechat/wechatAccountStore')
      const acc = getAccount(accountId)
      if (acc) startWorkerForAccount(acc)
    }
    return c.json({ ok: true, accountId })
  })

  app.post('/debug/wechat/inject', async (c) => {
    if (!isLocalhostRequest(c)) return c.json({ ok: false, error: 'localhost only' }, 403)
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'Invalid JSON' }, 400) }
    const parsed = injectSchema.safeParse(body)
    if (!parsed.success) return c.json({ ok: false, issues: parsed.error.issues }, 400)
    try {
      injectInbound(parsed.data.accountId, parsed.data.msgs as unknown as WeixinMessage[])
      return c.json({ ok: true, injected: parsed.data.msgs.length })
    } catch (err) {
      return c.json({ ok: false, error: String(err) }, 400)
    }
  })

  app.get('/debug/wechat/outbound', (c) => {
    if (!isLocalhostRequest(c)) return c.json({ ok: false, error: 'localhost only' }, 403)
    const accountId = c.req.query('accountId')
    if (!accountId) return c.json({ ok: false, error: 'accountId query param required' }, 400)
    return c.json({ ok: true, outbound: getOutbound(accountId) })
  })

  app.post('/debug/wechat/setMode', async (c) => {
    if (!isLocalhostRequest(c)) return c.json({ ok: false, error: 'localhost only' }, 403)
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'Invalid JSON' }, 400) }
    const parsed = setModeSchema.safeParse(body)
    if (!parsed.success) return c.json({ ok: false, issues: parsed.error.issues }, 400)
    try {
      setMockMode(parsed.data.accountId, parsed.data.mode as MockMode)
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ ok: false, error: String(err) }, 400)
    }
  })

  app.post('/debug/wechat/stopWorker', async (c) => {
    if (!isLocalhostRequest(c)) return c.json({ ok: false, error: 'localhost only' }, 403)
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'Invalid JSON' }, 400) }
    const accountId = (body as any)?.accountId
    if (typeof accountId !== 'string') return c.json({ ok: false, error: 'accountId required' }, 400)
    stopWorkerForAccount(accountId)
    return c.json({ ok: true })
  })

  app.get('/debug/wechat/ping', (c) => c.json({ ok: true, enabled: true }))

  logger.info('[wechat-mock] /debug/wechat endpoints registered')
}
