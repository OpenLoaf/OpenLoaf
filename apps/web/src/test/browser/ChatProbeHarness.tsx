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
import {
  installProbeObservers,
  drainProbeObservers,
  type ProbeConsoleEntry,
  type ProbeNetworkEntry,
} from './probe-observers'

// ── 由 vitest.browser.config.ts `define` 注入的全局：`pnpm test:browser:run --model <id>`
// 覆盖测试文件里硬编码的 chatModelId / chatModelSource。空字符串 = 未覆盖。
declare const __BROWSER_TEST_MODEL_OVERRIDE__: string
declare const __BROWSER_TEST_MODEL_SOURCE_OVERRIDE__: string
// 提示词语言 override。默认 'en'（测试稳定性更高，避免某些模型中文 prompt 下
// tool-use 幻觉率高）；可通过 runner `--prompt-lang zh` 切换。空字符串 = 未设置。
declare const __BROWSER_TEST_PROMPT_LANG_OVERRIDE__: string

function readModelOverride(): { id: string | null; source: 'local' | 'cloud' | 'saas' | null } {
  try {
    const id = typeof __BROWSER_TEST_MODEL_OVERRIDE__ === 'string' ? __BROWSER_TEST_MODEL_OVERRIDE__ : ''
    const src = typeof __BROWSER_TEST_MODEL_SOURCE_OVERRIDE__ === 'string' ? __BROWSER_TEST_MODEL_SOURCE_OVERRIDE__ : ''
    const source = src === 'local' || src === 'cloud' || src === 'saas' ? src : null
    return { id: id || null, source }
  } catch {
    return { id: null, source: null }
  }
}

function readPromptLangOverride(): 'zh' | 'en' | null {
  try {
    const v = typeof __BROWSER_TEST_PROMPT_LANG_OVERRIDE__ === 'string' ? __BROWSER_TEST_PROMPT_LANG_OVERRIDE__ : ''
    return v === 'zh' || v === 'en' ? v : null
  } catch {
    return null
  }
}

// ── i18n ──
import i18n from '@/i18n/index'
// 强制所有浏览器测试使用中文环境，保证 i18n 相关视觉断言（如 Thinking shimmer 文案）
// 不受 Chromium 默认系统语言影响。
try {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('openloaf-ui-language', 'zh-CN')
    // 默认收起 Vitest runner UI 的左侧测试列表 + 右侧 Dashboard 由
    // vitest.browser.config.ts 的 context.storageState 预置，见那里注释。
  }
} catch { /* localStorage 不可用时忽略，下面 changeLanguage 直接切换运行时 */ }
void i18n.changeLanguage('zh-CN')
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
  /**
   * 会话标题（设置后会通过 tRPC 重命名会话，如 "007 — 大 PDF 分段读..."）。
   * - 不传：默认用 vitest 当前测试名（`it('xxx', ...)` 第一参数），保持测试报告与历史记录一致
   * - 传 `null`：显式跳过标题设置，让 autoTitle 能接管（仅 036 之类专门测 autoTitle 的用例需要）
   * - 传字符串：强制使用该值
   */
  title?: string | null
  /** 指定模型 ID（如 qwen:OL-TX-006），格式 <providerId>:<modelId> */
  chatModelId?: string
  /** 模型来源（local/cloud/saas），云端模型必须传 'cloud' */
  chatModelSource?: 'local' | 'cloud' | 'saas'
  /**
   * 请求级覆盖系统提示词语言。runner 的 `--prompt-lang` 参数会通过
   * `__BROWSER_TEST_PROMPT_LANG_OVERRIDE__` 全局覆盖此 prop。默认 `'en'`。
   */
  chatPromptLanguage?: 'zh' | 'en'
  /** 工具审批策略 */
  approvalStrategy?: ApprovalStrategy
  /** AI 提问的自动回答映射 */
  questionAnswers?: Record<string, string>
  /** 完成回调（含完整结果） */
  onComplete?: (result: ProbeResult) => void
  /** 额外的 CSS class */
  className?: string
  /**
   * Cloud 工具 mock/capture 配置。
   * - mode='auto'（默认有效，需传 testCase）：有 fingerprint 匹配的 fixture 则 mock 短路，
   *   否则 capture 本次真实调用结果到 skill fixture 目录。
   * - mode='capture'：强制采集（即使有可用 fixture 也真跑一次并刷新）。
   * - mode='mock'：强制 mock（无可用 fixture 则测试失败）。
   * - mode='off' 或不传 cloudMock：维持原样，不介入。
   *
   * 传 `testCase` 才会激活，保持对历史测试零影响。
   */
  cloudMock?: {
    testCase: string
    mode?: 'auto' | 'capture' | 'mock' | 'off'
    fixtureId?: string
  }
}

