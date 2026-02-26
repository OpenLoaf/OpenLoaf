'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { useMutation, useQuery, useQueryClient, skipToken } from '@tanstack/react-query'
import {
  JSXPreview,
  JSXPreviewContent,
  JSXPreviewError,
} from '@/components/ai-elements/jsx-preview'
import { RefreshCw } from 'lucide-react'
import { useChatActions, useChatSession, useChatState, useChatTools } from '../../context'
import { JSX_PREVIEW_COMPONENTS } from './shared/jsx-preview-components'
import { TrafficLights } from '@openloaf/ui/traffic-lights'
import { onJsxCreateRefresh } from '@/lib/chat/jsx-create-events'
import { trpc } from '@/utils/trpc'
import {
  asPlainObject,
  getToolId,
  getToolName,
  isToolStreaming,
  normalizeToolInput,
  type AnyToolPart,
} from './shared/tool-utils'

/** JSX create tool renderer. */
export default function JsxCreateTool({
  part,
  className,
  messageId,
}: {
  part: AnyToolPart
  className?: string
  messageId?: string
}) {
  const { messages } = useChatState()
  const { updateMessage } = useChatActions()
  const { upsertToolPart } = useChatTools()
  const { sessionId, workspaceId, projectId } = useChatSession()
  const updatePartsMutation = useMutation({
    ...trpc.chat.updateMessageParts.mutationOptions(),
  })
  const isStreaming = isToolStreaming(part)
  const title = getToolName(part)
  const errorText =
    typeof part.errorText === 'string' ? part.errorText.trim() : ''
  const state = typeof part.state === 'string' ? part.state : ''
  const isDone = state === 'output-available'
  const isError = state === 'output-error' || Boolean(errorText)
  const windowState = isError
    ? 'error'
    : isStreaming
      ? 'running'
      : isDone
        ? 'success'
        : 'idle'

  const inputPayload = normalizeToolInput(part.input)
  const inputObj = asPlainObject(inputPayload)
  const inputJsx =
    typeof inputPayload === 'string'
      ? inputPayload
      : typeof inputObj?.jsx === 'string'
        ? inputObj.jsx
        : ''
  const jsxUri =
    sessionId && messageId
      ? `.openloaf/chat-history/${sessionId}/jsx/${messageId}.jsx`
      : ''
  const readFileOptions = React.useMemo(
    () =>
      trpc.fs.readFile.queryOptions(
        jsxUri && workspaceId
          ? { workspaceId, projectId, uri: jsxUri }
          : skipToken,
      ),
    [jsxUri, workspaceId, projectId],
  )
  const fileQuery = useQuery(readFileOptions)
  const queryClient = useQueryClient()

  const fileContent =
    typeof fileQuery.data?.content === 'string' ? fileQuery.data.content : ''
  // 逻辑：优先读取落盘内容，未落盘时回退到工具输入。
  const jsx = fileContent.trim().length > 0 ? fileContent : inputJsx
  const hasJsx = jsx.trim().length > 0
  const toolCallId = typeof part.toolCallId === 'string' ? part.toolCallId : ''
  const reportKeyRef = React.useRef<string | null>(null)

  const shouldHideDuplicate = React.useMemo(() => {
    if (!messageId || !toolCallId) return false
    const message = messages?.find((msg: any) => msg?.id === messageId)
    const parts = Array.isArray((message as any)?.parts)
      ? (message as any).parts
      : []
    if (parts.length === 0) return false
    const jsxParts = parts.filter((item: any) => {
      if (!item || typeof item !== 'object') return false
      const id = getToolId(item as AnyToolPart)
      return id === 'jsx-create' || id === 'jsx-preview'
    })
    if (jsxParts.length <= 1) return false
    const last = jsxParts.at(-1) as AnyToolPart | undefined
    const lastToolCallId = typeof last?.toolCallId === 'string' ? last.toolCallId : ''
    return lastToolCallId !== '' && lastToolCallId !== toolCallId
  }, [messageId, messages, toolCallId])

  /** Report render errors back to message parts for AI visibility. */
  const reportRenderError = React.useCallback((errorMessage: string) => {
    if (!messageId || !toolCallId) return
    const normalized = errorMessage.trim()
    if (!normalized) return
    const reportKey = `${messageId}:${toolCallId}:${normalized}`
    if (reportKeyRef.current === reportKey) return
    reportKeyRef.current = reportKey

    const targetMessage = messages?.find((msg: any) => msg?.id === messageId)
    const parts = Array.isArray((targetMessage as any)?.parts)
      ? (targetMessage as any).parts
      : []
    if (!parts.length) return

    const nextParts = parts.map((c: any) => {
      if (c?.toolCallId !== toolCallId) return c
      // 逻辑：保留原状态，仅追加 errorText 便于后续 AI 感知。
      return { ...c, errorText: normalized }
    })
    updateMessage(messageId, { parts: nextParts })
    upsertToolPart(toolCallId, { ...(part as any), errorText: normalized } as any)
    updatePartsMutation.mutate(
      {
        sessionId,
        messageId,
        parts: nextParts as any,
      },
      {
        onError: () => {
          // 逻辑：落库失败时保留本地状态，不阻断 UI。
        },
      },
    )
  }, [
    messageId,
    toolCallId,
    messages,
    updateMessage,
    upsertToolPart,
    part,
    sessionId,
    updatePartsMutation,
  ])

  React.useEffect(() => {
    if (!jsxUri || !workspaceId) return
    const unsubscribe = onJsxCreateRefresh((payload) => {
      if (payload.uri !== jsxUri) return
      // 逻辑：收到刷新事件后，强制重新拉取 jsx 文件内容。
      const queryKey = trpc.fs.readFile.queryOptions({
        workspaceId,
        projectId,
        uri: jsxUri,
      }).queryKey
      void queryClient.invalidateQueries({ queryKey })
    })
    return unsubscribe
  }, [jsxUri, workspaceId, projectId, queryClient])

  /** Manually refresh the JSX file content from disk. */
  const handleManualRefresh = React.useCallback(() => {
    if (!jsxUri || !workspaceId) return
    const queryKey = trpc.fs.readFile.queryOptions({
      workspaceId,
      projectId,
      uri: jsxUri,
    }).queryKey
    void queryClient.invalidateQueries({ queryKey })
  }, [jsxUri, workspaceId, projectId, queryClient])

  if (!hasJsx && !isStreaming && !errorText) {
    // 逻辑：未提供 JSX 且无错误时不渲染内容卡片。
    return null
  }
  if (shouldHideDuplicate) {
    // 逻辑：同一消息内仅展示最后一次 jsx-create 调用结果。
    return null
  }

  return (
    <div className={cn('w-full min-w-0', className)}>
      <div className="overflow-hidden rounded-lg border bg-card text-card-foreground">
        <div className="flex items-center gap-3 border-b bg-muted/50 px-3 py-2">
          <TrafficLights state={windowState} />
          <span className="flex-1 truncate text-[10px] text-muted-foreground/60">
            {title}
          </span>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={!jsxUri || !workspaceId}
            className="inline-flex items-center gap-1 rounded-full border border-transparent bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className="size-3" />
            刷新
          </button>
        </div>

        <div className="px-3 py-3">
          {hasJsx ? (
            <JSXPreview
              jsx={jsx}
              isStreaming={isStreaming}
              components={JSX_PREVIEW_COMPONENTS}
              onError={(error) => {
                // 逻辑：渲染失败时上报错误，确保 AI 后续可感知。
                reportRenderError(`JSX 渲染失败：${error.message}`)
              }}
            >
              <div className="min-w-0">
                <JSXPreviewContent />
              </div>
              <JSXPreviewError className="mt-2 text-xs" />
            </JSXPreview>
          ) : errorText ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
              {errorText}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">生成中...</div>
          )}
        </div>
      </div>
    </div>
  )
}
