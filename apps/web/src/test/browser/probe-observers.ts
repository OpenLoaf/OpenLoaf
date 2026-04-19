/**
 * Install console + fetch proxies that record into window.__probeObservers.
 *
 * Call from harness mount (useEffect). Data is drained on test end via
 * drainProbeObservers() and merged into ProbeResult so saveTestData persists
 * it; generate-report.mjs then surfaces the logs in the HTML report.
 *
 * Passthrough semantics: real console output and real fetch responses are
 * never blocked — we only observe.
 */

export type ProbeConsoleEntry = {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug'
  /** ms since observer install */
  ts: number
  /** message text */
  text: string
  /** original args count */
  args: number
}

export type ProbeNetworkEntry = {
  /** ms since observer install */
  ts: number
  method: string
  url: string
  status: number | null
  /** ms from request start to response headers */
  durationMs: number | null
  error?: string
  ok: boolean
  contentType?: string
  /** request body, captured at fetch call time. Truncated to NETWORK_BODY_LIMIT. */
  requestBody?: string
  /** response body. Read via res.clone().text() fire-and-forget; may be empty if probe drained before stream finished. */
  responseBody?: string
  /** Marker when bodies were truncated past the limit. */
  requestBodyTruncated?: boolean
  responseBodyTruncated?: boolean
}

declare global {
  interface Window {
    __probeObservers?: {
      installedAt: number
      console: ProbeConsoleEntry[]
      network: ProbeNetworkEntry[]
      uninstall?: () => void
    }
  }
}

const MAX_CONSOLE = 500
const MAX_NETWORK = 300
// 单 entry req/resp body 上限。SSE 流（chat）很容易上 MB，512KB 截断让大多数完整 SSE
// 都能整段保留，又不至于让 result.json 爆掉。
const NETWORK_BODY_LIMIT = 512 * 1024

function captureRequestBody(_input: RequestInfo | URL, init?: RequestInit): { body?: string; truncated?: boolean } {
  // 优先 init.body（fetch 主入口），Request 对象的 body 是 stream，不便同步读
  const raw = init?.body
  if (raw == null) return {}
  try {
    if (typeof raw === 'string') {
      return raw.length > NETWORK_BODY_LIMIT
        ? { body: raw.slice(0, NETWORK_BODY_LIMIT), truncated: true }
        : { body: raw }
    }
    if (raw instanceof URLSearchParams) {
      const s = raw.toString()
      return s.length > NETWORK_BODY_LIMIT ? { body: s.slice(0, NETWORK_BODY_LIMIT), truncated: true } : { body: s }
    }
    if (raw instanceof FormData) {
      const parts: string[] = []
      raw.forEach((v, k) => {
        parts.push(typeof v === 'string' ? `${k}=${v}` : `${k}=<File ${(v as File).name}>`)
      })
      const s = parts.join('&')
      return s.length > NETWORK_BODY_LIMIT ? { body: s.slice(0, NETWORK_BODY_LIMIT), truncated: true } : { body: s }
    }
    if (raw instanceof Blob) {
      return { body: `<Blob ${raw.size} bytes type="${raw.type}">` }
    }
    if (raw instanceof ArrayBuffer) {
      return { body: `<ArrayBuffer ${raw.byteLength} bytes>` }
    }
    return { body: `<${(raw as { constructor?: { name?: string } }).constructor?.name ?? 'unknown'}>` }
  } catch {
    return {}
  }
}

function safeStringify(v: unknown): string {
  if (v == null) return String(v)
  if (typeof v === 'string') return v
  if (v instanceof Error) return `${v.name}: ${v.message}`
  try { return JSON.stringify(v) } catch { return String(v) }
}

export function installProbeObservers(): void {
  if (typeof window === 'undefined') return
  if (window.__probeObservers) return // idempotent

  const installedAt = Date.now()
  const state: NonNullable<Window['__probeObservers']> = {
    installedAt,
    console: [],
    network: [],
  }
  window.__probeObservers = state

  // ── Console proxy ──
  const levels: ProbeConsoleEntry['level'][] = ['log', 'info', 'warn', 'error', 'debug']
  const originals: Partial<Record<ProbeConsoleEntry['level'], (...args: unknown[]) => void>> = {}
  for (const level of levels) {
    const orig = (console as unknown as Record<string, (...args: unknown[]) => void>)[level]
    originals[level] = orig
    ;(console as unknown as Record<string, (...args: unknown[]) => void>)[level] = (...args: unknown[]) => {
      try {
        if (state.console.length < MAX_CONSOLE) {
          state.console.push({
            level,
            ts: Date.now() - installedAt,
            text: args.map(safeStringify).join(' ').slice(0, 2000),
            args: args.length,
          })
        }
      } catch {}
      return orig(...args)
    }
  }

  // ── fetch proxy ──
  const origFetch = window.fetch.bind(window)
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const start = Date.now()
    const method = (init?.method ?? (typeof input !== 'string' && 'method' in (input as Request) ? (input as Request).method : 'GET') ?? 'GET').toUpperCase()
    const url = typeof input === 'string' ? input
      : input instanceof URL ? input.toString()
      : (input as Request).url
    const reqBody = captureRequestBody(input, init)
    try {
      const res = await origFetch(input as RequestInfo, init)
      if (state.network.length < MAX_NETWORK) {
        const entry: ProbeNetworkEntry = {
          ts: start - installedAt,
          method, url,
          status: res.status,
          durationMs: Date.now() - start,
          ok: res.ok,
          contentType: res.headers.get('content-type') ?? undefined,
        }
        if (reqBody.body !== undefined) entry.requestBody = reqBody.body
        if (reqBody.truncated) entry.requestBodyTruncated = true
        state.network.push(entry)
        // Fire-and-forget: clone() lets us read response without consuming the original stream.
        // For SSE/chat streams, .text() resolves only after the stream ends — by then onComplete
        // may already have drained, so the body may be missing in the report. Acceptable trade-off.
        try {
          res.clone().text().then(text => {
            if (typeof text !== 'string') return
            if (text.length > NETWORK_BODY_LIMIT) {
              entry.responseBody = text.slice(0, NETWORK_BODY_LIMIT)
              entry.responseBodyTruncated = true
            } else {
              entry.responseBody = text
            }
          }).catch(() => { /* ignore — body capture is best-effort */ })
        } catch { /* ignore — clone may fail on already-consumed responses */ }
      }
      return res
    } catch (err) {
      if (state.network.length < MAX_NETWORK) {
        const entry: ProbeNetworkEntry = {
          ts: start - installedAt,
          method, url,
          status: null,
          durationMs: Date.now() - start,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
        if (reqBody.body !== undefined) entry.requestBody = reqBody.body
        if (reqBody.truncated) entry.requestBodyTruncated = true
        state.network.push(entry)
      }
      throw err
    }
  }) as typeof window.fetch

  state.uninstall = () => {
    for (const level of levels) {
      const orig = originals[level]
      if (orig) (console as unknown as Record<string, (...args: unknown[]) => void>)[level] = orig
    }
    window.fetch = origFetch
  }
}

/** Snapshot current observer buffers. Does NOT uninstall. */
export function drainProbeObservers(): { console: ProbeConsoleEntry[]; network: ProbeNetworkEntry[] } {
  if (typeof window === 'undefined' || !window.__probeObservers) {
    return { console: [], network: [] }
  }
  return {
    console: [...window.__probeObservers.console],
    network: [...window.__probeObservers.network],
  }
}
