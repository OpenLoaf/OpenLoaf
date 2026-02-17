'use client'

import * as React from 'react'
import * as ReactJSXRuntime from 'react/jsx-runtime'
import { cn } from '@/lib/utils'
import { trpcClient } from '@/utils/trpc'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { DESKTOP_WIDGET_SELECTED_EVENT, type DesktopWidgetSelectedDetail } from '@/components/desktop/DesktopWidgetLibraryPanel'
import { useChatSession } from '../../context'
import {
  asPlainObject,
  getApprovalId,
  getToolName,
  isApprovalPending,
  isToolStreaming,
  normalizeToolInput,
  type AnyToolPart,
} from './shared/tool-utils'
import ToolApprovalActions from './shared/ToolApprovalActions'

/** macOS 风格窗口标题栏圆点 */
function TrafficLights({ state }: { state?: 'idle' | 'running' | 'success' | 'error' }) {
  const colors = {
    idle: { r: 'bg-red-400', y: 'bg-yellow-400', g: 'bg-green-400' },
    running: { r: 'bg-red-400', y: 'bg-yellow-400', g: 'bg-green-400 animate-pulse' },
    success: { r: 'bg-red-400', y: 'bg-yellow-400', g: 'bg-green-500' },
    error: { r: 'bg-red-500', y: 'bg-yellow-400', g: 'bg-neutral-400' },
  }
  const c = colors[state ?? 'idle']
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-full', c.r)} />
      <span className={cn('size-2.5 rounded-full', c.y)} />
      <span className={cn('size-2.5 rounded-full', c.g)} />
    </div>
  )
}

/** Error boundary for widget rendering */
class WidgetErrorBoundary extends React.Component<
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

/** 逻辑：注册外部依赖到全局，供 Blob URL shim 模块访问 */
const EXTERNALS_KEY = '__TENAS_WIDGET_EXTERNALS__'

function ensureExternalsRegistered() {
  if (typeof window === 'undefined') return
  if ((window as any)[EXTERNALS_KEY]) return
  ;(window as any)[EXTERNALS_KEY] = {
    'react': React,
    'react/jsx-runtime': ReactJSXRuntime,
    'react-dom': React, // 逻辑：widget 一般不直接用 react-dom，给个 fallback
  }
}

/** 逻辑：为外部依赖创建 Blob URL shim，浏览器可以 import 这些 URL */
const shimUrlCache = new Map<string, string>()

function getShimUrl(moduleName: string): string {
  const cached = shimUrlCache.get(moduleName)
  if (cached) return cached

  // 逻辑：用命名导出的方式，直接列出已知导出
  const shimCode = moduleName === 'react/jsx-runtime'
    ? `const m = window['${EXTERNALS_KEY}']['${moduleName}'];
export const jsx = m.jsx;
export const jsxs = m.jsxs;
export const jsxDEV = m.jsxDEV || m.jsx;
export const Fragment = m.Fragment;
export default m;`
    : moduleName === 'react'
      ? `const m = window['${EXTERNALS_KEY}']['${moduleName}'];
export default m;
export const useState = m.useState;
export const useEffect = m.useEffect;
export const useCallback = m.useCallback;
export const useMemo = m.useMemo;
export const useRef = m.useRef;
export const useContext = m.useContext;
export const useReducer = m.useReducer;
export const useId = m.useId;
export const createContext = m.createContext;
export const createElement = m.createElement;
export const Fragment = m.Fragment;
export const forwardRef = m.forwardRef;
export const memo = m.memo;
export const lazy = m.lazy;
export const Suspense = m.Suspense;
export const Children = m.Children;
export const cloneElement = m.cloneElement;
export const isValidElement = m.isValidElement;
export const startTransition = m.startTransition;
export const useTransition = m.useTransition;
export const useDeferredValue = m.useDeferredValue;
export const useSyncExternalStore = m.useSyncExternalStore;
export const useInsertionEffect = m.useInsertionEffect;
export const useLayoutEffect = m.useLayoutEffect;
export const useImperativeHandle = m.useImperativeHandle;
export const useDebugValue = m.useDebugValue;`
      : `const m = window['${EXTERNALS_KEY}']['${moduleName}'];
export default m;`

  const url = URL.createObjectURL(new Blob([shimCode], { type: 'text/javascript' }))
  shimUrlCache.set(moduleName, url)
  return url
}

/** 逻辑：替换编译产物中的裸模块标识符为 Blob URL */
function patchBareImports(code: string): string {
  const externals = ['react/jsx-runtime', 'react-dom', 'react', '@tenas-ai/widget-sdk']
  let patched = code
  for (const ext of externals) {
    const shimUrl = getShimUrl(ext)
    // 逻辑：匹配 from 'react' 和 from "react" 两种形式
    const escaped = ext.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')
    patched = patched.replace(
      new RegExp(`from\\s+['"]${escaped}['"]`, 'g'),
      `from '${shimUrl}'`,
    )
  }
  return patched
}

