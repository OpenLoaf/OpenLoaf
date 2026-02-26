/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\n'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import {
  extractPatchDiffStats,
  extractPatchDiffLines,
  extractPatchFileInfo,
} from '@/lib/chat/patch-utils'
import { emitJsxCreateRefresh } from '@/lib/chat/jsx-create-events'
import { TrafficLights } from '@openloaf/ui/traffic-lights'
import { useChatSession, useChatTools } from '../../context'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { useChatRuntime } from '@/hooks/use-chat-runtime'
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

type PatchFileSummary = {
  path: string
  status: 'added' | 'modified' | 'deleted'
  added: number
  removed: number
}

/** Parse apply_patch payload into per-file summaries. */
function parsePatchFiles(patch: string): PatchFileSummary[] {
  const files: PatchFileSummary[] = []
  let current: PatchFileSummary | null = null
  let inPatch = false

  for (const line of patch.split('\n')) {
    if (line.startsWith('*** Begin Patch')) {
      inPatch = true
      continue
    }
    if (!inPatch) continue
    if (line.startsWith('*** End Patch')) break

    const addMatch = line.match(/^\*\*\* Add File: (.+)$/)
    if (addMatch) {
      if (current) files.push(current)
      current = { path: addMatch[1] ?? '', status: 'added', added: 0, removed: 0 }
      continue
    }
    const updateMatch = line.match(/^\*\*\* Update File: (.+)$/)
    if (updateMatch) {
      if (current) files.push(current)
      current = { path: updateMatch[1] ?? '', status: 'modified', added: 0, removed: 0 }
      continue
    }
    const deleteMatch = line.match(/^\*\*\* Delete File: (.+)$/)
    if (deleteMatch) {
      if (current) files.push(current)
      current = { path: deleteMatch[1] ?? '', status: 'deleted', added: 0, removed: 0 }
      continue
    }
    if (!current) continue
    if (line.startsWith('***') || line.startsWith('@@')) continue

    if (line.startsWith('+')) current.added += 1
    if (line.startsWith('-')) current.removed += 1
  }

  if (current) files.push(current)
  return files
}

/** Normalize patch file path into posix separators. */
function normalizePatchPath(input: string): string {
  return input.replace(/\\/g, '/')
}

function DiffBar({ added, removed }: { added: number; removed: number }) {
  const total = added + removed
  if (total === 0) return null
  const greenCount = Math.round((added / total) * 5)
  const redCount = 5 - greenCount
  return (
    <span className="inline-flex gap-px">
      {Array.from({ length: greenCount }, (_, i) => (
        <span key={`g${i}`} className="inline-block size-1.5 rounded-[1px] bg-green-600" />
      ))}
      {Array.from({ length: redCount }, (_, i) => (
        <span key={`r${i}`} className="inline-block size-1.5 rounded-[1px] bg-red-500" />
      ))}
    </span>
  )
}

