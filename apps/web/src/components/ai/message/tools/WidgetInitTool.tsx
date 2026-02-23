'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { FolderOpen, FileCode } from 'lucide-react'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { useWorkspace } from '@/components/workspace/workspaceContext'
import { useChatSession } from '../../context'
import {
  getApprovalId,
  getToolName,
  isApprovalPending,
  isToolStreaming,
  normalizeToolInput,
  asPlainObject,
  type AnyToolPart,
} from './shared/tool-utils'
import { TrafficLights } from '@tenas-ai/ui/traffic-lights'
import { parseOutputJson } from './shared/widget-shared'
import ToolApprovalActions from './shared/ToolApprovalActions'

export default function WidgetInitTool({
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
  const widgetId = (outputJson?.widgetId as string) || 'Widget'
  const widgetDir = (outputJson?.widgetDir as string) || ''
  const files = (outputJson?.files as string[]) || []

  const isStreaming = isToolStreaming(part)
  const hasError =
    typeof part.errorText === 'string' && part.errorText.trim().length > 0
  const approvalId = getApprovalId(part)
  const isPending = isApprovalPending(part)

  const widgetName =
    typeof input?.widgetName === 'string' ? input.widgetName : widgetId

  const windowState = hasError
    ? ('error' as const)
    : isStreaming
      ? ('running' as const)
      : part.state === 'output-available'
        ? ('success' as const)
        : ('idle' as const)

  const handleOpenWidget = () => {
    if (!tabId || !workspaceId || !widgetId) return
    const baseRootUri = projectId
      ? workspace?.projects?.[projectId]
      : workspace?.rootUri
    if (!baseRootUri) return
    const widgetFolderUri = `${baseRootUri.replace(/\/$/, '')}/.tenas/dynamic-widgets/${widgetId}`
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

  if (!input?.widgetName && !isStreaming) return null

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div className="overflow-hidden rounded-lg border bg-card text-card-foreground">
        {/* 标题栏 */}
        <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2">
          <TrafficLights state={windowState} />
          <span className="flex-1 truncate text-[10px] text-muted-foreground/60">
            widget-init
          </span>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {widgetName}
          </span>
        </div>

        {/* 审批区域 */}
        {isPending && approvalId ? (
          <div className="flex items-center justify-between px-3 py-2.5">
            <span className="text-xs text-muted-foreground">
              确认创建 Widget 脚手架？
            </span>
            <ToolApprovalActions approvalId={approvalId} size="default" />
          </div>
        ) : null}

        {/* 文件列表 */}
        {files.length > 0 ? (
          <div className="space-y-0.5 px-3 py-2">
            {files.map((f) => (
              <div
                key={f}
                className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground"
              >
                <FileCode className="size-3 shrink-0" />
                <span className="truncate">
                  {f.split('/').slice(-2).join('/')}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {/* 流式占位 */}
        {isStreaming ? (
          <div className="flex items-center justify-center py-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              创建中...
            </div>
          </div>
        ) : null}

        {/* 操作按钮 */}
        {part.state === 'output-available' && !hasError ? (
          <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-500/20 dark:text-sky-400"
              onClick={handleOpenWidget}
            >
              <FolderOpen className="size-3.5" />
              打开文件夹
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