export type ToolCallDetail = {
  /** 工具名（如 CloudImageGenerate） */
  name: string
  /** 该 tool 所在 assistant 消息对应的第几轮用户输入（0-based） */
  turnIndex: number
  /** 是否报错（output.isError / state === 'output-error' / errorText 非空等） */
  hasError: boolean
  /** 错误摘要（从 output.error / errorText / output.message 等字段抓取，最多 200 字） */
  errorSummary?: string
  /** AI SDK tool part 状态：input-available / output-available / output-error 等 */
  state?: string
  /** 工具入参（截断到 1KB，防报告爆表） */
  input?: unknown
  /** 工具返回值（截断到 2KB，string 也保留方便看到 400 payload） */
  output?: unknown
}

export type ProbeResult = {
  sessionId: string
  messages: UIMessage[]
  status: 'ok' | 'error'
  toolCalls: string[]
  /** 每次 tool invocation 的详细明细（含 error 状态），供 evaluator 直接读取 */
  toolCallDetails: ToolCallDetail[]
  /** 工具调用失败总数 — 任一 `hasError=true` 的工具都计入。默认测试断言期望此值为 0。 */
  toolErrorCount: number
  elapsedMs: number
  finishReason: string | null
  error?: string
  textPreview: string
  startedAt: string
  /** 多轮对话中当前是第几轮（0-based），单轮对话为 0 */
  turnIndex: number
  /** 总轮数 */
  totalTurns: number
  /** 浏览器 console 记录（installProbeObservers 自动采集，最多 500 条） */
  consoleLogs?: ProbeConsoleEntry[]
  /** 浏览器 fetch 请求记录（installProbeObservers 自动采集，最多 300 条） */
  networkRequests?: ProbeNetworkEntry[]
  /**
   * 本次 probe 消耗的 SaaS 积分总和（多轮对话会累加每轮 assistant 消息的
   * metadata.openloaf.creditsConsumed）。
   * 后端在 buildTimingMetadata 里通过 getCreditsConsumed() 写入每条 assistant
   * 消息的 metadata；每次 HTTP 请求是独立的 request-scoped context，所以多轮
   * 之间需要我们自己累加。
   */
  creditsConsumed?: number
  /**
   * 本次 probe 实际发给后端的 chatModelId / chatModelSource（应用 --model override 后的值）。
   * 让 saveTestData / recordProbeRun 在测试作者没显式传 `model` 时也能拿到真实使用的模型，
   * 索引主页据此显示 Model 徽章。
   */
  chatModelId?: string
  chatModelSource?: 'local' | 'cloud' | 'saas'
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
/** Whether any assistant message carries an unresolved approval request. */
function hasPendingApprovalRequest(messages: any[]): boolean {
  for (const msg of messages) {
    if (msg?.role !== 'assistant') continue
    const parts = Array.isArray(msg?.parts) ? msg.parts : []
    for (const part of parts) {
      const state = part?.state
      if (state !== 'approval-requested') continue
      const approved = part?.approval?.approved
      if (approved === true || approved === false) continue
      return true
    }
  }
  return false
}

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

/**
 * 检查最后一条 assistant 消息是否还有流中的正文内容。
 *
 * AI SDK 的 onFinish 回调在极少数情况下会先于 messages 的最终 reconcile：
 * - reasoning part 的 state 仍是 "streaming"
 * - 尚未出现任何 text part（模型还没吐正文，只是 reasoning 阶段中间 flush 一次）
 *
 * 这种状态下直接写 ProbeResult 会拿到空 textPreview，后续 text part 即使
 * 稍后补齐也会被 onCompleteCalledRef 锁死。
 *
 * 规则：最后一条 assistant 消息必须同时满足——
 *   1) 所有 reasoning part 都已离开 "streaming" 态
 *   2) 所有 text part 都已离开 "streaming" 态（否则 textPreview 会被截断）
 *   3) 至少存在一个 text part（或 tool part，让 tool-only 场景也能通过）
 */
function hasPendingStreamingContent(messages: any[]): boolean {
  let lastAssistant: any = null
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') { lastAssistant = messages[i]; break }
  }
  if (!lastAssistant) return false
  const parts = Array.isArray(lastAssistant?.parts) ? lastAssistant.parts : []

  let hasTextOrTool = false
  for (const part of parts) {
    const type = typeof part?.type === 'string' ? part.type : ''
    if (type === 'reasoning' && part?.state === 'streaming') return true
    if (type === 'text' && part?.state === 'streaming') return true
    if (type === 'text' && typeof part?.text === 'string' && part.text.length > 0) hasTextOrTool = true
    if (type.startsWith('tool-')) hasTextOrTool = true
  }
  return !hasTextOrTool
}

