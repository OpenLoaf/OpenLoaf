'use client'

import * as React from 'react'
import { trpcClient } from '@/utils/trpc'
import type { DynamicWidgetComponent } from './types'
import { ensureExternalsRegistered, patchBareImports } from './widget-externals'

/** Cache compiled widget modules to avoid re-compilation. */
const moduleCache = new Map<string, DynamicWidgetComponent>()
/** Track in-flight compilation promises to deduplicate requests. */
const pendingLoads = new Map<string, Promise<DynamicWidgetComponent>>()

/**
 * Load a dynamic widget component from the server via esbuild compilation.
 *
 * The server compiles the widget's .tsx file into an ESM bundle. We create a
 * Blob URL and use dynamic import() to load it as a module.
 */
async function loadWidgetModule(
  workspaceId: string,
  projectId: string | undefined,
  widgetId: string,
): Promise<DynamicWidgetComponent> {
  const cacheKey = `${workspaceId}:${projectId ?? ''}:${widgetId}`
  const cached = moduleCache.get(cacheKey)
  if (cached) return cached

  // Deduplicate concurrent loads for the same widget.
  const pending = pendingLoads.get(cacheKey)
  if (pending) return pending

  const loadPromise = (async () => {
    const result = await trpcClient.dynamicWidget.compile.query({ workspaceId, projectId, widgetId })
    if (!result.ok || !result.code) {
      throw new Error(result.error || 'Compilation failed')
    }

    // 逻辑：注册外部依赖并重写裸模块标识符，使 Blob URL import 能正确解析。
    ensureExternalsRegistered()
    const patchedCode = patchBareImports(result.code)

    // Create a Blob URL from the patched ESM code.
    const blob = new Blob([patchedCode], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)

    try {
      const mod = await import(/* webpackIgnore: true */ url)
      const Component = mod.default as DynamicWidgetComponent
      if (typeof Component !== 'function') {
        throw new Error('Widget module does not export a default React component')
      }
      moduleCache.set(cacheKey, Component)
      return Component
    } finally {
      URL.revokeObjectURL(url)
    }
  })()

  pendingLoads.set(cacheKey, loadPromise)
  try {
    return await loadPromise
  } finally {
    pendingLoads.delete(cacheKey)
  }
}

/** Invalidate the cached module for a widget (e.g. after code update). */
export function invalidateWidgetCache(widgetId: string) {
  moduleCache.delete(widgetId)
}

interface UseLoadDynamicComponentResult {
  Component: DynamicWidgetComponent | null
  loading: boolean
  error: string | null
}

/**
 * React hook to load a dynamic widget component by its ID.
 */
export function useLoadDynamicComponent(
  workspaceId: string | undefined,
  projectId: string | undefined,
  widgetId: string | undefined,
): UseLoadDynamicComponentResult {
  const [Component, setComponent] = React.useState<DynamicWidgetComponent | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!workspaceId || !widgetId) {
      setLoading(false)
      setError('No widget ID or workspace ID provided')
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    loadWidgetModule(workspaceId, projectId, widgetId)
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

    return () => {
      cancelled = true
    }
  }, [workspaceId, projectId, widgetId])

  return { Component, loading, error }
}
