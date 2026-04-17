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
    try {
      const res = await origFetch(input as RequestInfo, init)
      if (state.network.length < MAX_NETWORK) {
        state.network.push({
          ts: start - installedAt,
          method, url,
          status: res.status,
          durationMs: Date.now() - start,
          ok: res.ok,
          contentType: res.headers.get('content-type') ?? undefined,
        })
      }
      return res
    } catch (err) {
      if (state.network.length < MAX_NETWORK) {
        state.network.push({
          ts: start - installedAt,
          method, url,
          status: null,
          durationMs: Date.now() - start,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
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