// ── Inner harness ──

function ChatProbeInner({
  serverUrl,
  prompt,
  followUpPrompts = [],
  sessionId: sessionIdProp,
  title,
  chatModelId: chatModelIdProp,
  chatModelSource: chatModelSourceProp,
  chatPromptLanguage: chatPromptLanguageProp,
  approvalStrategy = 'manual',
  questionAnswers: _questionAnswers,
  onComplete,
  className,
  cloudMock,
}: ChatProbeHarnessProps) {
  // runner --model 的覆盖优先级最高：写了就盖掉测试文件里硬编码的 prop。
  // 覆盖只作用于运行时发给 server 的 chatModelId，不改测试 recordProbeRun 里
  // 传的 model 字段（那仍表示测试作者的"设计意图"）。
  const modelOverride = React.useMemo(() => readModelOverride(), [])
  const chatModelId = modelOverride.id ?? chatModelIdProp
  const chatModelSource = modelOverride.source ?? chatModelSourceProp
  // 提示词语言：runner env override > 测试 prop > 默认 'en'（测试稳定性更高）。
  const chatPromptLanguage: 'zh' | 'en' = readPromptLangOverride() ?? chatPromptLanguageProp ?? 'en'
  const sessionId = React.useMemo(
    () => sessionIdProp || generateSessionId(),
    [sessionIdProp],
  )
  const tabId = React.useMemo(() => `probe_${sessionId}`, [sessionId])

  // title 解析规则：
  //   - title === null        → 显式禁用（autoTitle 测试用例走这条）
  //   - title 是非空字符串    → 强制使用
  //   - title 未传 / ''       → fallback 到 window.__probeTestName（由 probe-setup.ts 的
  //                            beforeEach 从 ctx.task.name 注入），保持历史记录与测试报告一致
  const resolvedTitle = React.useMemo(() => {
    if (title === null) return undefined
    if (typeof title === 'string' && title.length > 0) return title
    if (typeof window !== 'undefined') {
      const name = window.__probeTestName
      if (typeof name === 'string' && name.length > 0) return name
    }
    return undefined
  }, [title])
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
        // 中文注释：server saveLastMessageAndResolveParent 对 assistant 续发
        // 强制要求 lastMessage.parentMessageId。AI SDK 内存 UIMessage 不带该字段，
        // 这里从线性序列里最近一条 user message 推导注入（harness 只有一轮对话，
        // 这是安全的）。缺了这一步会让续发返回 400 "assistant 缺少 parentMessageId"。
        let lastWithParent: any = lastMessage
        if (lastMessage && (lastMessage as any).role === 'assistant' && !(lastMessage as any).parentMessageId) {
          for (let i = messages.length - 2; i >= 0; i--) {
            const m = messages[i] as any
            if (m?.role === 'user' && typeof m?.id === 'string') {
              lastWithParent = { ...(lastMessage as any), parentMessageId: m.id }
              break
            }
          }
        }
        return {
          body: {
            ...restBody,
            sessionId: sessionIdRef.current ?? id,
            messageId,
            intent: 'chat',
            responseMode: 'stream',
            clientPlatform: 'web' as const,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            messages: lastWithParent ? [lastWithParent] : [],
            ...(chatModelId ? { chatModelId } : {}),
            ...(chatModelSource ? { chatModelSource } : {}),
            promptLanguage: chatPromptLanguage,
            ...(approvalStrategy === 'approve-all' ? { autoApproveTools: true } : {}),
          },
          headers: nextHeaders,
        }
      },
    })
  }, [serverUrl, chatModelId, chatModelSource])

  // ── Install console / fetch observers (idempotent) ──
  // 必须在第一次 sendMessage 之前装上，才能抓到 cloudMock 握手之前的日志。
  React.useEffect(() => {
    installProbeObservers()
  }, [])

  // ── Completion logic ──
  // 提取到独立函数：只在 onFinish 触发过 + 无 pending 工具 时才真正完成。
  // 这样即使 onFinish 在 tool approval 暂停点过早触发，也不会导致提前完成。
  const tryReportComplete = React.useCallback(async (msgs: UIMessage[]) => {
    if (onCompleteCalledRef.current) return
    if (!finishFiredRef.current) return
    if (hasPendingToolExecution(msgs)) return
    if (hasPendingStreamingContent(msgs)) return

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

    // 设置会话标题（此时 session 已由 saveMessage 创建，可以安全 update）。
    // 之前在 mount effect 并行 fetch，session 尚未创建 → prisma.update 抛 P2025 →
    // fire-and-forget .catch 静默失败 → 历史记录只能看到 saveMessage 写入的
    // prompt 前缀。挪到这里保证 session 已存在；isUserRename=true 阻止后续 autoTitle 覆盖。
    //
    // `?batch=1` 与 body `{"0":{json:...}}` 必须配套 —— 否则 tRPC 会把整个 body
    // 当成单 call input 去走 SuperJSON 解析，返回 400（和 fetchAutoTitle command 同样陷阱）。
    if (resolvedTitle) {
      try {
        await fetch(`${serverUrl}/trpc/chat.updateSession?batch=1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-OpenLoaf-Client': '1' },
          body: JSON.stringify({ '0': { json: { sessionId, title: resolvedTitle, isUserRename: true } } }),
        })
      } catch {
        // 非关键操作：title 写入失败不影响测试断言
      }
    }

    const elapsedMs = Date.now() - startTimeRef.current
    const toolCalls = extractToolCalls(msgs)
    const toolCallDetails = extractToolCallDetails(msgs)
    const toolErrorCount = toolCallDetails.filter(t => t.hasError).length
    const textPreview = extractTextPreview(msgs, 2000)
    const creditsConsumed = extractCreditsConsumed(msgs)
    const observed = drainProbeObservers()
    const result: ProbeResult = {
      sessionId,
      messages: msgs,
      status: 'ok',
      toolCalls,
      toolCallDetails,
      toolErrorCount,
      elapsedMs,
      finishReason: finishReasonRef.current,
      textPreview,
      startedAt: startedAtRef.current,
      turnIndex: currentTurn,
      totalTurns,
      consoleLogs: observed.console,
      networkRequests: observed.network,
      ...(creditsConsumed > 0 ? { creditsConsumed } : {}),
      ...(chatModelId ? { chatModelId } : {}),
      ...(chatModelSource ? { chatModelSource } : {}),
    }
    writeResultToDOM(result)
    onComplete?.(result)
  }, [sessionId, totalTurns, allPrompts, onComplete, serverUrl, resolvedTitle, chatModelId, chatModelSource])

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
  // 如果配置了 cloudMock，先完成 mock/capture 注册再发 prompt，避免时序竞争。
  React.useEffect(() => {
    if (promptSentRef.current) return
    promptSentRef.current = true
    startTimeRef.current = Date.now()
    startedAtRef.current = new Date().toISOString()
    const sessionIdSnap = sessionId

    async function setupCloudMockAndSend() {
      if (cloudMock?.testCase && cloudMock.mode !== 'off') {
        try {
          // 动态 import 避免非 browser-test 环境报错
          const mod = await import('@vitest/browser/context')
          const commands = (mod as any).commands
          const dirs = await commands.resolveCloudMockDirs({
            testCase: cloudMock.testCase, prompt,
          })
          const candidates: Array<{ fixtureId: string; path: string; fingerprintMatches: boolean; hasToolResult: boolean; promptHash: string }> = dirs.candidates ?? []
          const matched = cloudMock.fixtureId
            ? candidates.find((c) => c.fixtureId === cloudMock.fixtureId && c.hasToolResult)
            : candidates.find((c) => c.fingerprintMatches && c.hasToolResult && c.promptHash === dirs.promptHash)
              ?? candidates.find((c) => c.fingerprintMatches && c.hasToolResult)

          const mode = cloudMock.mode ?? 'auto'
          const wantMock = mode === 'mock' || (mode === 'auto' && matched)
          const wantCapture = mode === 'capture' || (mode === 'auto' && !matched)

          // 先探测 mock 端点是否可用（server 没带 OPENLOAF_CLOUD_MOCK=1 启动时路由不会注册）
          const ping = await fetch(`${serverUrl}/debug/cloud-mock/ping`, { method: 'GET' })
          if (!ping.ok) {
            const msg = `cloudMock: /debug/cloud-mock not registered (status=${ping.status}). Restart server with OPENLOAF_CLOUD_MOCK=1.`
            if (mode === 'mock') throw new Error(msg)
            console.warn(`[cloudMock] ${msg} (mode=${mode} — continuing without mock/capture)`)
            requestAnimationFrame(() => {
              chatRef.current.sendMessage({
                parts: [{ type: 'text' as const, text: prompt }],
              })
            })
            return
          }

          if (wantMock) {
            if (!matched) throw new Error(`cloudMock mode=${mode} but no usable fixture`)
            const r = await fetch(`${serverUrl}/debug/cloud-mock`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-OpenLoaf-Client': '1' },
              body: JSON.stringify({
                action: 'set-mock',
                sessionId: sessionIdSnap,
                fixtureDir: matched.path,
              }),
            })
            if (!r.ok) throw new Error(`set-mock failed: ${r.status} ${await r.text()}`)
            console.log(`[cloudMock] session=${sessionIdSnap} → mock fixture ${matched.fixtureId}`)
          } else if (wantCapture) {
            const r = await fetch(`${serverUrl}/debug/cloud-mock`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-OpenLoaf-Client': '1' },
              body: JSON.stringify({
                action: 'set-capture',
                sessionId: sessionIdSnap,
                captureDir: dirs.captureDir,
                meta: {
                  testCase: cloudMock.testCase,
                  fingerprint: dirs.fingerprint,
                  promptHash: dirs.promptHash,
                  prompt,
                  sessionId: sessionIdSnap,
                },
              }),
            })
            if (!r.ok) throw new Error(`set-capture failed: ${r.status} ${await r.text()}`)
            console.log(`[cloudMock] session=${sessionIdSnap} → capture to ${dirs.fixtureId}`)
          }
        } catch (err) {
          if (cloudMock.mode === 'mock') {
            // force-mock 必须成功，否则会浪费积分走真调
            throw err
          }
          console.warn('[cloudMock] setup failed:', err)
        }
      }
      requestAnimationFrame(() => {
        chatRef.current.sendMessage({
          parts: [{ type: 'text' as const, text: prompt }],
        })
      })
    }

    void setupCloudMockAndSend()

    // 注：会话标题的 updateSession 调用挪到 tryReportComplete（全部轮次结束后），
    // 因为此时 session 已由 saveMessage 创建，prisma.update 不会抛 P2025。

    // unmount 时清理 cloudMock 状态
    return () => {
      if (cloudMock?.testCase && cloudMock.mode !== 'off') {
        fetch(`${serverUrl}/debug/cloud-mock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-OpenLoaf-Client': '1' },
          body: JSON.stringify({ action: 'clear', sessionId: sessionIdSnap }),
        }).catch(() => {})
      }
    }
  }, [prompt, serverUrl, sessionId, cloudMock])

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
      const observed = drainProbeObservers()
      const creditsConsumed = extractCreditsConsumed(chat.messages as any[])
      const result: ProbeResult = {
        sessionId,
        messages: chat.messages as UIMessage[],
        status: 'error',
        toolCalls,
        toolCallDetails,
        toolErrorCount: toolCallDetails.filter(t => t.hasError).length,
        elapsedMs,
        finishReason: finishReasonRef.current,
        error: `${chat.error?.message}${retryInfo}`,
        textPreview: '',
        startedAt: startedAtRef.current,
        turnIndex: turnIndexRef.current,
        totalTurns,
        consoleLogs: observed.console,
        networkRequests: observed.network,
        ...(creditsConsumed > 0 ? { creditsConsumed } : {}),
        ...(chatModelId ? { chatModelId } : {}),
        ...(chatModelSource ? { chatModelSource } : {}),
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
  // 中文注释：harness 之前把 updateMessage 留作 noop，导致
  // ToolApprovalActions.updateApprovalInMessages / handleReject 写回的
  // approval.approved / state 变化在 React state 里彻底丢失——UI 保持 pending。
  // 这里最小实装：用 useChat 暴露的 setMessages 合并目标 message 的 parts。
  const stableUpdateMessage = React.useCallback(
    (messageId: string, patch: { parts?: unknown }) => {
      chatRef.current.setMessages((prev: any) =>
        prev.map((m: any) =>
          m.id === messageId && patch?.parts
            ? ({ ...m, parts: patch.parts } as any)
            : m,
        ),
      )
    },
    [],
  )
  // 中文注释：把 setMessages / updateMessage 通过 window 暴露给 *.browser.tsx 测试，
  // 用于绕开 handleReject 里 continueAfterToolApprovals(regenerate) 覆盖本地 parts
  // 的副作用（regenerate 会把 assistant parts 刷回 pending），只做本地 approval 状
  // 态注入：part.approval.approved=false + part.state='output-denied'。
  React.useEffect(() => {
    if (typeof window === 'undefined') return
    // 读取 useChat 的内存消息（approval-requested 态 assistant 消息可能还没落 DB，
    // 直接走 trpc.chat.getSessionMessages 会查不到；用内存快照避免时序 flaky）。
    ;(window as any).__probe_getMessages = () => {
      try { return JSON.parse(JSON.stringify(chatRef.current.messages ?? [])) }
      catch { return [] }
    }
    ;(window as any).__probe_markApprovalDenied = (approvalId: string) => {
      chatRef.current.setMessages((prev: any) =>
        prev.map((m: any) => {
          if (!Array.isArray(m?.parts)) return m
          let hit = false
          const nextParts = m.parts.map((p: any) => {
            if (p?.approval?.id !== approvalId) return p
            hit = true
            return {
              ...p,
              state: 'output-denied',
              approval: { ...p.approval, approved: false },
            }
          })
          return hit ? { ...m, parts: nextParts } : m
        }),
      )
    }
    return () => {
      delete (window as any).__probe_markApprovalDenied
      delete (window as any).__probe_getMessages
    }
  }, [])

  // ── Context values ──
  // 中文注释：approval-requested 状态下 stream 在服务端挂起，但 useChat 的 status
  // 可能还维持 'streaming'。这会让 ToolApprovalActions 的 Approve/Reject 按钮
  // `disabled`，测试点不动。此时强制把对外 status 降级为 'ready'，与真实用户看到
  // 的行为一致（卡在审批时按钮必须可点）。
  const hasPendingApproval = React.useMemo(
    () => hasPendingApprovalRequest(chat.messages as UIMessage[]),
    [chat.messages],
  )
  const exposedStatus =
    hasPendingApproval && (chat.status === 'streaming' || chat.status === 'submitted')
      ? 'ready'
      : chat.status
  const stateValue = React.useMemo(
    () => ({
      messages: chat.messages as UIMessage[],
      status: exposedStatus,
      error: chat.error,
      isHistoryLoading: false,
      stepThinking: false,
      pendingCloudMessage: null,
    }),
    [chat.messages, exposedStatus, chat.error],
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
      updateMessage: stableUpdateMessage,
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
    [stableSendMessage, stableRegenerate, stableAddToolApprovalResponse, stableClearError, stableStop, stableUpdateMessage],
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

  // ── Tool approval wiring ──
  // 中文注释：真实产品里 use-chat-approval.ts 在点击 Approve/Reject 后会
  // 1) 把 {approved} payload 塞入 ref
  // 2) 调 chat.sendMessage(undefined, { body: { toolApprovalPayloads } }) 续发
  // harness 之前把这三处都 stub 成 noop，导致拒绝按钮点了之后后端不会收到 payload
  // → LLM 上下文被 stripPendingToolParts 清空 → 表现为"点拒绝没反应"。
  // 这里做最小化还原，让回归测试（如 038）能跑出真实行为。
  const approvalPayloadsRef = React.useRef<Record<string, Record<string, unknown>>>({})
  const approvalSubmitInFlightRef = React.useRef(false)
  const queueToolApprovalPayload = React.useCallback(
    (toolCallId: string, payload: Record<string, unknown>) => {
      if (!toolCallId) return
      approvalPayloadsRef.current[toolCallId] = payload
    },
    [],
  )
  const clearToolApprovalPayload = React.useCallback((toolCallId: string) => {
    if (!toolCallId) return
    delete approvalPayloadsRef.current[toolCallId]
  }, [])
  const continueAfterToolApprovals = React.useCallback(async () => {
    if (approvalSubmitInFlightRef.current) return
    const payloads = { ...approvalPayloadsRef.current }
    if (Object.keys(payloads).length === 0) return
    approvalSubmitInFlightRef.current = true
    try {
      // 中文注释：审批决定后要把 payload 回传服务端继续本条 assistant 消息。
      // 和生产 use-chat-approval.continueAfterToolApprovals 保持一致：
      // chat.sendMessage(undefined, { body: { toolApprovalPayloads } })
      // — regenerate 会把当前 assistant 消息覆盖重生成，反而丢失 approval 上下文。
      // 对齐生产 use-chat-approval.continueAfterToolApprovals：
      //   chat.sendMessage(undefined, { body: { toolApprovalPayloads } })
      // regenerate 会重生成当前 assistant（丢失本轮 approval 上下文），不对。
      await chatRef.current?.sendMessage(undefined as any, {
        body: { toolApprovalPayloads: payloads },
      })
      approvalPayloadsRef.current = {}
    } finally {
      approvalSubmitInFlightRef.current = false
    }
  }, [])

  const toolsValue = React.useMemo(
    () => ({
      toolParts,
      upsertToolPart,
      markToolStreaming,
      queueToolApprovalPayload,
      clearToolApprovalPayload,
      continueAfterToolApprovals,
    }),
    [
      toolParts,
      upsertToolPart,
      markToolStreaming,
      queueToolApprovalPayload,
      clearToolApprovalPayload,
      continueAfterToolApprovals,
    ],
  )

  // ── Derive status for test assertions ──
  // 多轮对话场景：第一轮完成时 chat.status='ready' 但还有后续轮次，
  // 此时不能标记 complete，否则 waitForChatComplete 会提前 resolve。
  // 同时，如果有工具还在 pending（approval-requested / approval-responded 但无 output），
  // 也不能标记 complete — server 还会继续 stream。
  const hasPending = hasPendingToolExecution(chat.messages)
  const hasStreamingContent = hasPendingStreamingContent(chat.messages)
  const probeStatus = chat.status === 'error'
    ? 'error'
    : hasPending || hasStreamingContent
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
                  {chatModelId && (
                    <span>
                      Model: <code style={{ fontSize: '11px' }}>{chatModelId}</code>
                      {modelOverride.id && (
                        <strong style={{ marginLeft: 4, color: 'var(--warning, #d97706)' }}>[--model override]</strong>
                      )}
                    </span>
                  )}
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
      const state = typeof part?.state === 'string' ? part.state : undefined
      const input = truncateForReport(part?.input, 1024)
      const output = truncateForReport(part?.output, 2048)
      details.push({
        name,
        turnIndex: Math.max(0, turnIndex),
        hasError,
        ...(summary ? { errorSummary: summary } : {}),
        ...(state ? { state } : {}),
        ...(input !== undefined ? { input } : {}),
        ...(output !== undefined ? { output } : {}),
      })
    }
  }
  return details
}

