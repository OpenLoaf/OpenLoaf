'use client'

import * as React from 'react'
import { createWidgetSDK } from '@tenas-ai/widget-sdk'
import type { WidgetSDK, WidgetHostCallbacks, WidgetTheme } from '@tenas-ai/widget-sdk'
import { trpcClient } from '@/utils/trpc'
import { useLoadDynamicComponent } from './useLoadDynamicComponent'

interface DynamicWidgetRendererProps {
  widgetId: string
  /** Callback when the widget emits a custom event. */
  onEmit?: (event: string, payload?: unknown) => void
  /** Callback when the widget requests navigation. */
  onNavigate?: (target: string, params?: Record<string, unknown>) => void
  /** Callback when the widget triggers a chat message. */
  onChat?: (message: string) => void
  /** Callback when the widget requests opening a tab. */
  onOpenTab?: (type: string, params?: Record<string, unknown>) => void
}

/** Detect current theme from the document root. */
function detectTheme(): WidgetTheme {
  if (typeof document === 'undefined') return { mode: 'dark' }
  return {
    mode: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  }
}

/** Error boundary for dynamic widget rendering. */
class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode; widgetId: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full items-center justify-center p-4 text-center">
          <div className="text-xs text-destructive">
            Widget 渲染错误: {this.state.error.message}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function DynamicWidgetRenderer({
  widgetId,
  onEmit,
  onNavigate,
  onChat,
  onOpenTab,
}: DynamicWidgetRendererProps) {
  const { Component, loading, error } = useLoadDynamicComponent(widgetId)

  // Create a stable SDK instance for this widget.
  const sdk = React.useMemo<WidgetSDK>(() => {
    const themeListeners = new Set<(theme: WidgetTheme) => void>()

    // Observe theme changes via MutationObserver on <html> class.
    if (typeof document !== 'undefined') {
      const observer = new MutationObserver(() => {
        const theme = detectTheme()
        themeListeners.forEach((cb) => cb(theme))
      })
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })
    }

    const host: WidgetHostCallbacks = {
      callFunction: async (functionName, params) => {
        const result = await trpcClient.dynamicWidget.callFunction.mutate({
          widgetId,
          functionName,
          params,
        })
        if (!result.ok) throw new Error(result.error || 'Function call failed')
        return result.data
      },
      getTheme: detectTheme,
      onThemeChange: (callback) => {
        themeListeners.add(callback)
        return () => themeListeners.delete(callback)
      },
      emit: (event, payload) => onEmit?.(event, payload),
      navigate: (target, params) => onNavigate?.(target, params),
      chat: (message) => onChat?.(message),
      openTab: (type, params) => onOpenTab?.(type, params),
    }

    return createWidgetSDK(host)
  }, [widgetId, onEmit, onNavigate, onChat, onOpenTab])

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <div className="text-xs">加载中...</div>
      </div>
    )
  }

  if (error || !Component) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4 text-center">
        <div className="text-xs text-destructive">{error || '组件加载失败'}</div>
      </div>
    )
  }

  return (
    <WidgetErrorBoundary widgetId={widgetId}>
      <Component sdk={sdk} />
    </WidgetErrorBoundary>
  )
}
