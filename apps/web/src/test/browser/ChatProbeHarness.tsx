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

export type ProbeResult = {
  sessionId: string
  messages: UIMessage[]
  status: 'ok' | 'error'
  toolCalls: string[]
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
  const [toolParts, setToolParts] = React.useState<Record<string, ToolPartSnapshot>>(EMPTY_TOOL_PARTS)

  // ── Multi-turn state ──
  const allPrompts = React.useMemo(() => [prompt, ...followUpPrompts], [prompt, followUpPrompts])
  const totalTurns = allPrompts.length
  const turnIndexRef = React.useRef(0)
  const turnCompleteCountRef = React.useRef(0)

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
          },
          headers: nextHeaders,
        }
      },
    })
  }, [serverUrl, chatModelId])

  // ── useChat ──
  const chat = useChat({
    id: sessionId,
    resume: false,
    experimental_throttle: 100,
    sendAutomaticallyWhen: () => false,
    transport,
    onFinish: () => {
      if (onCompleteCalledRef.current) return
      turnCompleteCountRef.current += 1
      const currentTurn = turnIndexRef.current

      // 还有后续轮次 → 发送下一条 prompt
      if (currentTurn + 1 < totalTurns) {
        turnIndexRef.current = currentTurn + 1
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
      const elapsedMs = Date.now() - startTimeRef.current
      const toolCalls = extractToolCalls(chat.messages)
      const textPreview = extractTextPreview(chat.messages, 600)
      const result: ProbeResult = {
        sessionId,
        messages: chat.messages as UIMessage[],
        status: 'ok',
        toolCalls,
        elapsedMs,
        finishReason: finishReasonRef.current,
        textPreview,
        startedAt: startedAtRef.current,
        turnIndex: currentTurn,
        totalTurns,
      }
      // 写入 DOM 供测试读取
      writeResultToDOM(result)
      onComplete?.(result)
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

  const chatRef = React.useRef(chat)
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

  // ── Handle error state → also report result ──
  React.useEffect(() => {
    if (chat.status !== 'error' && !chat.error) return
    if (onCompleteCalledRef.current) return
    // 延迟一帧确保 error 状态稳定
    const timer = setTimeout(() => {
      if (onCompleteCalledRef.current) return
      onCompleteCalledRef.current = true
      const elapsedMs = Date.now() - startTimeRef.current
      const toolCalls = extractToolCalls(chat.messages)
      const result: ProbeResult = {
        sessionId,
        messages: chat.messages as UIMessage[],
        status: 'error',
        toolCalls,
        elapsedMs,
        finishReason: finishReasonRef.current,
        error: chat.error?.message,
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
  const probeStatus = chat.status === 'ready' && chat.messages.length > 1
    ? 'complete'
    : chat.status === 'error'
      ? 'error'
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