/** 把 tool input/output 保留原形结构，只对 string 做长度截断、object 做 JSON 序列化后截断重新解析。 */
function truncateForReport(value: unknown, maxLen: number): unknown {
  if (value === undefined || value === null) return value
  if (typeof value === 'string') {
    return value.length > maxLen ? `${value.slice(0, maxLen)}…[truncated ${value.length - maxLen} chars]` : value
  }
  if (typeof value !== 'object') return value
  try {
    const json = JSON.stringify(value)
    if (json.length <= maxLen) return value
    return `${json.slice(0, maxLen)}…[truncated ${json.length - maxLen} chars]`
  } catch {
    return '[unserializable]'
  }
}

function detectToolError(part: any): { hasError: boolean, summary?: string } {
  if (!part) return { hasError: false }
  const state = typeof part.state === 'string' ? part.state : ''
  const errorText = typeof part.errorText === 'string' ? part.errorText : ''
  const output = part.output

  // 1. AI SDK 标准错误形态：state=output-error / errorText / {isError:true}
  const outputIsErrorObject = !!(output && typeof output === 'object' && (
    output.isError === true
    || output.success === false
    || output.ok === false
    || (typeof output.error === 'string' && output.error.length > 0)
  ))

  // 2. Cloud tool 过去返回纯字符串 "Error: ..."，新版返回 JSON 字符串 {"ok":false,...}。
  //    两种都识别，避免测试看着 pass 实际 cloud 全挂。
  let parsedStringError = false
  let parsedSummary = ''
  if (typeof output === 'string' && output.length > 0) {
    if (output.startsWith('Error: ')) {
      parsedStringError = true
      parsedSummary = output
    } else if (output.startsWith('{')) {
      try {
        const parsed = JSON.parse(output)
        if (parsed && typeof parsed === 'object') {
          if (parsed.ok === false || parsed.success === false || parsed.isError === true
            || (typeof parsed.error === 'string' && parsed.error.length > 0)) {
            parsedStringError = true
            parsedSummary = parsed.error || parsed.message || output
          }
        }
      } catch { /* not JSON, ignore */ }
    }
  }

  const hasError = state === 'output-error' || errorText.length > 0 || outputIsErrorObject || parsedStringError
  if (!hasError) return { hasError: false }

  let summary = errorText || parsedSummary
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

/**
 * 累加所有 assistant 消息的 metadata.openloaf.creditsConsumed。
 *
 * 后端 buildTimingMetadata 在每个 HTTP 请求结束时把 request-scoped 的累计值
 * 写进 assistant message 的 metadata。多轮对话里每轮是独立请求，所以要把
 * 每轮的值加起来才是本次 probe 的总消耗。
 */
function extractCreditsConsumed(messages: any[]): number {
  let sum = 0
  for (const msg of messages) {
    if (msg?.role !== 'assistant') continue
    const v = msg?.metadata?.openloaf?.creditsConsumed
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) sum += v
  }
  return sum
}

