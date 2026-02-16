'use client'

import { FileCode2, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatSession, useChatTools } from '../../context'
import { useTabRuntime } from '@/hooks/use-tab-runtime'
import type { AnyToolPart } from './shared/tool-utils'

export default function WriteFileTool({
  part,
  className,
}: {
  part: AnyToolPart
  className?: string
}) {
  const { tabId } = useChatSession()
  const { toolParts } = useChatTools()
  const pushStackItem = useTabRuntime((s) => s.pushStackItem)

  const toolCallId =
    typeof part.toolCallId === 'string' ? part.toolCallId : ''
  const snapshot = toolCallId ? toolParts[toolCallId] : undefined
  const resolved: AnyToolPart = snapshot
    ? { ...part, ...(snapshot as Partial<AnyToolPart>) }
    : part

  const input = resolved.input as
    | { path?: string; content?: string }
    | undefined
  const path = typeof input?.path === 'string' ? input.path : ''
  const fileName = path ? path.split('/').pop() || path : '写入文件'
  const state = typeof resolved.state === 'string' ? resolved.state : ''

  const isStreaming =
    state === 'input-streaming' || state === 'output-streaming'
  const isDone =
    state === 'input-available' || state === 'output-available'
  const isError = state === 'output-error'

  const handleClick = () => {
    if (!tabId || !toolCallId) return
    const stackId = `streaming-write:${toolCallId}`
    pushStackItem(tabId, {
      id: stackId,
      sourceKey: stackId,
      component: 'streaming-code-viewer',
      title: fileName,
      params: { toolCallId, tabId, __isStreaming: isStreaming },
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'flex w-full min-w-0 max-w-[90%] items-center gap-2 rounded-lg',
        'px-3 py-1.5 text-left text-sm transition-colors',
        'hover:bg-accent/60',
        isStreaming && 'tenas-tool-streaming',
        className,
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
      <span className="truncate">{fileName}</span>
      {isStreaming && (
        <span className="ml-auto shrink-0">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-blue-500" />
        </span>
      )}
    </button>
  )
}
