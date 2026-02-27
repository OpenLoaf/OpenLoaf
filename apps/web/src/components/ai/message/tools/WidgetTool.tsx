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
import { FolderOpen, LayoutGrid } from 'lucide-react'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { useTabs } from '@/hooks/use-tabs'
import { useWorkspace } from '@/components/workspace/workspaceContext'
import {
  DESKTOP_WIDGET_SELECTED_EVENT,
  type DesktopWidgetSelectedDetail,
} from '@/components/desktop/DesktopWidgetLibraryPanel'
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
import { TrafficLights } from '@openloaf/ui/traffic-lights'
import {
  WidgetPreview,
  parseOutputJson,
} from './shared/widget-shared'
import ToolApprovalActions from './shared/ToolApprovalActions'

export default function WidgetTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { tabId, workspaceId, projectId } = useChatSession()
  const { workspace } = useWorkspace()
  const pushStackItem = useTabRuntime((s) => s.pushStackItem)
  const input = normalizeToolInput(part.input)
  const inputObj = asPlainObject(input)

  // 逻辑：兼容新旧格式 — 新格式从 output JSON 读取 widgetId，旧格式从 input 读取
  let widgetId = 'Widget'
  let displayTitle = 'Widget'
  const outputJson = parseOutputJson(part)
  if (outputJson?.widgetId) {
    widgetId = outputJson.widgetId as string
    displayTitle = (outputJson.widgetName as string) || widgetId
  } else if (typeof inputObj?.widgetId === 'string') {
    widgetId = inputObj.widgetId
    displayTitle = widgetId
  }

  if (typeof inputObj?.widgetName === 'string') {
    displayTitle = inputObj.widgetName
  }

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

  const canRender =
    part.state === 'output-available' && Boolean(workspaceId) && !hasError

  const windowState = hasError
    ? 'error' as const
    : isStreaming
      ? 'running' as const
      : part.state === 'output-available'
        ? 'success' as const
        : 'idle' as const

  const handleOpenWidget = () => {
    if (!tabId || !workspaceId) return
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
              title: displayTitle,
              dynamicWidgetId: widgetId,
              dynamicProjectId: projectId,
            },
          },
        ),
      )
    })
  }

  const hasContent =
    typeof inputObj?.widgetName === 'string' ||
    typeof inputObj?.uiCode === 'string' ||
    typeof inputObj?.widgetTsx === 'string'
  if (!hasContent && !isStreaming) return null

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div className="overflow-hidden rounded-lg border bg-card text-card-foreground">
        {/* macOS 风格标题栏 */}
        <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2">
          <TrafficLights state={windowState} />
          <span className="flex-1 truncate text-[10px] text-muted-foreground/60">
            {showToolKind ? toolKind : displayTitle}
          </span>
          {showToolKind ? (
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {title}
            </span>
          ) : null}
        </div>

        {/* 命令区域 — widgetId */}
        <div className="border-b bg-muted/20 px-3 py-2">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-emerald-500">$</span>
            <span className="flex-1 break-all text-amber-700 dark:text-amber-400">
              {widgetId}
            </span>
          </div>
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