function extractTextPreview(messages: any[], maxLen: number): string {
  // 只取"最后一个 tool-* part 之后的 text part"拼接 —— 即模型最终答复。
  // 避免过程性 text（"让我尝试..."、"好的现在..."）占满 maxLen 把最终答案砍掉。
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== 'assistant') continue
    const parts = Array.isArray(messages[i]?.parts) ? messages[i].parts : []
    const finalParts: string[] = []
    for (let j = parts.length - 1; j >= 0; j--) {
      const p = parts[j]
      const t = typeof p?.type === 'string' ? p.type : ''
      if (t.startsWith('tool-')) break
      if (t === 'text' && typeof p?.text === 'string') finalParts.unshift(p.text)
    }
    const text = finalParts.join('')
    if (text) return text.slice(0, maxLen)
    // 兜底：整条消息没 text 紧跟任何 tool（tool-only 或 text-before-tool 场景），退回全部 text
    const fallback = parts
      .filter((p: any) => p?.type === 'text')
      .map((p: any) => p?.text ?? '')
      .join('')
    if (fallback) return fallback.slice(0, maxLen)
  }
  return ''
}

function writeResultToDOM(result: ProbeResult) {
  const el = document.getElementById('probe-result-json')
  if (el) el.textContent = JSON.stringify(result)
}
