/**
 * WeChatProbeHarness — browser test harness for the WeChat iLink integration.
 *
 * Drives the server-side mock iLink (/debug/wechat/*) so tests exercise the
 * real poll → debounce → runChatStream → sendText pipeline without touching
 * the user's phone. Scenario is a caller-supplied async function that uses
 * the provided api to inject messages, poll outbound, etc; the harness
 * reports ready after it returns and surfaces the result on data-probe-*.
 *
 * Visual layer (added 2026-04-24): while the scenario runs, an independent
 * poller renders a WeChat-style bubble UI so humans watching the test run
 * actually see the conversation unfold — left bubbles for inbound user
 * messages (injected via api.inject), right bubbles for outbound AI replies
 * (recorded by mock sendText), a typing pulse while the bridge is working,
 * and a small timeline of fast-ack vs full-reply bubbles (bridge V2: Promise.race
 * between fastAgent + fullAgent). The poller is pure read-only (uses
 * api.getMessages + api.getOutbound) and does not affect
 * scenario outcome — so all existing `wechat/*` test cases keep working
 * unchanged while new tests can just watch the UI visually for signal.
 */
import * as React from 'react'
import PageProbeHarness, { usePageProbe } from './PageProbeHarness'
import { captureDomSnapshotToWindow } from './ChatProbeHarness'

/**
 * Shape of each entry returned by `getOutbound` / `waitForOutbound`. The
 * mockStore records every AccountApiClient.send* call; kind='text' keeps the
 * legacy shape (existing 001-008 tests read `.text`), while media kinds
 * carry localPath + mediaType + optional fileName/caption.
 */
export type WeChatOutboundEntry = {
  to: string
  kind: 'text' | 'image' | 'video' | 'file'
  text?: string
  localPath?: string
  mediaType?: string
  fileName?: string
  caption?: string
  contextToken?: string
  at: number
  messageId: string
}

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
  /**
   * Register a mock media buffer so MockApiClient.downloadMedia returns real
   * bytes for an inbound media item. `lookupKey` must match the aes_key (or
   * encrypt_query_param) set on the inbound item's *_item.media field.
   * Without this call, persistMediaItem drops the item silently.
   */
  registerMockMedia: (
    lookupKey: string,
    dataB64: string,
    kind: 'image' | 'voice' | 'video' | 'file',
    fileName?: string,
  ) => Promise<void>
  /** Switch mock between normal and sendFails modes mid-test. */
  setMode: (mode: 'normal' | 'sendFails') => Promise<void>
  /** Read outbound AccountApiClient.send* calls recorded by mock. */
  getOutbound: () => Promise<WeChatOutboundEntry[]>
  /** Read session row from DB (for kind/errorMessage assertions). */
  getSession: () => Promise<any>
  /** Read messages.jsonl for this session. */
  getMessages: () => Promise<any[]>
  /** Poll outbound until length >= expected or timeout. */
  waitForOutbound: (expectedLen: number, timeoutMs?: number) => Promise<WeChatOutboundEntry[]>
}

export type WeChatProbeScenario = (api: WeChatProbeApi) => Promise<Record<string, unknown>>

