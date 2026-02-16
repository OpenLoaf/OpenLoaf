'use client'

import { FileCode2, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  extractPatchFileInfo,
  extractPatchDiffStats,
  extractPatchDiffLines,
} from '@/lib/chat/patch-utils'
import { useChatSession, useChatTools } from '../../context'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import { useChatRuntime } from '@/hooks/use-chat-runtime'
import type { AnyToolPart } from './shared/tool-utils'

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

  const toolCallId =
    typeof part.toolCallId === 'string' ? part.toolCallId : ''
  const snapshot = toolCallId ? toolParts[toolCallId] : undefined
  const resolved: AnyToolPart = snapshot
    ? { ...part, ...(snapshot as Partial<AnyToolPart>) }
    : part

  const input = resolved.input as Record<string, unknown> | undefined
  const patch = typeof input?.patch === 'string' ? input.patch : ''
  const { fileName, fileCount, firstPath } = patch
    ? extractPatchFileInfo(patch)
    : { fileName: '写入文件', fileCount: 1, firstPath: '' }
  const state = typeof resolved.state === 'string' ? resolved.state : ''

  const isStreaming =
    state === 'input-streaming' || state === 'output-streaming'
  const isDone = state === 'output-available'
  const isInputReady = state === 'input-available'
  const isError = state === 'output-error'

  const diffStats = patch ? extractPatchDiffStats(patch) : null
  const diffLines = patch ? extractPatchDiffLines(patch) : []
  const showStats = isDone && !isError && diffStats

  const handleClick = () => {
    if (!tabId || !toolCallId) return

    // 逻辑：查找已有包含此 toolCallId 的 stack item。
    const runtime = useTabRuntime.getState().runtimeByTabId[tabId]
    const existingItem = runtime?.stack?.find((s: any) => {
      const ids = (s.params?.toolCallIds as string[]) ?? []
      return ids.includes(toolCallId)
    })

    if (existingItem) {
      // 逻辑：已有 stack → 激活它（pushStackItem 会 upsert 并激活）。
      pushStackItem(tabId, existingItem)
      return
    }

    // 逻辑：无已有 stack → 收集同文件的所有 toolCallIds 并新建。
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

  const totalDiffLines = diffStats
    ? diffStats.added + diffStats.removed
    : 0

  return (
    <div className={cn('max-w-[90%]', className)}>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-lg',
          'px-3 py-1.5 text-left text-sm transition-colors',
          'hover:bg-accent/60',
          isStreaming && 'tenas-tool-streaming',
        )}
      >
        <span className="shrink-0 text-muted-foreground">
          {isError ? (
            <AlertCircle className="size-4 text-destructive" />
          ) : isDone ? (
            <Check className="size-4 text-green-500" />
          ) : (
            <FileCode2 className="size-4" />
          )}
        </span>
        <span className="truncate">
          {fileName}
          {fileCount > 1 && ` +${fileCount - 1}`}
        </span>
        <span className="flex-1" />
        {isStreaming && (
          <span className="shrink-0 pr-2">
            <span className="inline-block size-1.5 animate-pulse rounded-full bg-blue-500" />
          </span>
        )}
        {showStats && diffStats.type === 'delete' && (
          <span className="shrink-0 pr-2 text-xs text-red-500">已删除</span>
        )}
        {showStats && diffStats.type !== 'delete' && (
          <span className="flex shrink-0 items-center gap-1.5 pr-2 text-xs">
            {diffStats.added > 0 && (
              <span className="text-green-600">+{diffStats.added}</span>
            )}
            {diffStats.removed > 0 && (
              <span className="text-red-500">-{diffStats.removed}</span>
            )}
            <DiffBar added={diffStats.added} removed={diffStats.removed} />
          </span>
        )}
      </button>
      {showStats && diffLines.length > 0 && (
        <div className="mx-3 mb-1 overflow-hidden rounded-md border border-border/50 bg-muted/30 font-mono text-xs">
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
                <span className="mr-1.5 inline-block w-5 select-none text-right text-muted-foreground/60">
                  {line.lineNo ?? ''}
                </span>
                <span className="mr-1 inline-block w-2.5 select-none opacity-60">
                  {line.type === ' ' ? '' : line.type}
                </span>
                {line.text}
              </div>
            ))}
            {totalDiffLines > diffLines.length && (
              <div className="px-1.5 text-muted-foreground">
                <span className="mr-1.5 inline-block w-5" />
                <span className="mr-1 inline-block w-2.5" />
                ⋯ {totalDiffLines - diffLines.length} more lines
              </div>
            )}
          </pre>
        </div>
      )}
    </div>
  )
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
