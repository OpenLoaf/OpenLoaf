/**
 * ChatProbeHarness — 用于 Vitest Browser Mode 的 Chat 测试容器。
 *
 * 复用真实的 MessageList 组件渲染 AI 对话，同时提供：
 * - 自动发送 prompt
 * - 自动审批工具调用
 * - 模型选择
 * - 完整的 ProbeResult 输出（含 sessionId、toolCalls、elapsedMs 等）
 * - 截图验证
 */
import * as React from 'react'
import { useChat, type UIMessage } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TabActiveProvider } from '@/components/layout/TabActiveContext'
import {
  ChatStateProvider,
  ChatSessionProvider,
  ChatActionsProvider,
  ChatOptionsProvider,
  ChatToolProvider,
} from '@/components/ai/context'
import type { ToolPartSnapshot } from '@/hooks/use-chat-runtime'
import MessageList from '@/components/ai/message/MessageList'

// ── i18n ──
import '@/i18n/index'
// ── 测试专用样式 ──
import './probe.css'

// ── Types ──

export type ApprovalStrategy = 'approve-all' | 'reject-all' | 'manual'

export type ChatProbeHarnessProps = {
  /** 后端服务地址 */
  serverUrl: string
  /** 自动发送的 prompt */
  prompt: string
  /** 多轮对话：第一轮完成后依次自动发送的后续 prompt */
  followUpPrompts?: string[]
  /** 会话 ID（留空则自动生成） */
  sessionId?: string
  /** 会话标题（设置后会通过 tRPC 重命名会话，如 "007 — 大 PDF 分段读..."） */
  title?: string
  /** 指定模型 ID（如 deepseek-chat） */
  chatModelId?: string
  /** 工具审批策略 */
  approvalStrategy?: ApprovalStrategy
  /** AI 提问的自动回答映射 */
  questionAnswers?: Record<string, string>
  /** 完成回调（含完整结果） */
  onComplete?: (result: ProbeResult) => void
  /** 额外的 CSS class */
  className?: string
}

export type ToolCallDetail = {
  /** 工具名（如 CloudModelGenerate） */
  name: string
  /** 该 tool 所在 assistant 消息对应的第几轮用户输入（0-based） */
  turnIndex: number
  /** 是否报错（output.isError / state === 'output-error' / errorText 非空等） */
  hasError: boolean
  /** 错误摘要（从 output.error / errorText / output.message 等字段抓取，最多 200 字） */
  errorSummary?: string
}

export type ProbeResult = {
  sessionId: string
  messages: UIMessage[]
  status: 'ok' | 'error'
  toolCalls: string[]
  /** 每次 tool invocation 的详细明细（含 error 状态），供 evaluator 直接读取 */
  toolCallDetails: ToolCallDetail[]
  elapsedMs: number
  finishReason: string | null
  error?: string
  textPreview: string
  startedAt: string
  /** 多轮对话中当前是第几轮（0-based），单轮对话为 0 */
  turnIndex: number
  /** 总轮数 */
  totalTurns: number
}

// ── Helpers ──

function generateSessionId(): string {
  const now = new Date()
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const rand = Math.random().toString(36).slice(2, 10)
  return `chat_probe_${ts}_${rand}`
}

/** CSRF header required by aiRouteGuard */
const CLIENT_HEADERS: Record<string, string> = { 'X-OpenLoaf-Client': '1' }

const EMPTY_TOOL_PARTS: Record<string, ToolPartSnapshot> = {}

/**
 * 检查消息中是否有已审批但未完成执行的工具调用。
 * tool part 的 state 流转：
 *   call → approval-requested → approval-responded → output-available
 * 如果有 part 停在非终态且没有 output，说明工具还在执行中。
 */
function hasPendingToolExecution(messages: any[]): boolean {
  for (const msg of messages) {
    if (msg?.role !== 'assistant') continue
    const parts = Array.isArray(msg?.parts) ? msg.parts : []
    for (const part of parts) {
      const type = typeof part?.type === 'string' ? part.type : ''
      if (!type.startsWith('tool-')) continue
      const state = part?.state
      if (state === 'approval-requested' && !part?.output) return true
      if (state === 'approval-responded' && !part?.output) return true
      if (state === 'call' && !part?.output && !part?.approval) return true
    }
  }
  return false
}

// ── Inner harness ──

