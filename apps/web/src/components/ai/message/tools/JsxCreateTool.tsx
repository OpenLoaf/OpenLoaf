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
import { useMutation, useQuery, useQueryClient, skipToken } from '@tanstack/react-query'
import {
  JSXPreview,
  JSXPreviewContent,
  JSXPreviewError,
} from '@/components/ai-elements/jsx-preview'
import { RefreshCw } from 'lucide-react'
import { useChatActions, useChatMessages, useChatSession, useChatTools } from '../../context'
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

/** URI template: resolved server-side to the chat session root directory. */
const CHAT_SESSION_DIR_URI = '${CHAT_SESSION_DIR}'

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
  const { messages } = useChatMessages()
  const { updateMessage } = useChatActions()
  const { upsertToolPart } = useChatTools()
  const { sessionId, projectId } = useChatSession()
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
      : typeof inputObj?.content === 'string'
        ? inputObj.content
        : typeof inputObj?.jsx === 'string'
          ? inputObj.jsx
          : ''
  const jsxUri =
    sessionId && messageId
      ? `${CHAT_SESSION_DIR_URI}/jsx/${messageId}.jsx`
      : ''
  // 逻辑：流式期间 JSX 文件尚未落盘，跳过查询避免 404。
  const readFileOptions = React.useMemo(
    () =>
      trpc.fs.readFile.queryOptions(
        jsxUri && !isStreaming
          ? { projectId, sessionId, uri: jsxUri }
          : skipToken,
      ),
    [jsxUri, projectId, sessionId, isStreaming],
  )
  const fileQuery = useQuery(readFileOptions)
  const queryClient = useQueryClient()

  const fileContent =
    typeof fileQuery.data?.content === 'string' ? fileQuery.data.content : ''
  // 逻辑：优先读取落盘内容，未落盘时回退到工具输入。
  const jsx = fileContent.trim().length > 0 ? fileContent : inputJsx
  const hasJsx = jsx.trim().length > 0

  // --- Streaming stabilization: debounce + height floor ---
  // Debounce jsx during streaming to reduce layout thrashing
  const [renderJsx, setRenderJsx] = React.useState(jsx)
  React.useEffect(() => {
    if (!isStreaming) {
      setRenderJsx(jsx)
      return
    }
    const timer = setTimeout(() => setRenderJsx(jsx), 150)
    return () => clearTimeout(timer)
  }, [jsx, isStreaming])

  // Height floor: track max rendered height during streaming, apply as min-height
  const containerRef = React.useRef<HTMLDivElement>(null)
  const maxStreamingHeightRef = React.useRef(0)
  React.useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (!isStreaming) {
      maxStreamingHeightRef.current = 0
      const timer = setTimeout(() => {
        if (containerRef.current) containerRef.current.style.minHeight = ''
      }, 300)
      return () => clearTimeout(timer)
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height
        if (h > maxStreamingHeightRef.current) {
          maxStreamingHeightRef.current = h
        }
        el.style.minHeight = `${maxStreamingHeightRef.current}px`
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [isStreaming])

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
      return id === 'JsxCreate' || id === 'jsx-preview'
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
    if (!jsxUri || !messageId) return
    const jsxSuffix = `/jsx/${messageId}.jsx`
    const unsubscribe = onJsxCreateRefresh((payload) => {
      if (!payload.uri.endsWith(jsxSuffix)) return
      // 逻辑：收到刷新事件后，强制重新拉取 jsx 文件内容。
      const queryKey = trpc.fs.readFile.queryOptions({
        projectId,
        sessionId,
        uri: jsxUri,
      }).queryKey
      void queryClient.invalidateQueries({ queryKey })
    })
    return unsubscribe
  }, [jsxUri, messageId, projectId, sessionId, queryClient])

  /** Manually refresh the JSX file content from disk. */
  const handleManualRefresh = React.useCallback(() => {
    if (!jsxUri) return
    const queryKey = trpc.fs.readFile.queryOptions({
      projectId,
      sessionId,
      uri: jsxUri,
    }).queryKey
    void queryClient.invalidateQueries({ queryKey })
  }, [jsxUri, projectId, sessionId, queryClient])

  if (!hasJsx && !isStreaming && !errorText) {
    // 逻辑：未提供 JSX 且无错误时不渲染内容卡片。
    return null
  }
  if (shouldHideDuplicate) {
    // 逻辑：同一消息内仅展示最后一次 JsxCreate 调用结果。
    return null
  }

  return (
    <div ref={containerRef} className={cn('w-full min-w-0 max-w-4xl', className)}>
      {hasJsx ? (
        <JSXPreview
          jsx={renderJsx}
          isStreaming={isStreaming}
          components={JSX_PREVIEW_COMPONENTS}
          onError={(error) => {
            // 逻辑：渲染失败时上报错误，确保 AI 后续可感知。
            reportRenderError(`JSX 渲染失败：${error.message}`)
          }}
        >
          <div className="min-w-0">
            <JSXPreviewContent className="[&>*]:mx-auto" />
          </div>
          <JSXPreviewError className="mt-2 text-xs" />
        </JSXPreview>
      ) : errorText ? (
        <div className="whitespace-pre-wrap break-all rounded-3xl border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
          {errorText}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">生成中...</div>
      )}
    </div>
  )
}