export default function WriteFileTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { tabId, workspaceId, projectId } = useChatSession()
  const { toolParts } = useChatTools()
  const pushStackItem = useTabRuntime((s) => s.pushStackItem)
  /** Track refresh emission to avoid duplicates. */
  const refreshKeyRef = React.useRef<string | null>(null)

  const toolCallId = typeof part.toolCallId === 'string' ? part.toolCallId : ''
  const snapshot = toolCallId ? toolParts[toolCallId] : undefined
  const resolved: AnyToolPart = snapshot
    ? { ...part, ...(snapshot as Partial<AnyToolPart>) }
    : part

  const input = normalizeToolInput(resolved.input)
  const inputObj = asPlainObject(input)
  const patch = typeof inputObj?.patch === 'string' ? inputObj.patch : ''
  const { fileName, fileCount, firstPath } = patch
    ? extractPatchFileInfo(patch)
    : { fileName: '写入文件', fileCount: 1, firstPath: '' }
  const patchFiles = patch ? parsePatchFiles(patch) : []
  const state = typeof resolved.state === 'string' ? resolved.state : ''
  const errorText =
    typeof resolved.errorText === 'string' && resolved.errorText.trim()
      ? resolved.errorText
      : ''

  const isStreaming = isToolStreaming(resolved)
  const isDone = state === 'output-available'
  const isError = state === 'output-error'
  const diffStats = patch ? extractPatchDiffStats(patch) : null
  const diffLines = patch ? extractPatchDiffLines(patch, 10) : []
  const totalDiffLines = diffStats ? diffStats.added + diffStats.removed : 0

  const title = getToolName(part)
  const toolKind = typeof part.toolName === 'string' && part.toolName.trim()
    ? part.toolName
    : part.type?.startsWith('tool-')
      ? part.type.slice('tool-'.length)
      : part.type ?? ''
  const showToolKind = Boolean(toolKind) && title !== toolKind
  const approvalId = getApprovalId(part)
  const isPending = isApprovalPending(part)

  const windowState = isError
    ? 'error' as const
    : isStreaming
      ? 'running' as const
      : isDone
        ? 'success' as const
        : 'idle' as const

  const openDisabled = !tabId || !toolCallId

  React.useEffect(() => {
    if (!isDone || isError || !patch) return
    const refreshKey = `${toolCallId}:${patch}`
    if (refreshKeyRef.current === refreshKey) return
    refreshKeyRef.current = refreshKey

    const jsxTargets = parsePatchFiles(patch)
      .map((file) => normalizePatchPath(file.path))
      .filter((filePath) =>
        filePath.includes('.openloaf/chat-history/')
        && filePath.includes('/jsx/')
        && filePath.endsWith('.jsx'),
      )
    if (jsxTargets.length === 0) return

    // 逻辑：仅当修改 JSX 渲染文件时触发刷新事件。
    jsxTargets.forEach((uri) => emitJsxCreateRefresh({ uri }))
  }, [isDone, isError, patch, toolCallId])

  const handleClick = () => {
    if (!tabId || !toolCallId) return

    const runtime = useTabRuntime.getState().runtimeByTabId[tabId]
    const existingItem = runtime?.stack?.find((s: any) => {
      const ids = (s.params?.toolCallIds as string[]) ?? []
      return ids.includes(toolCallId)
    })

    if (existingItem) {
      pushStackItem(tabId, existingItem)
      return
    }

    const toolCallIds = [toolCallId]
    if (firstPath) {
      const allParts = useChatRuntime.getState().toolPartsByTabId[tabId] ?? {}
      for (const [key, tp] of Object.entries(allParts)) {
        if (key === toolCallId) continue
        const tpInput = (tp as any)?.input as Record<string, unknown> | undefined
        const tpPatch = typeof tpInput?.patch === 'string' ? tpInput.patch : ''
        if (!tpPatch) continue
        const { firstPath: tpPath } = extractPatchFileInfo(tpPatch)
        if (tpPath === firstPath) toolCallIds.push(key)
      }
    }

    const stackId = `streaming-write:${toolCallId}`
    pushStackItem(tabId, {
      id: stackId,
      sourceKey: stackId,
      component: 'streaming-code-viewer',
      title: fileName,
      params: {
        toolCallIds,
        tabId,
        workspaceId: workspaceId ?? '',
        projectId,
        __isStreaming: isStreaming,
      },
    })
  }

  const fallbackFile = firstPath
    ? [
        {
          path: firstPath,
          status:
            diffStats?.type === 'add'
              ? ('added' as const)
              : diffStats?.type === 'delete'
                ? ('deleted' as const)
                : ('modified' as const),
          added: diffStats?.added ?? 0,
          removed: diffStats?.removed ?? 0,
        },
      ]
    : []
  const files = patchFiles.length > 0 ? patchFiles : fallbackFile

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
            <span className="shrink-0 text-xs font-medium text-muted-foreground">{title}</span>
          ) : null}
        </div>

        {/* 内容区域：文件列表 + diff 预览 */}
        <div className="px-2.5 py-2 font-mono text-xs">
          {/* 文件列表 */}
          {files.map((file) => (
            <div
              key={`${file.status}:${file.path}`}
              className={cn(
                'flex items-center gap-2 rounded px-1 py-1 -mx-1',
                !openDisabled && 'cursor-pointer hover:bg-muted/60',
              )}
              onClick={openDisabled ? undefined : handleClick}
            >
              <span className={
                file.status === 'added'
                  ? 'text-emerald-500'
                  : file.status === 'deleted'
                    ? 'text-red-500'
                    : 'text-amber-500'
              }>
                {file.status === 'added' ? '+' : file.status === 'deleted' ? '-' : '~'}
              </span>
              <span className="flex-1 break-all text-amber-700 dark:text-amber-400">
                {file.path}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                +{file.added} / -{file.removed}
              </span>
              <DiffBar added={file.added} removed={file.removed} />
            </div>
          ))}

          {/* diff 预览 */}
          {isDone && !isError && diffLines.length > 0 ? (
            <div className="mt-1.5 overflow-hidden rounded border border-border/40">
              <pre className="overflow-x-auto p-0 leading-5">
                {diffLines.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      'px-1.5',
                      line.type === '+' && 'bg-green-500/10 text-green-700 dark:text-green-400',
                      line.type === '-' && 'bg-red-500/10 text-red-700 dark:text-red-400',
                    )}
                  >
                    <span className="inline-block w-7 select-none pr-1 text-right tabular-nums text-[10px] text-muted-foreground/50">
                      {line.lineNo ?? ''}
                    </span>
                    <span className="select-none opacity-60">{line.type === ' ' ? ' ' : line.type}</span>
                    {line.text}
                  </div>
                ))}
                {totalDiffLines > diffLines.length && (
                  <div className="px-1.5 text-muted-foreground">
                    <span className="inline-block w-7" />
                    ⋯ {totalDiffLines - diffLines.length} more lines
                  </div>
                )}
              </pre>
            </div>
          ) : null}

          {/* 错误信息 */}
          {isError ? (
            <div className="mt-1 text-destructive">
              {errorText || '写入失败'}
            </div>
          ) : null}

          {/* 流式占位 */}
          {isStreaming ? (
            <div className="mt-1 flex items-center gap-2 text-muted-foreground">
              <div className="size-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              写入中...
            </div>
          ) : null}
        </div>

        {/* 审批区域（仅 pending 时显示） */}
        {isPending && approvalId ? (
          <div className="flex items-center justify-between border-t px-3 py-2.5">
            <span className="text-xs text-muted-foreground">确认写入此文件？</span>
            <ToolApprovalActions approvalId={approvalId} size="default" />
          </div>
        ) : null}
      </div>
    </div>
  )
}