export type WeChatProbeHarnessProps = {
  serverUrl: string
  accountId: string
  scenario: WeChatProbeScenario
  /** Visible contact name in the WeChat header (default: '我'). */
  contactName?: string
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
  async function getOutbound(): Promise<WeChatOutboundEntry[]> {
    const j = await get(`/debug/wechat/outbound?accountId=${encodeURIComponent(accountId)}`)
    return (j?.outbound ?? []) as WeChatOutboundEntry[]
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
      await post('/debug/wechat/reset', { accountId })
    },
    async inject(msgs) {
      await post('/debug/wechat/inject', { accountId, msgs })
    },
    async registerMockMedia(lookupKey, dataB64, kind, fileName) {
      await post('/debug/wechat/registerMockMedia', {
        accountId,
        lookupKey,
        dataB64,
        kind,
        fileName,
      })
    },
    async setMode(mode) {
      await post('/debug/wechat/setMode', { accountId, mode })
    },
    getOutbound,
    async getSession() {
      const sessionId = `wx-${accountId}`
      const res = await fetch(
        `${base}/trpc/chat.getSession?input=${encodeURIComponent(JSON.stringify({ json: { sessionId } }))}`,
        { headers: { 'X-OpenLoaf-Client': '1' } },
      )
      if (!res.ok) return null
      const j = await res.json().catch(() => null)
      return j?.result?.data?.json ?? null
    },
    async getMessages() {
      const sessionId = `wx-${accountId}`
      const res = await fetch(
        `${base}/trpc/chat.getSessionMessages?input=${encodeURIComponent(JSON.stringify({ json: { sessionId } }))}`,
        { headers: { 'X-OpenLoaf-Client': '1' } },
      )
      if (!res.ok) return []
      const j = await res.json().catch(() => null)
      return j?.result?.data?.json?.messages ?? []
    },
    async waitForOutbound(expectedLen, timeoutMs = 30_000): Promise<WeChatOutboundEntry[]> {
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

// ---------------------------------------------------------------------------
// Visual layer — WeChat-style bubble UI rendered alongside the scenario.
// Pure read-only: independently polls api.getMessages + api.getOutbound every
// 400ms and paints the conversation. Does not touch scenario / ready / error.
// ---------------------------------------------------------------------------

type BubbleKind = 'user' | 'assistant-ack' | 'assistant-final' | 'tool-badge'
type Bubble = {
  id: string
  kind: BubbleKind
  text: string
  at: number
  /** 仅 tool-badge / assistant-ack 用 — 显示相对于第一条 user 消息的毫秒偏移 */
  offsetMs?: number
  /** 仅 tool-badge 用 — 工具名和是否有错 */
  toolName?: string
  toolHasError?: boolean
  /** 仅 outbound media 气泡用 — 渲染 📷/🎬/📎 徽标+文件名 */
  mediaKind?: 'image' | 'video' | 'file'
  mediaName?: string
  mediaType?: string
}

function fmtTime(ms: number): string {
  const d = new Date(ms)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function fmtOffset(ms: number): string {
  if (ms < 1000) return `+${ms}ms`
  return `+${(ms / 1000).toFixed(2)}s`
}

function WeChatChatView({
  api,
  contactName,
  ready,
  errorText,
}: {
  api: WeChatProbeApi
  contactName: string
  ready: boolean
  errorText: string | null
}) {
  const [bubbles, setBubbles] = React.useState<Bubble[]>([])
  const [typing, setTyping] = React.useState(false)
  const [firstInboundAt, setFirstInboundAt] = React.useState<number | null>(null)
  const [firstOutboundAt, setFirstOutboundAt] = React.useState<number | null>(null)
  const scrollerRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function tick() {
      try {
        const [msgs, out] = await Promise.all([api.getMessages(), api.getOutbound()])
        if (cancelled) return

        const next: Bubble[] = []
        // Inbound user messages from jsonl (wx=inbound direction)
        let firstIn: number | null = null
        for (const m of msgs) {
          if (m?.role !== 'user') continue
          const wx = m?.metadata?.wechat
          if (!wx || wx.direction !== 'inbound') continue
          const ts = wx.createTimeMs ?? Date.parse(m.createdAt ?? '') ?? Date.now()
          const text = Array.isArray(m.parts)
            ? m.parts.filter((p: any) => p?.type === 'text').map((p: any) => p.text).join('')
            : ''
          next.push({ id: `in-${m.id}`, kind: 'user', text, at: ts })
          if (firstIn == null) firstIn = ts
        }
        if (firstIn != null) setFirstInboundAt(firstIn)

        // Assistant tool-call badges (WebSearch, WebFetch, etc.) from jsonl.
        // Bridge V2 ack 由 bridge 层独立发送，agent 工具链里不会再出现 SendChannelReply。
        const latestAsst = [...msgs].reverse().find((m: any) => m?.role === 'assistant')
        if (latestAsst && Array.isArray(latestAsst.parts)) {
          let idx = 0
          for (const p of latestAsst.parts as any[]) {
            const t = p?.type ?? ''
            if (typeof t === 'string' && t.startsWith('tool-')) {
              const toolName = t.slice('tool-'.length)
              const ts = p?.providerMetadata?.at ?? Date.parse(latestAsst.createdAt ?? '') ?? Date.now()
              const out = p?.output
              const hasError =
                (out && typeof out === 'object' && (out as any).__droppedUnloaded === true) ||
                (out && typeof out === 'object' && ((out as any).error || (out as any).isError))
              next.push({
                id: `tool-${latestAsst.id}-${idx}`,
                kind: 'tool-badge',
                text: toolName,
                at: ts,
                toolName,
                toolHasError: Boolean(hasError),
                offsetMs: firstIn != null ? Math.max(0, ts - firstIn) : undefined,
              })
              idx++
            }
          }
        }

        // Outbound AccountApiClient.send* — each one is a right-side bubble from the assistant's POV.
        // The FIRST outbound arriving after the latest inbound is treated as the ack;
        // subsequent ones are "final" bubbles. Non-text kinds render as media badges
        // inside the same bubble frame so humans see 📷/🎬/📎 alongside any caption.
        let firstOut: number | null = null
        for (let i = 0; i < out.length; i++) {
          const o = out[i]
          if (!o) continue
          if (firstIn != null && o.at < firstIn) continue // stale pre-inbound
          if (firstOut == null) firstOut = o.at
          const mediaKind =
            o.kind === 'image' || o.kind === 'video' || o.kind === 'file' ? o.kind : undefined
          const mediaName = o.fileName ?? (o.localPath ? o.localPath.split('/').pop() : undefined)
          next.push({
            id: `out-${o.messageId ?? i}`,
            kind: i === (firstOut != null ? 0 : -1) ? 'assistant-ack' : 'assistant-final',
            text: o.text ?? o.caption ?? '',
            at: o.at,
            offsetMs: firstIn != null ? Math.max(0, o.at - firstIn) : undefined,
            mediaKind,
            mediaName,
            mediaType: o.mediaType,
          })
        }
        if (firstOut != null) setFirstOutboundAt(firstOut)

        // Sort by timestamp then stable by kind hint (user < tool < ack < final at same ms).
        next.sort((a, b) => a.at - b.at)
        setBubbles(next)

        // typing indicator: we have inbound but no outbound yet (i.e., bridge working)
        setTyping(firstIn != null && out.length === 0 && !ready && !errorText)
      } catch {
        // silent — UI layer should never crash the scenario
      }
    }
    const id = setInterval(tick, 400)
    void tick()
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [api, ready, errorText])

  React.useEffect(() => {
    const el = scrollerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [bubbles.length, typing])

  const ackLatencyMs =
    firstInboundAt != null && firstOutboundAt != null ? firstOutboundAt - firstInboundAt : null

  return (
    <div
      style={{
        width: 380,
        height: 720,
        margin: '24px auto',
        border: '1px solid #d1d5db',
        borderRadius: 16,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif',
        background: '#ededed',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}
      data-testid="wechat-chat-view"
    >
      {/* Header — WeChat green bar with contact name */}
      <div
        style={{
          height: 52,
          background: '#111',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
          fontWeight: 500,
          position: 'relative',
        }}
      >
        <span style={{ position: 'absolute', left: 16, fontSize: 20 }}>‹</span>
        <span data-testid="wechat-contact-name">{contactName}</span>
        <span style={{ position: 'absolute', right: 16, fontSize: 20 }}>···</span>
      </div>

      {/* Banner — ack latency display, huge so human can see at a glance */}
      {ackLatencyMs != null && (
        <div
          data-testid="wechat-ack-latency-banner"
          data-ack-latency-ms={ackLatencyMs}
          style={{
            padding: '6px 12px',
            background: ackLatencyMs <= 3000 ? '#d1fae5' : '#fee2e2',
            color: ackLatencyMs <= 3000 ? '#065f46' : '#991b1b',
            fontSize: 12,
            textAlign: 'center',
            borderBottom: '1px solid rgba(0,0,0,0.05)',
          }}
        >
          首条回复延迟：<b>{fmtOffset(ackLatencyMs)}</b>
          {ackLatencyMs <= 3000 ? ' ✅ 达标（≤3s）' : ' ❌ 超时（>3s）'}
        </div>
      )}

      {/* Messages scroller */}
      <div
        ref={scrollerRef}
        data-testid="wechat-messages-scroller"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: '#ededed',
        }}
      >
        {bubbles.length === 0 && !typing && (
          <div
            style={{
              color: '#999',
              fontSize: 12,
              textAlign: 'center',
              padding: 20,
            }}
          >
            还没有消息…
          </div>
        )}

        {bubbles.map((b) => {
          if (b.kind === 'tool-badge') {
            return (
              <div
                key={b.id}
                data-testid={`wechat-tool-badge-${b.toolName}`}
                data-tool-name={b.toolName}
                data-tool-has-error={b.toolHasError ? '1' : '0'}
                style={{
                  alignSelf: 'center',
                  fontSize: 11,
                  color: b.toolHasError ? '#b91c1c' : '#6b7280',
                  background: b.toolHasError ? '#fee2e2' : '#e5e7eb',
                  padding: '2px 10px',
                  borderRadius: 10,
                }}
              >
                🔧 {b.toolName}
                {b.offsetMs != null && <span style={{ opacity: 0.7 }}> · {fmtOffset(b.offsetMs)}</span>}
              </div>
            )
          }
          const isUser = b.kind === 'user'
          const isAck = b.kind === 'assistant-ack'
          return (
            <div
              key={b.id}
              data-testid={`wechat-bubble-${b.kind}`}
              data-bubble-kind={b.kind}
              data-bubble-offset-ms={b.offsetMs}
              style={{
                display: 'flex',
                flexDirection: isUser ? 'row-reverse' : 'row',
                alignItems: 'flex-start',
                gap: 8,
              }}
            >
              {/* avatar */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 4,
                  background: isUser ? '#07C160' : '#fff',
                  color: isUser ? '#fff' : '#333',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  border: isUser ? 'none' : '1px solid #eee',
                  flex: '0 0 auto',
                }}
              >
                {isUser ? '我' : 'AI'}
              </div>
              {/* bubble */}
              <div style={{ maxWidth: 250, display: 'flex', flexDirection: 'column', gap: 2 }}>
                {isAck && (
                  <div style={{ fontSize: 10, color: '#9ca3af', alignSelf: 'flex-start' }}>
                    首条回复 {b.offsetMs != null ? `· ${fmtOffset(b.offsetMs)}` : ''}
                  </div>
                )}
                <div
                  data-bubble-media-kind={b.mediaKind ?? ''}
                  data-bubble-media-type={b.mediaType ?? ''}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: isUser ? '#95EC69' : '#fff',
                    color: '#222',
                    fontSize: 15,
                    lineHeight: 1.4,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    boxShadow: '0 1px 1px rgba(0,0,0,0.04)',
                    position: 'relative',
                  }}
                >
                  {b.mediaKind ? (
                    <div
                      data-testid={`wechat-media-bubble-${b.mediaKind}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                      }}
                    >
                      <div style={{ fontSize: 13, color: '#4b5563', fontWeight: 500 }}>
                        {b.mediaKind === 'image' ? '📷 图片' : b.mediaKind === 'video' ? '🎬 视频' : '📎 文件'}
                        {b.mediaName ? ` · ${b.mediaName}` : ''}
                      </div>
                      {b.text && <div>{b.text}</div>}
                    </div>
                  ) : b.text ? (
                    b.text
                  ) : (
                    <span style={{ color: '#9ca3af' }}>（空消息）</span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    color: '#9ca3af',
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                  }}
                >
                  {fmtTime(b.at)}
                </div>
              </div>
            </div>
          )
        })}

        {typing && (
          <div
            data-testid="wechat-typing-indicator"
            style={{
              alignSelf: 'flex-start',
              display: 'flex',
              gap: 4,
              padding: '10px 14px',
              background: '#fff',
              borderRadius: 8,
              marginLeft: 44,
              boxShadow: '0 1px 1px rgba(0,0,0,0.04)',
            }}
          >
            <TypingDot delay={0} />
            <TypingDot delay={150} />
            <TypingDot delay={300} />
          </div>
        )}
      </div>

      {/* Footer — mock input bar (disabled) */}
      <div
        style={{
          height: 52,
          background: '#f7f7f7',
          borderTop: '1px solid #d1d5db',
          padding: '0 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: '#9ca3af',
        }}
      >
        <div
          style={{
            flex: 1,
            height: 32,
            background: '#fff',
            borderRadius: 4,
            border: '1px solid #e5e7eb',
            padding: '0 10px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          （测试中 · 输入已禁用）
        </div>
        <div style={{ fontSize: 18 }}>🙂</div>
      </div>

      {/* Status strip — ready/error surfaced from scenario */}
      {(ready || errorText) && (
        <div
          data-testid="wechat-scenario-status"
          style={{
            padding: '4px 12px',
            fontSize: 11,
            background: errorText ? '#fee2e2' : '#ecfdf5',
            color: errorText ? '#991b1b' : '#065f46',
            borderTop: '1px solid rgba(0,0,0,0.04)',
          }}
        >
          {errorText ? `❌ scenario error: ${errorText.slice(0, 200)}` : '✅ scenario ready'}
        </div>
      )}
    </div>
  )
}

function TypingDot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: 3,
        background: '#9ca3af',
        display: 'inline-block',
        animation: `wechat-typing-pulse 1.2s ${delay}ms infinite ease-in-out`,
      }}
    />
  )
}

function Runner({
  scenario,
  api,
  contactName,
}: {
  scenario: WeChatProbeScenario
  api: WeChatProbeApi
  contactName: string
}) {
  const probe = usePageProbe()
  const ranRef = React.useRef(false)
  const [ready, setReady] = React.useState(false)
  const [errorText, setErrorText] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true
    ;(async () => {
      try {
        await api.reset()
        const payload = await scenario(api)
        setReady(true)
        // 让 setReady 引起的气泡 UI 最后一次渲染/状态栏刷新先 flush 到 DOM，
        // 再抓快照——否则 dom.html 里看不到"✅ scenario ready"状态条 +
        // ack 延迟 banner 的最终配色。requestAnimationFrame 两轮足够 React
        // commit 完成；再 await 一次让轮询器 400ms tick 有机会把最后一条
        // outbound 气泡追加上来。
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
        await new Promise((r) => setTimeout(r, 450))
        await captureDomSnapshotToWindow()
        probe.reportReady(payload)
      } catch (err) {
        const msg =
          err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err)
        setErrorText(msg)
        // error 分支也抓一张，便于事后看"挂的时候 UI 长什么样"
        try {
          await new Promise((r) => requestAnimationFrame(() => r(null)))
          await captureDomSnapshotToWindow()
        } catch { /* best-effort */ }
        probe.reportError(msg)
      }
    })()
  }, [api, scenario, probe])

  return (
    <>
      {/* Required for typing dots animation — inject once */}
      <style>{`@keyframes wechat-typing-pulse { 0%, 80%, 100% { opacity: 0.3 } 40% { opacity: 1 } }`}</style>
      <WeChatChatView api={api} contactName={contactName} ready={ready} errorText={errorText} />
    </>
  )
}

export default function WeChatProbeHarness({
  serverUrl,
  accountId,
  scenario,
  contactName = '微信好友',
}: WeChatProbeHarnessProps) {
  const api = React.useMemo(() => buildApi(serverUrl, accountId), [serverUrl, accountId])
  return (
    <PageProbeHarness serverUrl={serverUrl}>
      <Runner scenario={scenario} api={api} contactName={contactName} />
    </PageProbeHarness>
  )
}
