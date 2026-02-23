'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { BotIcon } from 'lucide-react'
import { useTabs } from '@/hooks/use-tabs'
import { useChatRuntime } from '@/hooks/use-chat-runtime'
import { renderMessageParts } from '@/components/ai/message/renderMessageParts'
import type { SubAgentStreamState } from '@/components/ai/context/ChatToolContext'
import { ChatStateProvider } from '@/components/ai/context/ChatStateContext'
import { ChatToolProvider } from '@/components/ai/context/ChatToolContext'
import { ChatSessionProvider } from '@/components/ai/context/ChatSessionContext'
import { ChatActionsProvider, type ChatActionsContextValue } from '@/components/ai/context/ChatActionsContext'
import { trpcClient } from '@/utils/trpc'

/** Status badge for the panel header. */
function StatusBadge({ stream, hasHistory }: {
  stream: SubAgentStreamState | undefined
  hasHistory: boolean
}) {
  if (!stream && hasHistory) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        已完成
      </span>
    )
  }
  if (!stream) {
    return <span className="text-[11px] text-muted-foreground">未连接</span>
  }
  const isStreaming = stream.streaming === true
  const hasError = stream.state === 'output-error'
  const isDone = stream.state === 'output-available' && !isStreaming

  if (hasError) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
        <span className="size-1.5 rounded-full bg-destructive" />
        出错
      </span>
    )
  }
  if (isDone) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        已完成
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
      <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
      运行中
    </span>
  )
}