function ChatProbeInner({
  serverUrl,
  prompt,
  followUpPrompts = [],
  sessionId: sessionIdProp,
  title,
  chatModelId,
  approvalStrategy = 'manual',
  questionAnswers: _questionAnswers,
  onComplete,
  className,
}: ChatProbeHarnessProps) {
  const sessionId = React.useMemo(
    () => sessionIdProp || generateSessionId(),
    [sessionIdProp],
  )
  const tabId = React.useMemo(() => `probe_${sessionId}`, [sessionId])
  const sessionIdRef = React.useRef(sessionId)
  const promptSentRef = React.useRef(false)
  const startTimeRef = React.useRef<number>(0)
  const startedAtRef = React.useRef<string>('')
  const finishReasonRef = React.useRef<string | null>(null)
  const onCompleteCalledRef = React.useRef(false)
  const networkRetryCountRef = React.useRef(0)
  const finishFiredRef = React.useRef(false)
  const MAX_NETWORK_RETRIES = 10
  const NETWORK_RETRY_DELAY_MS = 10_000
  const [toolParts, setToolParts] = React.useState<Record<string, ToolPartSnapshot>>(EMPTY_TOOL_PARTS)

  // ── Multi-turn state ──
  const allPrompts = React.useMemo(() => [prompt, ...followUpPrompts], [prompt, followUpPrompts])
  const totalTurns = allPrompts.length
  const turnIndexRef = React.useRef(0)
  const [allTurnsDone, setAllTurnsDone] = React.useState(false)
  const chatRef = React.useRef<any>(null)

  // ── Transport ──
  const transport = React.useMemo(() => {
    const apiBase = `${serverUrl}/ai/chat`
    return new DefaultChatTransport({
      api: apiBase,
      credentials: 'include',
      async prepareSendMessagesRequest({ id, messages, body, messageId, headers }) {
        const nextHeaders = { ...CLIENT_HEADERS, ...(headers ?? {}) }
        const extraBody = body && typeof body === 'object' ? body : {}
        const {
          params: _p,
          id: _id,
          messages: _m,
          ...restBody
        } = extraBody as Record<string, unknown>
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : undefined
        return {
          body: {
            ...restBody,
            sessionId: sessionIdRef.current ?? id,
            messageId,
            intent: 'chat',
            responseMode: 'stream',
            clientPlatform: 'web' as const,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            messages: lastMessage ? [lastMessage] : [],
            ...(chatModelId ? { chatModelId } : {}),
            ...(approvalStrategy === 'approve-all' ? { autoApproveTools: true } : {}),
          },
          headers: nextHeaders,
        }
      },
    })
  }, [serverUrl, chatModelId])

  // ── Completion logic ──
  // 提取到独立函数：只在 onFinish 触发过 + 无 pending 工具 时才真正完成。
  // 这样即使 onFinish 在 tool approval 暂停点过早触发，也不会导致提前完成。
  const tryReportComplete = React.useCallback((msgs: UIMessage[]) => {
    if (onCompleteCalledRef.current) return
    if (!finishFiredRef.current) return
    if (hasPendingToolExecution(msgs)) return

    const currentTurn = turnIndexRef.current
    // 还有后续轮次 → 发送下一条 prompt
    if (currentTurn + 1 < totalTurns) {
      turnIndexRef.current = currentTurn + 1
      finishFiredRef.current = false
      const nextPrompt = allPrompts[currentTurn + 1]!
      setTimeout(() => {
        chatRef.current.sendMessage({
          parts: [{ type: 'text' as const, text: nextPrompt }],
        })
      }, 300)
      return
    }

    // 全部轮次完成 → 报告结果
    onCompleteCalledRef.current = true
    setAllTurnsDone(true)
    const elapsedMs = Date.now() - startTimeRef.current
    const toolCalls = extractToolCalls(msgs)
    const toolCallDetails = extractToolCallDetails(msgs)
    const textPreview = extractTextPreview(msgs, 600)
    const result: ProbeResult = {
      sessionId,
      messages: msgs,
      status: 'ok',
      toolCalls,
      toolCallDetails,
      elapsedMs,
      finishReason: finishReasonRef.current,
      textPreview,
      startedAt: startedAtRef.current,
      turnIndex: currentTurn,
      totalTurns,
    }
    writeResultToDOM(result)
    onComplete?.(result)
  }, [sessionId, totalTurns, allPrompts, onComplete])

  // ── useChat ──
  const chat = useChat({
    id: sessionId,
    resume: false,
    experimental_throttle: 100,
    sendAutomaticallyWhen: () => false,
    transport,
    onFinish: () => {
      if (onCompleteCalledRef.current) return
      // 标记 stream 结束过至少一次，让 tryReportComplete 去判断是否真正完成
      finishFiredRef.current = true
      tryReportComplete(chat.messages as UIMessage[])
    },
    onData: (dataPart: any) => {
      // 捕获 finishReason
      if (dataPart?.type === 'finish') {
        finishReasonRef.current = dataPart?.data?.finishReason ?? dataPart?.finishReason ?? null
      }
      // 监听 tool progress 事件 → 更新 toolParts 状态
      if (dataPart?.type === 'data-tool-progress') {
        const data = dataPart?.data as Record<string, unknown> | undefined
        const toolCallId = typeof data?.toolCallId === 'string' ? data.toolCallId : ''
        const event = typeof data?.event === 'string' ? data.event : ''
        if (!toolCallId || !event) return
        if (event === 'start') {
          upsertToolPart(toolCallId, {
            toolProgress: {
              status: 'active',
              label: typeof data?.label === 'string' ? data.label : undefined,
              accumulatedText: '',
            },
          })
        } else if (event === 'delta') {
          const deltaText = typeof data?.text === 'string' ? data.text : ''
          setToolParts(prev => {
            const current = prev[toolCallId] ?? {}
            const currentProgress = (current as any)?.toolProgress as Record<string, unknown> | undefined
            const prevText = typeof currentProgress?.accumulatedText === 'string'
              ? currentProgress.accumulatedText : ''
            return {
              ...prev,
              [toolCallId]: {
                ...current,
                toolProgress: {
                  ...currentProgress,
                  status: 'active',
                  accumulatedText: prevText + deltaText,
                },
              },
            }
          })
        } else if (event === 'done') {
          setToolParts(prev => {
            const current = prev[toolCallId] ?? {}
            const currentProgress = (current as any)?.toolProgress as Record<string, unknown> | undefined
            return {
              ...prev,
              [toolCallId]: {
                ...current,
                toolProgress: {
                  ...currentProgress,
                  status: 'done',
                  summary: typeof data?.summary === 'string' ? data.summary : undefined,
                },
              },
            }
          })
        } else if (event === 'error') {
          setToolParts(prev => {
            const current = prev[toolCallId] ?? {}
            const currentProgress = (current as any)?.toolProgress as Record<string, unknown> | undefined
            return {
              ...prev,
              [toolCallId]: {
                ...current,
                toolProgress: {
                  ...currentProgress,
                  status: 'error',
                  errorText: typeof data?.errorText === 'string' ? data.errorText : undefined,
                },
              },
            }
          })
        }
      }
      // 监听审批请求
      if (dataPart?.type === 'tool-approval-request' && approvalStrategy !== 'manual') {
        const approvalId = dataPart?.data?.approvalId ?? dataPart?.approvalId
        if (approvalId) {
          const approved = approvalStrategy === 'approve-all'
          setTimeout(() => {
            chat.addToolApprovalResponse({ id: approvalId, approved })
          }, 100)
        }
      }
    },
  })

  chatRef.current = chat

  // ── Auto-send prompt on mount ──
  React.useEffect(() => {
    if (promptSentRef.current) return
    promptSentRef.current = true
    startTimeRef.current = Date.now()
    startedAtRef.current = new Date().toISOString()
    requestAnimationFrame(() => {
      chatRef.current.sendMessage({
        parts: [{ type: 'text' as const, text: prompt }],
      })
    })
    // 设置会话标题（fire-and-forget）
    if (title) {
      fetch(`${serverUrl}/trpc/chat.updateSession`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-OpenLoaf-Client': '1' },
        body: JSON.stringify({ '0': { json: { sessionId, title, isUserRename: true } } }),
      }).catch(() => {})
    }
  }, [prompt, title, serverUrl, sessionId])

  // ── Handle error state → auto-retry network errors via UI Retry button ──
  React.useEffect(() => {
    if (chat.status !== 'error' && !chat.error) return
    if (onCompleteCalledRef.current) return

    const errorMsg = chat.error?.message ?? ''
    const isNetworkError = /failed to fetch|network|ECONNREFUSED|ENOTFOUND|ERR_CONNECTION/i.test(errorMsg)

    // 网络错误 + 重试次数未满 → 延迟后点击 Retry 按钮
    if (isNetworkError && networkRetryCountRef.current < MAX_NETWORK_RETRIES) {
      const attempt = networkRetryCountRef.current + 1
      console.log(`[ChatProbe] Network error detected, clicking Retry ${attempt}/${MAX_NETWORK_RETRIES} in ${NETWORK_RETRY_DELAY_MS / 1000}s: ${errorMsg}`)
      const timer = setTimeout(() => {
        if (onCompleteCalledRef.current) return
        networkRetryCountRef.current = attempt
        const retryBtn = document.querySelector('[data-testid="message-error-retry"]') as HTMLButtonElement | null
        if (retryBtn && !retryBtn.disabled) {
          retryBtn.click()
        } else {
          // 按钮未渲染时 fallback 到 API 调用
          console.warn('[ChatProbe] Retry button not found, falling back to API')
          chatRef.current.clearError()
          setTimeout(() => chatRef.current.regenerate(), 500)
        }
      }, NETWORK_RETRY_DELAY_MS)
      return () => clearTimeout(timer)
    }

    // 非网络错误或重试耗尽 → 报告失败
    const timer = setTimeout(() => {
      if (onCompleteCalledRef.current) return
      onCompleteCalledRef.current = true
      const elapsedMs = Date.now() - startTimeRef.current
      const toolCalls = extractToolCalls(chat.messages)
      const toolCallDetails = extractToolCallDetails(chat.messages)
      const retryInfo = networkRetryCountRef.current > 0
        ? ` (after ${networkRetryCountRef.current} network retries)`
        : ''
      const result: ProbeResult = {
        sessionId,
        messages: chat.messages as UIMessage[],
        status: 'error',
        toolCalls,
        toolCallDetails,
        elapsedMs,
        finishReason: finishReasonRef.current,
        error: `${chat.error?.message}${retryInfo}`,
        textPreview: '',
        startedAt: startedAtRef.current,
        turnIndex: turnIndexRef.current,
        totalTurns,
      }
      writeResultToDOM(result)
      onComplete?.(result)
    }, 200)
    return () => clearTimeout(timer)
  }, [chat.status, chat.error, chat.messages, sessionId, onComplete])

  // ── Auto-approve tool calls from message parts ──
  React.useEffect(() => {
    if (approvalStrategy === 'manual') return
    const messages = chat.messages as UIMessage[]
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg || lastMsg.role !== 'assistant') return

    const parts = Array.isArray(lastMsg.parts) ? lastMsg.parts : []
    for (const part of parts) {
      const approval = (part as any)?.approval
      if (approval?.id && approval.approved === undefined) {
        const approved = approvalStrategy === 'approve-all'
        chat.addToolApprovalResponse({ id: approval.id, approved })
      }
    }
  }, [chat.messages, approvalStrategy, chat.addToolApprovalResponse])

  // ── Re-check completion when messages update (tools may have finished) ──
  React.useEffect(() => {
    if (onCompleteCalledRef.current) return
    if (!finishFiredRef.current) return
    if (chat.status !== 'ready') return
    tryReportComplete(chat.messages as UIMessage[])
  }, [chat.messages, chat.status, tryReportComplete])

  // ── Tool parts tracking ──
  const upsertToolPart = React.useCallback((toolCallId: string, next: ToolPartSnapshot) => {
    setToolParts(prev => ({ ...prev, [toolCallId]: { ...prev[toolCallId], ...next } }))
  }, [])

  const markToolStreaming = React.useCallback((toolCallId: string) => {
    setToolParts(prev => ({
      ...prev,
      [toolCallId]: { ...prev[toolCallId], state: 'output-streaming', streaming: true },
    }))
  }, [])

  // ── Stable action wrappers ──
  const stableSendMessage = React.useCallback(
    (...args: Parameters<typeof chat.sendMessage>) => chatRef.current.sendMessage(...args),
    [],
  )
  const stableRegenerate = React.useCallback(
    (...args: Parameters<typeof chat.regenerate>) => chatRef.current.regenerate(...args),
    [],
  )
  const stableAddToolApprovalResponse = React.useCallback(
    (...args: Parameters<typeof chat.addToolApprovalResponse>) =>
      chatRef.current.addToolApprovalResponse(...args),
    [],
  )
  const stableClearError = React.useCallback(() => chatRef.current.clearError(), [])
  const stableStop = React.useCallback(() => chatRef.current.stop(), [])

  // ── Context values ──
  const stateValue = React.useMemo(
    () => ({
      messages: chat.messages as UIMessage[],
      status: chat.status,
      error: chat.error,
      isHistoryLoading: false,
      stepThinking: false,
      pendingCloudMessage: null,
    }),
    [chat.messages, chat.status, chat.error],
  )

  const sessionValue = React.useMemo(
    () => ({
      sessionId,
      tabId,
      projectId: undefined,
      leafMessageId: null,
      branchMessageIds: [] as string[],
      siblingNav: {} as Record<string, any>,
    }),
    [sessionId, tabId],
  )

  const actionsValue = React.useMemo(
    () => ({
      sendMessage: stableSendMessage,
      regenerate: stableRegenerate,
      addToolApprovalResponse: stableAddToolApprovalResponse,
      clearError: stableClearError,
      stopGenerating: stableStop,
      updateMessage: () => {},
      newSession: () => {},
      selectSession: () => {},
      switchSibling: () => {},
      retryAssistantMessage: () => {},
      continueAssistantTurn: () => {},
      resendUserMessage: () => {},
      deleteMessageSubtree: async () => false,
      setPendingCloudMessage: () => {},
      sendPendingCloudMessage: () => {},
    }),
    [stableSendMessage, stableRegenerate, stableAddToolApprovalResponse, stableClearError, stableStop],
  )

  const [input, setInput] = React.useState('')
  const optionsValue = React.useMemo(
    () => ({
      input,
      setInput,
      imageOptions: undefined,
      setImageOptions: () => {},
      codexOptions: undefined,
      setCodexOptions: () => {},
      claudeCodeOptions: undefined,
      setClaudeCodeOptions: () => {},
    }),
    [input],
  )

  const toolsValue = React.useMemo(
    () => ({
      toolParts,
      upsertToolPart,
      markToolStreaming,
      queueToolApprovalPayload: () => {},
      clearToolApprovalPayload: () => {},
      continueAfterToolApprovals: () => {},
    }),
    [toolParts, upsertToolPart, markToolStreaming],
  )

  // ── Derive status for test assertions ──
  // 多轮对话场景：第一轮完成时 chat.status='ready' 但还有后续轮次，
  // 此时不能标记 complete，否则 waitForChatComplete 会提前 resolve。
  // 同时，如果有工具还在 pending（approval-requested / approval-responded 但无 output），
  // 也不能标记 complete — server 还会继续 stream。
  const hasPending = hasPendingToolExecution(chat.messages)
  const probeStatus = chat.status === 'error'
    ? 'error'
    : hasPending
      ? 'streaming'
      : allTurnsDone && chat.status === 'ready' && chat.messages.length > 1
        ? 'complete'
        : totalTurns === 1 && chat.status === 'ready' && chat.messages.length > 1
          ? 'complete'
          : chat.status

  return (
    <ChatStateProvider value={stateValue}>
      <ChatSessionProvider value={sessionValue}>
        <ChatActionsProvider value={actionsValue}>
          <ChatOptionsProvider value={optionsValue}>
            <ChatToolProvider value={toolsValue}>
              <div
                className={className}
                data-testid="chat-probe-harness"
                data-probe-status={probeStatus}
                data-probe-session-id={sessionId}
                data-probe-message-count={chat.messages.length}
                style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}
              >
                {/* 状态栏 */}
                <div
                  data-testid="probe-status-bar"
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    borderBottom: '1px solid var(--border, #e5e7eb)',
                    display: 'flex',
                    gap: '16px',
                    flexShrink: 0,
                    background: 'var(--muted, #f8fafc)',
                  }}
                >
                  <span>Status: <strong data-testid="probe-status">{probeStatus}</strong></span>
                  <span>Messages: <strong>{chat.messages.length}</strong></span>
                  <span>Session: <code style={{ fontSize: '11px' }}>{sessionId}</code></span>
                  {chatModelId && <span>Model: <code style={{ fontSize: '11px' }}>{chatModelId}</code></span>}
                  {chat.error && (
                    <span style={{ color: 'var(--destructive, #dc2626)' }}>
                      Error: {chat.error.message}
                    </span>
                  )}
                </div>

                {/* ProbeResult JSON（隐藏，供测试读取） */}
                <script
                  id="probe-result-json"
                  type="application/json"
                  data-testid="probe-result-json"
                  suppressHydrationWarning
                />

                {/* 消息列表 — 真实生产组件 */}
                <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                  <MessageList />
                </div>
              </div>
            </ChatToolProvider>
          </ChatOptionsProvider>
        </ChatActionsProvider>
      </ChatSessionProvider>
    </ChatStateProvider>
  )
}

