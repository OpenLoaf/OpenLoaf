/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

/** Theme information from the host application. */
export interface WidgetTheme {
  /** Current theme mode. */
  mode: 'light' | 'dark'
}

/** SDK interface injected into widget components via props. */
export interface WidgetSDK {
  /** Call a server-side function defined in the widget's package.json scripts. */
  call: <T = unknown>(functionName: string, params?: Record<string, unknown>) => Promise<T>
  /** Get the current theme. */
  getTheme: () => WidgetTheme
  /** Subscribe to theme changes. Returns an unsubscribe function. */
  onThemeChange: (callback: (theme: WidgetTheme) => void) => () => void
  /** Emit a custom event to the host application. */
  emit: (event: string, payload?: unknown) => void
  /** Navigate to a target in the host application. */
  navigate: (target: string, params?: Record<string, unknown>) => void
  /** Trigger an AI chat message. */
  chat: (message: string) => void
  /** Open a tab in the host application. */
  openTab: (type: string, params?: Record<string, unknown>) => void
}

/** Props passed to every dynamic widget component. */
export interface WidgetProps {
  /** The widget SDK instance for interacting with the host. */
  sdk: WidgetSDK
}

/** Callbacks provided by the host to power the SDK bridge. */
export interface WidgetHostCallbacks {
  callFunction: (functionName: string, params?: Record<string, unknown>) => Promise<unknown>
  getTheme: () => WidgetTheme
  onThemeChange: (callback: (theme: WidgetTheme) => void) => () => void
  emit: (event: string, payload?: unknown) => void
  navigate: (target: string, params?: Record<string, unknown>) => void
  chat: (message: string) => void
  openTab: (type: string, params?: Record<string, unknown>) => void
}

/** Create a WidgetSDK instance backed by host callbacks. */
export function createWidgetSDK(host: WidgetHostCallbacks): WidgetSDK {
  return {
    call: host.callFunction as WidgetSDK['call'],
    getTheme: host.getTheme,
    onThemeChange: host.onThemeChange,
    emit: host.emit,
    navigate: host.navigate,
    chat: host.chat,
    openTab: host.openTab,
  }
}

// ---------------------------------------------------------------------------
// Runtime hooks
// ---------------------------------------------------------------------------

interface UseWidgetDataOptions {
  /** 自动轮询间隔（ms），0 或 undefined 表示不轮询 */
  refreshInterval?: number
  /** 传给 sdk.call 的额外参数 */
  params?: Record<string, unknown>
}

interface UseWidgetDataResult<T> {
  data: T | undefined
  loading: boolean
  error: string | undefined
  refetch: () => void
}

/** 封装 sdk.call + loading/error/refetch + 自动轮询 */
export function useWidgetData<T = unknown>(
  sdk: WidgetSDK,
  functionName: string,
  options?: UseWidgetDataOptions,
): UseWidgetDataResult<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | undefined>(undefined)
  const mountedRef = useRef(true)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(undefined)
      const result = await sdk.call<T>(functionName, options?.params)
      if (mountedRef.current) setData(result)
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [sdk, functionName, options?.params])

  useEffect(() => {
    mountedRef.current = true
    fetchData()
    const interval = options?.refreshInterval
    if (interval && interval > 0) {
      const timer = setInterval(fetchData, interval)
      return () => {
        mountedRef.current = false
        clearInterval(timer)
      }
    }
    return () => {
      mountedRef.current = false
    }
  }, [fetchData, options?.refreshInterval])

  return { data, loading, error, refetch: fetchData }
}

/** 基于 useSyncExternalStore 订阅主题变化 */
export function useWidgetTheme(sdk: WidgetSDK): WidgetTheme {
  const subscribe = useCallback(
    (onStoreChange: () => void) => sdk.onThemeChange(onStoreChange),
    [sdk],
  )
  const getSnapshot = useCallback(() => sdk.getTheme(), [sdk])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
