/**
 * PageProbeHarness — 通用页面测试容器。
 *
 * 为非 chat 类页面（如技能市场、设置面板等）提供最小可用的 providers 集合：
 * - QueryClientProvider（复用 app 单例，保证 tRPC hooks 正常工作）
 * - ThemeProvider（next-themes，默认 dark）
 * - TooltipProvider（shadcn/radix 依赖）
 * - TabActiveProvider（某些组件读取 active 状态）
 * - i18n（通过副作用导入 `@/i18n`）
 *
 * 通过 data-probe-* 协议对外暴露状态，供 probe-helpers 读取：
 * - data-probe-status: 'loading' | 'ready' | 'error'
 * - data-probe-result-json（隐藏 script 标签，存 JSON 快照）
 */
import * as React from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@openloaf/ui/tooltip'
import { ThemeProvider } from '@/components/ThemeProvider'
import { TabActiveProvider } from '@/components/layout/TabActiveContext'
import { queryClient } from '@/utils/trpc'

// ── i18n ──
import '@/i18n/index'
// ── 测试专用样式 ──
import './probe.css'

export type PageProbeStatus = 'loading' | 'ready' | 'error'

export type PageProbeResult = {
  /** 启动时间戳（ISO） */
  startedAt: string
  /** 到达 ready 的耗时毫秒 */
  elapsedMs: number
  /** 最终状态 */
  status: PageProbeStatus
  /** 错误信息（status=error 时） */
  error?: string
  /** 业务自定义负载（由 children 通过 reportReady 写入） */
  payload?: Record<string, unknown>
}

export type PageProbeContextValue = {
  /** 报告页面已就绪（会把 data-probe-status 切到 ready） */
  reportReady: (payload?: Record<string, unknown>) => void
  /** 报告页面出错 */
  reportError: (error: string) => void
  /** 更新 payload 但不改 status（用于中间量化指标） */
  updatePayload: (patch: Record<string, unknown>) => void
}

const PageProbeContext = React.createContext<PageProbeContextValue | null>(null)

/** 子组件通过 usePageProbe 报告状态（可选）。 */
export function usePageProbe(): PageProbeContextValue {
  const ctx = React.useContext(PageProbeContext)
  if (!ctx) {
    throw new Error('usePageProbe must be used within <PageProbeHarness />')
  }
  return ctx
}

export type PageProbeHarnessProps = {
  /** 要渲染的页面内容 */
  children: React.ReactNode
  /** 可选的后端地址（写入 dataset 方便调试） */
  serverUrl?: string
  /** harness 外层 className */
  className?: string
  /** 挂载完即视为 ready（无需子组件主动 reportReady），默认 false */
  autoReady?: boolean
  /** 完成/出错时回调 */
  onComplete?: (result: PageProbeResult) => void
}