// ── Main export ──

export default function ChatProbeHarness(props: ChatProbeHarnessProps) {
  const queryClient = React.useMemo(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  }), [])

  return (
    <QueryClientProvider client={queryClient}>
      <TabActiveProvider active={true}>
        <ChatProbeInner {...props} />
      </TabActiveProvider>
    </QueryClientProvider>
  )
}

// ── Utils ──

function extractToolCalls(messages: any[]): string[] {
  const toolNames = new Set<string>()
  for (const msg of messages) {
    if (msg?.role !== 'assistant') continue
    const parts = Array.isArray(msg?.parts) ? msg.parts : []
    for (const part of parts) {
      // AI SDK v6: toolName 字段（如果存在）
      const explicit = typeof part?.toolName === 'string' ? part.toolName : ''
      if (explicit) { toolNames.add(explicit); continue }
      // OpenLoaf SSE: type 前缀格式 "tool-Bash" → 提取 "Bash"
      const type = typeof part?.type === 'string' ? part.type : ''
      if (type.startsWith('tool-')) {
        const name = type.slice(5)
        if (name) toolNames.add(name)
      }
    }
  }
  return Array.from(toolNames)
}

/**
 * 从 messages 中提取每次 tool invocation 的详细明细。
 *
 * 对每个 tool part 判断是否出错 — 以下任一条件视为报错：
 *   - part.state === 'output-error'
 *   - part.errorText 为非空字符串
 *   - part.output && (output.isError === true 或 output.error 非空或 output.success === false)
 *
 * errorSummary 从 errorText / output.error / output.message / output.text 等字段抓取，截 200 字。
 * turnIndex 以每轮用户消息为分界，第 N 轮 user msg 之后直到下一轮之前的 assistant 消息都属 turn=N。
 */