/** Sub-agent chat panel displayed in the left stack. */
export default function SubAgentChatPanel({
  agentId,
  sessionId,
  tabId: propTabId,
}: {
  agentId?: string
  sessionId?: string
  tabId?: string
  [key: string]: unknown
}) {
  const activeTabId = useTabs((s) => s.activeTabId)
  const tabId = propTabId ?? activeTabId ?? ''
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const wasAtBottomRef = React.useRef(true)

  // 从全局 store 读取 subAgentStreams（key 是 agent_id）
  const stream = useChatRuntime((state) => {
    if (!tabId || !agentId) return undefined
    return state.subAgentStreamsByTabId[tabId]?.[agentId]
  })

  // 刷新后 stream 为空时，从服务端加载历史
  const [historyData, setHistoryData] = React.useState<{
    parts: unknown[]
    messages: Array<{ id: string; role: string; parts: unknown[] }>
    name?: string
    task?: string
  } | null>(null)
  const [historyLoading, setHistoryLoading] = React.useState(false)

  React.useEffect(() => {
    if (stream || !agentId || !sessionId || historyData) return
    let cancelled = false
    setHistoryLoading(true)
    trpcClient.chat.getSubAgentHistory
      .query({ sessionId, toolCallId: agentId })
      .then((res) => {
        if (cancelled) return
        const messages = Array.isArray(res.messages) ? res.messages : []
        if (res.message || messages.length > 0) {
          const meta = res.agentMeta as Record<string, unknown> | undefined
            ?? (res.message?.metadata as Record<string, unknown> | undefined)
          setHistoryData({
            parts: res.message ? (Array.isArray(res.message.parts) ? res.message.parts : []) : [],
            messages: messages.map((m: any) => ({
              id: m.id ?? '',
              role: m.role ?? 'assistant',
              parts: Array.isArray(m.parts) ? m.parts : [],
            })),
            name: typeof meta?.name === 'string' ? meta.name : undefined,
            task: typeof meta?.task === 'string' ? meta.task : undefined,
          })
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setHistoryLoading(false) })
    return () => { cancelled = true }
  }, [stream, agentId, sessionId, historyData])

  // 合并 stream（实时）和 historyData（持久化）
  const agentName = stream?.name || historyData?.name || '子代理'
  const isStreaming = stream?.streaming === true
  const parts = (stream?.parts ?? historyData?.parts) as any[] | undefined
  const historyMessages = historyData?.messages ?? []
  const outputText = stream?.output ?? ''
  const errorText = stream?.errorText
  const taskText = stream?.task || historyData?.task

  // 自动滚动到底部
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [parts, outputText])

  const handleScroll = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const threshold = 40
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
  }, [])

  if (!agentId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        未指定子代理
      </div>
    )
  }

  const hasParts = Array.isArray(parts) && parts.length > 0
  const hasMessages = historyMessages.length > 0 && !stream

  // 最小化 context stubs，让 renderMessageParts → MessageTool 不报错
  const chatStateStub = React.useMemo(() => ({
    messages: [] as any[],
    status: (isStreaming ? 'streaming' : 'ready') as any,
    error: undefined,
    isHistoryLoading: false,
    stepThinking: false,
  }), [isStreaming])

  const noop = React.useCallback(() => {}, [])
  const chatToolStub = React.useMemo(() => ({
    toolParts: {} as Record<string, any>,
    upsertToolPart: noop,
    markToolStreaming: noop,
    subAgentStreams: {} as Record<string, SubAgentStreamState>,
    queueToolApprovalPayload: noop,
    clearToolApprovalPayload: noop,
    continueAfterToolApprovals: noop,
  }), [noop])

  const chatSessionStub = React.useMemo(() => ({
    sessionId: sessionId ?? '',
    tabId,
    leafMessageId: null,
    branchMessageIds: [] as string[],
    siblingNav: {} as Record<string, any>,
  }), [sessionId, tabId])

  const noopAsync = React.useCallback(async () => false as any, [])
  const chatActionsStub = React.useMemo<ChatActionsContextValue>(() => ({
    sendMessage: noop as any,
    regenerate: noop as any,
    addToolApprovalResponse: noop as any,
    clearError: noop as any,
    stopGenerating: noop,
    updateMessage: noop as any,
    newSession: noop,
    selectSession: noop as any,
    switchSibling: noop as any,
    retryAssistantMessage: noop as any,
    resendUserMessage: noop as any,
    deleteMessageSubtree: noopAsync,
    setPendingCloudMessage: noop as any,
    sendPendingCloudMessage: noop,
  }), [noop, noopAsync])

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <BotIcon className="size-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{agentName}</span>
        <StatusBadge stream={stream} hasHistory={!!historyData} />
      </div>

      {/* Task description */}
      {taskText ? (
        <div className="shrink-0 border-b bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground line-clamp-2">
          {taskText}
        </div>
      ) : null}

      {/* Message content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-3"
        onScroll={handleScroll}
      >
        {hasMessages ? (
          <ChatSessionProvider value={chatSessionStub}>
            <ChatStateProvider value={chatStateStub}>
              <ChatActionsProvider value={chatActionsStub}>
                <ChatToolProvider value={chatToolStub}>
                  <div className="space-y-3">
                    {historyMessages.map((msg) => {
                      const msgParts = Array.isArray(msg.parts) ? msg.parts : []
                      if (msgParts.length === 0) return null
                      return (
                        <div key={msg.id} className={cn(
                          msg.role === 'user' && 'rounded-lg bg-muted/40 px-2 py-1.5',
                        )}>
                          {msg.role === 'user' && (
                            <div className="mb-1 text-[11px] font-medium text-muted-foreground">用户</div>
                          )}
                          {renderMessageParts(msgParts as any[], {
                            renderTools: true,
                            renderText: true,
                            isAnimating: false,
                            toolVariant: 'nested',
                          })}
                        </div>
                      )
                    })}
                  </div>
                </ChatToolProvider>
              </ChatActionsProvider>
            </ChatStateProvider>
          </ChatSessionProvider>
        ) : hasParts ? (
          <ChatSessionProvider value={chatSessionStub}>
            <ChatStateProvider value={chatStateStub}>
              <ChatActionsProvider value={chatActionsStub}>
                <ChatToolProvider value={chatToolStub}>
                  <div className="space-y-2">
                    {renderMessageParts(parts, {
                      renderTools: true,
                      renderText: true,
                      isAnimating: isStreaming,
                      toolVariant: 'nested',
                    })}
                  </div>
                </ChatToolProvider>
              </ChatActionsProvider>
            </ChatStateProvider>
          </ChatSessionProvider>
        ) : outputText ? (
          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/80">
            {outputText}
          </pre>
        ) : historyLoading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            加载历史…
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {isStreaming ? '等待输出…' : '暂无输出'}
          </div>
        )}

        {/* Error display */}
        {errorText ? (
          <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {errorText}
          </div>
        ) : null}
      </div>
    </div>
  )
}
