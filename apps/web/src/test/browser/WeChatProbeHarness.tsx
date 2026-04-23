/**
 * WeChatProbeHarness — browser test harness for the WeChat iLink integration.
 *
 * Drives the server-side mock iLink (/debug/wechat/*) so tests exercise the
 * real poll → debounce → runChatStream → sendText pipeline without touching
 * the user's phone. Scenario is a caller-supplied async function that uses
 * the provided api to inject messages, poll outbound, etc; the harness
 * reports ready after it returns and surfaces the result on data-probe-*.
 */
import * as React from 'react'
import PageProbeHarness, { usePageProbe } from './PageProbeHarness'

export type WeChatProbeApi = {
  accountId: string
  /** Create mock account on server (also starts the poll worker). */
  createAccount: (opts?: {
    mode?: 'normal' | 'sendFails'
    ownerUserId?: string
    botId?: string
  }) => Promise<void>
  /** Reset all mock state (call this at the START of every test). */
  reset: () => Promise<void>
  /** Inject inbound messages — next getUpdates call returns them. */
  inject: (msgs: Array<Record<string, unknown>>) => Promise<void>
  /** Switch mock between normal and sendFails modes mid-test. */
  setMode: (mode: 'normal' | 'sendFails') => Promise<void>
  /** Read outbound sendText calls recorded by mock. */
  getOutbound: () => Promise<
    Array<{ to: string; text: string; contextToken?: string; at: number; messageId: string }>
  >
  /** Read session row from DB (for kind/errorMessage assertions). */
  getSession: () => Promise<any>
  /** Read messages.jsonl for this session. */
  getMessages: () => Promise<any[]>
  /** Poll outbound until length >= expected or timeout. */
  waitForOutbound: (expectedLen: number, timeoutMs?: number) => Promise<any[]>
}

export type WeChatProbeScenario = (api: WeChatProbeApi) => Promise<Record<string, unknown>>

export type WeChatProbeHarnessProps = {
  serverUrl: string
  accountId: string
  scenario: WeChatProbeScenario
}

function buildApi(serverUrl: string, accountId: string): WeChatProbeApi {
  const base = serverUrl.replace(/\/$/, '')
  async function post(path: string, body: unknown) {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    })
    if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text().catch(() => '')}`)
    return res.json()
  }
  async function get(path: string) {
    const res = await fetch(`${base}${path}`)
    if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text().catch(() => '')}`)
    return res.json()
  }
  async function getOutbound(): Promise<WeChatProbeApi extends { getOutbound: () => Promise<infer R> } ? R : never> {
    const j = await get(`/debug/wechat/outbound?accountId=${encodeURIComponent(accountId)}`)
    return (j?.outbound ?? []) as any
  }
  return {
    accountId,
    async createAccount(opts) {
      await post('/debug/wechat/createAccount', {
        accountId,
        mode: opts?.mode ?? 'normal',
        ownerUserId: opts?.ownerUserId ?? `mock-owner-${accountId}`,
        botId: opts?.botId ?? `mock-bot-${accountId}@im.bot`,
        startWorker: true,
      })
    },
    async reset() {
      // Per-account scope — concurrent tests must not wipe each other's mock state.
      await post('/debug/wechat/reset', { accountId })
    },
    async inject(msgs) {
      await post('/debug/wechat/inject', { accountId, msgs })
    },
    async setMode(mode) {
      await post('/debug/wechat/setMode', { accountId, mode })
    },
    getOutbound,
    async getSession() {
      const sessionId = `wx-${accountId}`
      const res = await fetch(`${base}/trpc/chat.getSession?input=${encodeURIComponent(JSON.stringify({ json: { sessionId } }))}`, {
        headers: { 'X-OpenLoaf-Client': '1' },
      })
      if (!res.ok) return null
      const j = await res.json().catch(() => null)
      return j?.result?.data?.json ?? null
    },
    async getMessages() {
      const sessionId = `wx-${accountId}`
      const res = await fetch(`${base}/trpc/chat.getSessionMessages?input=${encodeURIComponent(JSON.stringify({ json: { sessionId } }))}`, {
        headers: { 'X-OpenLoaf-Client': '1' },
      })
      if (!res.ok) return []
      const j = await res.json().catch(() => null)
      return j?.result?.data?.json?.messages ?? []
    },
    async waitForOutbound(expectedLen, timeoutMs = 30_000) {
      const deadline = Date.now() + timeoutMs
      while (Date.now() < deadline) {
        const out = await getOutbound()
        if (out.length >= expectedLen) return out
        await new Promise((r) => setTimeout(r, 250))
      }
      throw new Error(
        `waitForOutbound: expected ${expectedLen}, got ${(await getOutbound()).length} after ${timeoutMs}ms`,
      )
    },
  }
}

function Runner({ scenario, api }: { scenario: WeChatProbeScenario; api: WeChatProbeApi }) {
  const probe = usePageProbe()
  const ranRef = React.useRef(false)
  React.useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    ;(async () => {
      try {
        await api.reset()
        const payload = await scenario(api)
        probe.reportReady(payload)
      } catch (err) {
        probe.reportError(err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err))
      }
    })()
  }, [api, scenario, probe])
  return <div data-testid="wechat-probe-runner">running…</div>
}

export default function WeChatProbeHarness({
  serverUrl,
  accountId,
  scenario,
}: WeChatProbeHarnessProps) {
  const api = React.useMemo(() => buildApi(serverUrl, accountId), [serverUrl, accountId])
  return (
    <PageProbeHarness serverUrl={serverUrl}>
      <Runner scenario={scenario} api={api} />
    </PageProbeHarness>
  )
}
