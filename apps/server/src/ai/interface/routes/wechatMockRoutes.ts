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
  resetMockAccount,
  setMockMode,
  registerMockMediaBuffer,
  setFakeLoggedOut,
  type MockMode,
} from '@/services/wechat/wechatMockStore'
import { upsertAccount, removeEphemeralAccount } from '@/services/wechat/wechatAccountStore'
import { startWorkerForAccount, stopWorkerForAccount } from '@/services/wechat/wechatPollWorker'
import {
  __resetBridgeStateForTests,
  __resetBridgeStateForSession,
  __debugFastAgentPing,
} from '@/services/wechat/wechatAiBridge'
import { deriveWeChatSessionId } from '@/services/wechat/wechatMessageService'
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

const registerMockMediaSchema = z.object({
  accountId: z.string().min(1),
  lookupKey: z.string().min(1),
  dataB64: z.string().min(1),
  kind: z.enum(['image', 'voice', 'video', 'file']),
  fileName: z.string().optional(),
})

const setFakeLoggedOutSchema = z.object({
  accountId: z.string().min(1),
  value: z.boolean(),
})

export function registerWeChatMockRoutes(app: Hono) {
  if (!wechatMockEnabled()) {
    logger.debug('[wechat-mock] endpoint disabled (production without OPENLOAF_WECHAT_MOCK=1)')
    return
  }

  app.post('/debug/wechat/reset', async (c) => {
    if (!isLocalhostRequest(c)) return c.json({ ok: false, error: 'localhost only' }, 403)
    let body: any = null
    try { body = await c.req.json() } catch { /* allow empty body */ }
    const accountId = typeof body?.accountId === 'string' && body.accountId ? body.accountId : null
    if (accountId) {
      // Per-account reset — required for parallel browser tests so one
      // test's reset doesn't wipe other concurrent accounts' inbox/outbox.
      // Also stop the poll worker so leftover workers from previous runs
      // don't keep tying up the AI runtime.
      stopWorkerForAccount(accountId)
      resetMockAccount(accountId)
      removeEphemeralAccount(accountId)
      __resetBridgeStateForSession(deriveWeChatSessionId(accountId))
      return c.json({ ok: true, scope: 'account', accountId })
    }
    resetAllMocks()
    __resetBridgeStateForTests()
    return c.json({ ok: true, scope: 'global' })
  })

  app.post('/debug/wechat/createAccount', async (c) => {
    if (!isLocalhostRequest(c)) return c.json({ ok: false, error: 'localhost only' }, 403)
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'Invalid JSON' }, 400) }
    const parsed = createAccountSchema.safeParse(body)
    if (!parsed.success) return c.json({ ok: false, issues: parsed.error.issues }, 400)
    const { accountId, botId, ownerUserId, displayName, mode, startWorker } = parsed.data

    registerMockAccount(accountId, mode as MockMode)
    upsertAccount(
      {
        id: accountId,
        botId,
        displayName: displayName ?? botId,
        botToken: 'mock-token',
        baseUrl: 'https://mock.ilink.local',
        ownerUserId,
        syncBuf: '',
        status: 'connected',
        boundAt: new Date().toISOString(),
      },
      { ephemeral: true },
    )
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

  app.post('/debug/wechat/registerMockMedia', async (c) => {
    if (!isLocalhostRequest(c)) return c.json({ ok: false, error: 'localhost only' }, 403)
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'Invalid JSON' }, 400) }
    const parsed = registerMockMediaSchema.safeParse(body)
    if (!parsed.success) return c.json({ ok: false, issues: parsed.error.issues }, 400)
    try {
      const data = Buffer.from(parsed.data.dataB64, 'base64')
      registerMockMediaBuffer(parsed.data.accountId, parsed.data.lookupKey, {
        data,
        kind: parsed.data.kind,
        fileName: parsed.data.fileName,
      })
      return c.json({ ok: true, size: data.length })
    } catch (err) {
      return c.json({ ok: false, error: String(err) }, 400)
    }
  })

  app.post('/debug/wechat/setFakeLoggedOut', async (c) => {
    if (!isLocalhostRequest(c)) return c.json({ ok: false, error: 'localhost only' }, 403)
    let body: unknown
    try { body = await c.req.json() } catch { return c.json({ ok: false, error: 'Invalid JSON' }, 400) }
    const parsed = setFakeLoggedOutSchema.safeParse(body)
    if (!parsed.success) return c.json({ ok: false, issues: parsed.error.issues }, 400)
    try {
      setFakeLoggedOut(parsed.data.accountId, parsed.data.value)
      return c.json({ ok: true })
    } catch (err) {
      return c.json({ ok: false, error: String(err) }, 400)
    }
  })

  app.get('/debug/wechat/ping', (c) => c.json({ ok: true, enabled: true }))

  // Stand-alone fast-agent ping — runs the fast path once with a canned
  // prompt, returns the latency breakdown. Useful to isolate "why is the fast
  // agent slow" from race-mode noise.
  //   GET /debug/wechat/fast-ping?text=你好
  app.get('/debug/wechat/fast-ping', async (c) => {
    if (!isLocalhostRequest(c)) return c.json({ ok: false, error: 'localhost only' }, 403)
    const text = c.req.query('text') ?? '你好'
    try {
      const result = await __debugFastAgentPing(text)
      return c.json({ ok: true, ...result })
    } catch (err) {
      return c.json({ ok: false, error: String(err) }, 500)
    }
  })

  logger.info('[wechat-mock] /debug/wechat endpoints registered')
}