function PageProbeInner({
  children,
  serverUrl,
  className,
  autoReady = false,
  onComplete,
}: PageProbeHarnessProps) {
  const [status, setStatus] = React.useState<PageProbeStatus>('loading')
  const [error, setError] = React.useState<string | undefined>(undefined)
  const [payload, setPayload] = React.useState<Record<string, unknown>>({})

  // 逻辑：test 环境下拦截 fetch 做两件事：
  //
  // 1) 反代前缀兜底：@openloaf-saas/sdk 的 dist bundle 是混淆过的，用户传入的
  //    fetcher 在某些打包情况下不会被调用，导致 SDK 直接 `fetch('<server>/api/...')`
  //    而绕过 SaaS 反代（`/api/saas/raw`）。桌面端实际 runtime 正常，但
  //    vitest browser 里打包路径不同，复现不了。test 层兜底重写一次前缀，
  //    确保 harness 真能命中 Server 的反代白名单路径。
  // 2) 网络错误抓取：把非 2xx / 异常请求写到 window.__probeNetworkErrors，
  //    失败时附到 payload，避免 UI 层模糊文案（"List failed"）掩盖 root cause。
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as {
      __probeNetworkErrors?: Array<{ url: string; status: number; body?: string; message?: string }>
      __probeFetchPatched?: boolean
    }
    if (w.__probeFetchPatched) return
    w.__probeFetchPatched = true
    w.__probeNetworkErrors = []

    const origFetch = window.fetch.bind(window)
    const proxyMount = '/api/saas/raw'
    const normServer = serverUrl ? serverUrl.replace(/\/$/, '') : ''

    function maybeInjectProxy(rawUrl: string): string {
      if (!normServer) return rawUrl
      try {
        const u = new URL(rawUrl)
        if (u.origin !== normServer) return rawUrl
        if (u.pathname.startsWith(proxyMount)) return rawUrl
        if (!u.pathname.startsWith('/api/')) return rawUrl
        u.pathname = `${proxyMount}${u.pathname}`
        return u.toString()
      } catch {
        return rawUrl
      }
    }

    function shouldInjectClientHeader(url: string): boolean {
      if (!normServer) return false
      try {
        const u = new URL(url)
        if (u.origin !== normServer) return false
        // strictClientGuard 守护 /api/saas/raw/* 和 /auth/*；tRPC 走 /trpc/* 也受 aiRouteGuard/保护
        return (
          u.pathname.startsWith('/api/saas/raw') ||
          u.pathname.startsWith('/auth/') ||
          u.pathname.startsWith('/trpc/') ||
          u.pathname.startsWith('/ai/')
        )
      } catch {
        return false
      }
    }

    window.fetch = async (input, init) => {
      const rawUrl = typeof input === 'string'
        ? input
        : input instanceof URL ? input.toString() : (input as Request).url
      const finalUrl = maybeInjectProxy(rawUrl)

      // 补齐 X-OpenLoaf-Client header（SDK 在 dev bundle 下有时吞掉 options.headers）
      let finalInit = init
      if (shouldInjectClientHeader(finalUrl)) {
        const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
        if (!headers.has('X-OpenLoaf-Client')) headers.set('X-OpenLoaf-Client', '1')
        finalInit = { ...(init ?? {}), headers }
      }

      const finalInput: RequestInfo = typeof input === 'string' || input instanceof URL
        ? finalUrl
        : new Request(finalUrl, input as Request)

      try {
        const res = await origFetch(finalInput, finalInit)
        if (!res.ok) {
          let body: string | undefined
          try { body = (await res.clone().text()).slice(0, 500) } catch {}
          w.__probeNetworkErrors?.push({ url: finalUrl, status: res.status, body })
        }
        return res
      } catch (err) {
        w.__probeNetworkErrors?.push({
          url: finalUrl, status: 0,
          message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        })
        throw err
      }
    }
  }, [serverUrl])
  const startedAtRef = React.useRef<string>('')
  const startTimeRef = React.useRef<number>(0)
  const completedRef = React.useRef(false)

  // ── 启动时间戳 ──
  if (!startedAtRef.current) {
    startedAtRef.current = new Date().toISOString()
    startTimeRef.current = Date.now()
  }

  // ── autoReady：一上来就 ready ──
  React.useEffect(() => {
    if (!autoReady) return
    setStatus('ready')
  }, [autoReady])

  // ── 完成回调 ──
  React.useEffect(() => {
    if (status === 'loading') return
    if (completedRef.current) return
    completedRef.current = true
    const result: PageProbeResult = {
      startedAt: startedAtRef.current,
      elapsedMs: Date.now() - startTimeRef.current,
      status,
      ...(error ? { error } : {}),
      payload,
    }
    writeResultToDOM(result)
    onComplete?.(result)
  }, [status, error, payload, onComplete])

  // ── payload 变化时同步写到 DOM（用于中间快照）──
  React.useEffect(() => {
    if (status === 'loading') return
    const result: PageProbeResult = {
      startedAt: startedAtRef.current,
      elapsedMs: Date.now() - startTimeRef.current,
      status,
      ...(error ? { error } : {}),
      payload,
    }
    writeResultToDOM(result)
  }, [payload, status, error])

  const ctx = React.useMemo<PageProbeContextValue>(
    () => ({
      reportReady: (newPayload) => {
        if (newPayload) setPayload((p) => ({ ...p, ...newPayload }))
        setStatus('ready')
      },
      reportError: (errMsg) => {
        if (typeof window !== 'undefined') {
          const w = window as unknown as {
            __probeNetworkErrors?: Array<{ url: string; status: number; body?: string; message?: string }>
          }
          const errors = w.__probeNetworkErrors ?? []
          if (errors.length > 0) {
            setPayload((p) => ({ ...p, networkErrors: errors }))
          }
        }
        setError(errMsg)
        setStatus('error')
      },
      updatePayload: (patch) => {
        setPayload((p) => ({ ...p, ...patch }))
      },
    }),
    [],
  )

  return (
    <PageProbeContext.Provider value={ctx}>
      <div
        className={className}
        data-testid="page-probe-harness"
        data-probe-status={status}
        data-probe-server-url={serverUrl ?? ''}
        style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}
      >
        {/* 状态栏 */}
        <div
          data-testid="probe-status-bar"
          style={{
            padding: '8px 16px',
            fontSize: '12px',
            fontFamily: 'monospace',
            borderBottom: '1px solid var(--border, #e5e7eb)',
            display: 'flex',
            gap: '16px',
            flexShrink: 0,
            background: 'var(--muted, #f8fafc)',
          }}
        >
          <span>Status: <strong data-testid="probe-status">{status}</strong></span>
          {serverUrl && <span>Server: <code style={{ fontSize: '11px' }}>{serverUrl}</code></span>}
          {error && (
            <span style={{ color: 'var(--destructive, #dc2626)' }}>Error: {error}</span>
          )}
        </div>

        {/* ProbeResult JSON（隐藏，供测试读取） */}
        <script
          id="probe-result-json"
          type="application/json"
          data-testid="probe-result-json"
          suppressHydrationWarning
        />

        {/* 页面内容 */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {children}
        </div>
      </div>
    </PageProbeContext.Provider>
  )
}

function writeResultToDOM(result: PageProbeResult) {
  const el = document.getElementById('probe-result-json')
  if (el) el.textContent = JSON.stringify(result)
}

/**
 * 通用页面测试容器。渲染任意子组件，提供 providers 和状态协议。
 *
 * @example
 * ```tsx
 * render(
 *   <PageProbeHarness autoReady>
 *     <SkillMarketplace />
 *   </PageProbeHarness>
 * )
 * ```
 */
export default function PageProbeHarness(props: PageProbeHarnessProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={500}>
          <TabActiveProvider active={true}>
            <PageProbeInner {...props} />
          </TabActiveProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
