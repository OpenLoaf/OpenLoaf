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
import { cn } from '@/lib/utils'
import { FolderOpen, LayoutGrid, CheckCircle2, XCircle } from 'lucide-react'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { useTabs } from '@/hooks/use-tabs'
import { useWorkspace } from '@/components/workspace/workspaceContext'
import {
  DESKTOP_WIDGET_SELECTED_EVENT,
  type DesktopWidgetSelectedDetail,
} from '@/components/desktop/DesktopWidgetLibraryPanel'
import { useChatSession } from '../../context'
import {
  isToolStreaming,
  normalizeToolInput,
  asPlainObject,
  type AnyToolPart,
} from './shared/tool-utils'
import { TrafficLights } from '@openloaf/ui/traffic-lights'
import {
  WidgetPreview,
  parseOutputJson,
  widgetModuleCache,
  latestCheckByWidgetId,
} from './shared/widget-shared'

export default function WidgetCheckTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { tabId, workspaceId, projectId } = useChatSession()
  const { workspace } = useWorkspace()
  const pushStackItem = useTabRuntime((s) => s.pushStackItem)
  const input = asPlainObject(normalizeToolInput(part.input))

  const outputJson = parseOutputJson(part)
  const ok = outputJson?.ok === true
  const widgetId = (input?.widgetId as string) || (outputJson?.widgetId as string) || ''
  const widgetName = (outputJson?.widgetName as string) || widgetId
  const errors = (outputJson?.errors as string[]) || []

  const toolCallId = typeof part.toolCallId === 'string' ? part.toolCallId : ''

  // 逻辑：去重 — 同一 widgetId 只有最新 check 显示完整预览
  React.useEffect(() => {
    if (widgetId && toolCallId) {
      latestCheckByWidgetId.set(widgetId, toolCallId)
    }
  }, [widgetId, toolCallId])

  const isLatest = latestCheckByWidgetId.get(widgetId) === toolCallId

  // 逻辑：清除缓存确保显示最新编译结果
  React.useEffect(() => {
    if (ok && workspaceId && widgetId) {
      const cacheKey = `${workspaceId}:${projectId ?? ''}:${widgetId}`
      widgetModuleCache.delete(cacheKey)
    }
  }, [ok, workspaceId, projectId, widgetId])

  const isStreaming = isToolStreaming(part)
  const hasError =
    typeof part.errorText === 'string' && part.errorText.trim().length > 0

  const windowState = hasError || (!ok && part.state === 'output-available')
    ? ('error' as const)
    : isStreaming
      ? ('running' as const)
      : ok
        ? ('success' as const)
        : ('idle' as const)

  const canRender =
    part.state === 'output-available' && ok && Boolean(workspaceId) && isLatest

  const handleOpenWidget = () => {
    if (!tabId || !workspaceId || !widgetId) return
    const baseRootUri = projectId
      ? workspace?.projects?.[projectId]
      : workspace?.rootUri
    if (!baseRootUri) return
    const widgetFolderUri = `${baseRootUri.replace(/\/$/, '')}/.openloaf/dynamic-widgets/${widgetId}`
    const mainFileUri = `${widgetFolderUri}/widget.tsx`
    pushStackItem(tabId, {
      id: `widget:${widgetId}`,
      sourceKey: `widget:${widgetId}`,
      component: 'folder-tree-preview',
      title: `Widget · ${widgetId}`,
      params: {
        rootUri: widgetFolderUri,
        currentUri: mainFileUri,
        currentEntryKind: 'file',
        projectId,
        projectTitle: widgetId,
        viewerRootUri: baseRootUri,
      },
    })
  }

  const handleAddToDesktop = () => {
    const runtimeByTabId = useTabRuntime.getState().runtimeByTabId
    let desktopTabId: string | null = null
    for (const [tid, runtime] of Object.entries(runtimeByTabId)) {
      if (runtime?.base?.component === 'workspace-desktop') {
        desktopTabId = tid
        break
      }
    }
    if (!desktopTabId) return

    useTabs.getState().setActiveTab(desktopTabId)
    const targetTabId = desktopTabId
    requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent<DesktopWidgetSelectedDetail>(
          DESKTOP_WIDGET_SELECTED_EVENT,
          {
            detail: {
              tabId: targetTabId,
              widgetKey: 'dynamic',
              title: widgetName,
              dynamicWidgetId: widgetId,
              dynamicProjectId: projectId,
            },
          },
        ),
      )
    })
  }

  if (!widgetId && !isStreaming) return null

  // 逻辑：非最新 check 渲染紧凑模式
  if (part.state === 'output-available' && !isLatest) {
    return (
      <div className={cn('w-full min-w-0', className)}>
        <div className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs text-muted-foreground">
          {ok ? (
            <CheckCircle2 className="size-3.5 text-green-500" />
          ) : (
            <XCircle className="size-3.5 text-red-500" />
          )}
          <span className="font-mono">{widgetName}</span>
          <span>{ok ? '编译通过' : `${errors.length} 个错误`}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div className="overflow-hidden rounded-lg border bg-card text-card-foreground">
        {/* 标题栏 */}
        <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2">
          <TrafficLights state={windowState} />
          <span className="flex-1 truncate text-[10px] text-muted-foreground/60">
            widget-check
          </span>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {widgetName}
          </span>
        </div>

        {/* 流式占位 */}
        {isStreaming ? (
          <div className="flex items-center justify-center py-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              验证中...
            </div>
          </div>
        ) : null}

        {/* 错误列表 */}
        {!ok && errors.length > 0 ? (
          <div className="space-y-1 px-3 py-2">
            {errors.map((err, i) => (
              <div key={i} className="text-xs text-destructive">
                {err}
              </div>
            ))}
          </div>
        ) : null}

        {/* Widget 预览 */}
        {canRender && workspaceId ? (
          <WidgetPreview
            widgetId={widgetId}
            workspaceId={workspaceId}
            projectId={projectId}
          />
        ) : null}

        {/* 操作按钮 */}
        {canRender ? (
          <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-500/20 dark:text-sky-400"
              onClick={handleOpenWidget}
            >
              <FolderOpen className="size-3.5" />
              打开文件夹
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-500/10 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-500/20 dark:text-violet-400"
              onClick={handleAddToDesktop}
            >
              <LayoutGrid className="size-3.5" />
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
