/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
'use client'

import * as React from 'react'
import { trpcClient } from '@/utils/trpc'
import {
  ensureExternalsRegistered,
  patchBareImports,
} from '@/components/desktop/dynamic-widgets/widget-externals'
import type { AnyToolPart } from './tool-utils'

/** 逻辑：尝试从 tool output 解析 JSON */
export function parseOutputJson(
  part: AnyToolPart,
): Record<string, unknown> | null {
  try {
    const output =
      typeof (part as any).output === 'string'
        ? (part as any).output
        : typeof (part as any).result === 'string'
          ? (part as any).result
          : null
    if (!output) return null
    return JSON.parse(output)
  } catch {
    return null
  }
}

/** Error boundary for widget rendering */
export class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode; onError: (err: Error) => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    this.props.onError(error)
  }

  render() {
    if (this.state.error) return null
    return this.props.children
  }
}

/** 逻辑：编译并加载 widget 组件（带 import 重写） */
export const widgetModuleCache = new Map<string, React.ComponentType<any>>()

export async function compileAndLoadWidget(
  workspaceId: string,
  projectId: string | undefined,
  widgetId: string,
): Promise<React.ComponentType<any>> {
  const cacheKey = `${workspaceId}:${projectId ?? ''}:${widgetId}`
  const cached = widgetModuleCache.get(cacheKey)
  if (cached) return cached

  ensureExternalsRegistered()

  const result = await trpcClient.dynamicWidget.compile.query({
    workspaceId,
    projectId,
    widgetId,
  })
  if (!result.ok || !result.code) {
    throw new Error(result.error || '编译失败')
  }

  const patchedCode = patchBareImports(result.code)
  const blob = new Blob([patchedCode], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)

  try {
    const mod = await import(/* webpackIgnore: true */ url)
    const Component = mod.default as React.ComponentType<any>
    if (typeof Component !== 'function') {
      throw new Error('Widget 模块未导出默认 React 组件')
    }
    widgetModuleCache.set(cacheKey, Component)
    return Component
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** 逻辑：widget 渲染完成后的实际渲染区域 */
export function WidgetPreview({
  widgetId,
  workspaceId,
  projectId,
}: {
  widgetId: string
  workspaceId: string
  projectId?: string
}) {
  const [Component, setComponent] = React.useState<React.ComponentType<any> | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [renderError, setRenderError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    compileAndLoadWidget(workspaceId, projectId, widgetId)
      .then((mod) => {
        if (!cancelled) {
          setComponent(() => mod)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [workspaceId, projectId, widgetId])

  // 逻辑：创建最小化 SDK（chat 上下文不需要完整 desktop SDK）
  // 注意：getTheme 必须返回稳定引用，否则 useSyncExternalStore 会无限循环
  const sdk = React.useMemo(() => {
    let cachedTheme: { mode: 'dark' | 'light' } | null = null

    const detectTheme = () => {
      const mode = (typeof document !== 'undefined' &&
        document.documentElement.classList.contains('dark')
        ? 'dark'
        : 'light') as 'dark' | 'light'
      if (!cachedTheme || cachedTheme.mode !== mode) {
        cachedTheme = { mode }
      }
      return cachedTheme
    }

    return {
      call: async () => {
        throw new Error('call not available in chat preview')
      },
      callFunction: async () => {
        throw new Error('callFunction not available in chat preview')
      },
      getTheme: detectTheme,
      onThemeChange: (cb: (theme: { mode: 'dark' | 'light' }) => void) => {
        if (typeof document === 'undefined') return () => {}
        const observer = new MutationObserver(() => cb(detectTheme()))
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class'],
        })
        return () => observer.disconnect()
      },
      emit: () => {},
      navigate: () => {},
      chat: () => {},
      openTab: () => {},
    }
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          编译中...
        </div>
      </div>
    )
  }

  if (error || renderError) {
    return (
      <div className="px-3 py-2 text-xs text-destructive">
        渲染失败: {error || renderError}
      </div>
    )
  }

  if (!Component) return null

  return (
    <WidgetErrorBoundary onError={(err) => setRenderError(err.message)}>
      <div className="flex min-h-[100px] items-center justify-center p-4">
        <Component sdk={sdk as any} />
      </div>
    </WidgetErrorBoundary>
  )
}

/** widget-check 去重：同一 widgetId 只有最新的 check 显示完整预览 */
export const latestCheckByWidgetId = new Map<string, string>()