function extractToolCallDetails(messages: any[]): ToolCallDetail[] {
  const details: ToolCallDetail[] = []
  let turnIndex = -1
  for (const msg of messages) {
    if (msg?.role === 'user') {
      turnIndex += 1
      continue
    }
    if (msg?.role !== 'assistant') continue
    const parts = Array.isArray(msg?.parts) ? msg.parts : []
    for (const part of parts) {
      const type = typeof part?.type === 'string' ? part.type : ''
      const explicit = typeof part?.toolName === 'string' ? part.toolName : ''
      let name = explicit
      if (!name && type.startsWith('tool-')) name = type.slice(5)
      if (!name) continue

      const { hasError, summary } = detectToolError(part)
      details.push({
        name,
        turnIndex: Math.max(0, turnIndex),
        hasError,
        ...(summary ? { errorSummary: summary } : {}),
      })
    }
  }
  return details
}

function detectToolError(part: any): { hasError: boolean, summary?: string } {
  if (!part) return { hasError: false }
  const state = typeof part.state === 'string' ? part.state : ''
  const errorText = typeof part.errorText === 'string' ? part.errorText : ''
  const output = part.output
  const outputIsError = !!(output && typeof output === 'object' && (
    output.isError === true
    || output.success === false
    || (typeof output.error === 'string' && output.error.length > 0)
  ))
  const hasError = state === 'output-error' || errorText.length > 0 || outputIsError
  if (!hasError) return { hasError: false }

  let summary = errorText
  if (!summary && output && typeof output === 'object') {
    if (typeof output.error === 'string') summary = output.error
    else if (typeof output.message === 'string') summary = output.message
    else if (typeof output.text === 'string') summary = output.text
    else {
      try { summary = JSON.stringify(output) } catch { summary = String(output) }
    }
  }
  return { hasError: true, summary: (summary || '').slice(0, 200) }
}

function extractTextPreview(messages: any[], maxLen: number): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== 'assistant') continue
    const parts = Array.isArray(messages[i]?.parts) ? messages[i].parts : []
    const text = parts
      .filter((p: any) => p?.type === 'text')
      .map((p: any) => p?.text ?? '')
      .join('')
    if (text) return text.slice(0, maxLen)
  }
  return ''
}

function writeResultToDOM(result: ProbeResult) {
  const el = document.getElementById('probe-result-json')
  if (el) el.textContent = JSON.stringify(result)
}
