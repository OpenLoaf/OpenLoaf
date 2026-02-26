'use client'

import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { createWidgetSDK } from '@openloaf/widget-sdk'
import type { WidgetSDK, WidgetHostCallbacks, WidgetTheme } from '@openloaf/widget-sdk'
import { trpc, trpcClient } from '@/utils/trpc'
import { useLoadDynamicComponent } from './useLoadDynamicComponent'

const APPROVED_WIDGETS_KEY = 'openloaf:approved-dynamic-widgets'

/** Read approved widget IDs from localStorage. */
function getApprovedWidgets(): Set<string> {
  try {
    const raw = localStorage.getItem(APPROVED_WIDGETS_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set()
  }
}

/** Persist an approved widget ID to localStorage. */
function approveWidget(widgetId: string) {
  const approved = getApprovedWidgets()
  approved.add(widgetId)
  localStorage.setItem(APPROVED_WIDGETS_KEY, JSON.stringify([...approved]))
}

interface DynamicWidgetRendererProps {
  widgetId: string
  workspaceId: string
  projectId?: string
  onEmit?: (event: string, payload?: unknown) => void
  onNavigate?: (target: string, params?: Record<string, unknown>) => void
  onChat?: (message: string) => void
  onOpenTab?: (type: string, params?: Record<string, unknown>) => void
}

/** Detect current theme from the document root (stable reference). */
let cachedDesktopTheme: WidgetTheme | null = null
function detectTheme(): WidgetTheme {
  if (typeof document === 'undefined') {
    if (!cachedDesktopTheme || cachedDesktopTheme.mode !== 'dark') {
      cachedDesktopTheme = { mode: 'dark' }
    }
    return cachedDesktopTheme
  }
  const mode = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  if (!cachedDesktopTheme || cachedDesktopTheme.mode !== mode) {
    cachedDesktopTheme = { mode }
  }
  return cachedDesktopTheme
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

/** Inline approval prompt shown before first widget execution. */
function WidgetApprovalPrompt({
  scripts,
  onApprove,
}: {
  scripts?: Record<string, string>
  onApprove: () => void
}) {
  const scriptEntries = Object.entries(scripts || {})
  // 逻辑：使用 pointerDown 而非 click，避免桌面 tile 的长按进入编辑态
  // （320ms 后添加 pointer-events-none）导致 click 事件被吞掉。
  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      onApprove()
    },
    [onApprove],
  )
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-center">
      <div className="text-sm font-medium">启用此 Widget？</div>
      <div className="text-xs text-muted-foreground">
        该 Widget 将在服务端执行以下脚本：
      </div>
      {scriptEntries.length > 0 ? (
        <div className="w-full max-w-xs rounded-md border border-border bg-muted/30 p-2 text-left">
          {scriptEntries.map(([name, cmd]) => (
            <div key={name} className="truncate text-xs font-mono text-muted-foreground">
              <span className="text-foreground">{name}</span>: {cmd}
            </div>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="mt-1 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        onPointerDown={handlePointerDown}
      >
        确认启用
      </button>
    </div>
  )
}

export default function DynamicWidgetRenderer({
  widgetId,
  workspaceId,
  projectId,
  onEmit,
  onNavigate,
  onChat,
  onOpenTab,
}: DynamicWidgetRendererProps) {
  const { Component, loading, error } = useLoadDynamicComponent(workspaceId, projectId, widgetId)
  const [approved, setApproved] = React.useState(() => getApprovedWidgets().has(widgetId))

  // 获取 widget 元数据（用于确认对话框展示脚本列表）。
  const metaQuery = useQuery({
    ...trpc.dynamicWidget.get.queryOptions({ workspaceId, projectId, widgetId }),
    enabled: !approved,
  })

  const handleApprove = React.useCallback(() => {
    try {
      approveWidget(widgetId)
    } catch {
      // localStorage 写入失败不阻塞审批
    }
    setApproved(true)
  }, [widgetId])

  // Create a stable SDK instance for this widget.
  const sdk = React.useMemo<WidgetSDK>(() => {
    const themeListeners = new Set<(theme: WidgetTheme) => void>()

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
          workspaceId,
          projectId,
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

  // 未确认时展示确认提示。
  if (!approved) {
    return (
      <WidgetApprovalPrompt
        scripts={metaQuery.data?.scripts ?? undefined}
        onApprove={handleApprove}
      />
    )
  }

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <div className="text-xs">加载中...</div>
        </div>
      </div>
    )
  }

  if (error || !Component) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
        <div className="text-xs text-destructive">{error || '组件加载失败'}</div>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
          onClick={() => window.location.reload()}
        >
          重试
        </button>
      </div>
    )
  }

  return (
    <WidgetErrorBoundary widgetId={widgetId}>
      <Component sdk={sdk} />
    </WidgetErrorBoundary>
  )
}