/** 逻辑：编译并加载 widget 组件（带 import 重写） */
const widgetModuleCache = new Map<string, React.ComponentType<any>>()

async function compileAndLoadWidget(
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
function WidgetPreview({
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
  const sdk = React.useMemo(() => {
    const detectTheme = () => ({
      mode: (typeof document !== 'undefined' &&
        document.documentElement.classList.contains('dark')
        ? 'dark'
        : 'light') as 'dark' | 'light',
    })

    return {
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

export default function WidgetTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { tabId, workspaceId, projectId } = useChatSession()
  const pushStackItem = useTabRuntime((s) => s.pushStackItem)
  const input = normalizeToolInput(part.input)
  const inputObj = asPlainObject(input)
  const widgetId =
    typeof inputObj?.widgetId === 'string' ? inputObj.widgetId : 'Widget'
  const widgetTsx =
    typeof inputObj?.widgetTsx === 'string' ? inputObj.widgetTsx : ''
  const isStreaming = isToolStreaming(part)
  const hasError =
    typeof part.errorText === 'string' && part.errorText.trim().length > 0
  const title = getToolName(part)
  const toolKind = typeof part.toolName === 'string' && part.toolName.trim()
    ? part.toolName
    : part.type?.startsWith('tool-')
      ? part.type.slice('tool-'.length)
      : part.type ?? ''
  const showToolKind = Boolean(toolKind) && title !== toolKind
  const approvalId = getApprovalId(part)
  const isPending = isApprovalPending(part)

  // 逻辑：工具执行完成且有 workspaceId 时可以渲染 widget
  const canRender =
    part.state === 'output-available' && Boolean(workspaceId) && !hasError

  const windowState = hasError
    ? 'error' as const
    : isStreaming
      ? 'running' as const
      : part.state === 'output-available'
        ? 'success' as const
        : 'idle' as const

  // 逻辑：打开组件 — 在 stack 中打开 widget 渲染面板
  const handleOpenWidget = () => {
    if (!tabId || !workspaceId) return
    pushStackItem(tabId, {
      id: `dynamic-widget:${widgetId}`,
      component: 'dynamic-widget-viewer',
      title: widgetId,
      params: { widgetId, workspaceId, projectId },
    })
  }

  // 逻辑：添加到 desktop — 通过事件桥接到桌面页面
  const handleAddToDesktop = () => {
    if (!tabId) return
    window.dispatchEvent(
      new CustomEvent<DesktopWidgetSelectedDetail>(
        DESKTOP_WIDGET_SELECTED_EVENT,
        {
          detail: {
            tabId,
            widgetKey: 'dynamic',
            title: widgetId,
            dynamicWidgetId: widgetId,
            dynamicProjectId: projectId,
          },
        },
      ),
    )
  }

  if (!widgetTsx && !isStreaming) return null

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div className="overflow-hidden rounded-lg border bg-card text-card-foreground">
        {/* macOS 风格标题栏 */}
        <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2">
          <TrafficLights state={windowState} />
          <span className="flex-1 truncate text-[10px] text-muted-foreground/60">
            {showToolKind ? toolKind : title}
          </span>
          {showToolKind ? (
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {title}
            </span>
          ) : null}
        </div>

        {/* 审批区域 */}
        {isPending && approvalId ? (
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-xs text-muted-foreground">确认生成此 Widget？</span>
            <ToolApprovalActions approvalId={approvalId} size="default" />
          </div>
        ) : null}

        {/* 逻辑：实际渲染 widget 组件 */}
        {canRender && workspaceId ? (
          <WidgetPreview
            widgetId={widgetId}
            workspaceId={workspaceId}
            projectId={projectId}
          />
        ) : null}

        {/* 流式生成中的占位 */}
        {isStreaming ? (
          <div className="flex items-center justify-center py-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              生成中...
            </div>
          </div>
        ) : null}

        {/* 操作按钮 */}
        {canRender ? (
          <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
            <button
              type="button"
              className="rounded px-2.5 py-1 text-xs text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950"
              onClick={handleOpenWidget}
            >
              打开组件
            </button>
            <button
              type="button"
              className="rounded px-2.5 py-1 text-xs text-violet-700 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-950"
              onClick={handleAddToDesktop}
            >
              添加到桌面
            </button>
          </div>
        ) : null}

        {/* 错误信息 */}
        {hasError ? (
          <div className="px-3 py-2 text-xs text-destructive">
            {part.errorText}
          </div>
        ) : null}
      </div>
    </div>
  )
}
