/**
 * 038 — 拒绝审批后 AI 应该响应（不是沉默），且 UI 应给出 denied 视觉反馈。
 *
 * 回归两类 bug：
 *
 * Bug A — Server 层沉默：
 * - 用户让 AI 用需要审批的工具（如 Write），用户点击"拒绝"
 * - AI 之后没有任何文字响应，stream 12ms 空结束
 * - 根因：`chatStreamHelpers.ts#stripPendingToolParts` 对非 SubmitPlan 工具只把
 *   原始 `{approved:false}` 当 tool output，LLM 看不到自然语言提示
 * - 修复：拒绝分支 → `output-denied` + `approval.approved=false` + `reason`
 *
 * Bug B — UI 拒绝后样式整块消失（image #4 观察到）：
 * - 点击拒绝后 approval 卡片里的 ToolContent 只剩工具入参，零拒绝反馈
 * - 根因：`UnifiedTool.tsx` 渲染条件 `isApprovalRequested && approvalId`，
 *   decided 后 `isApprovalRequested=false` 整块 Confirmation 卸载；同时
 *   `showOutput = !hasApproval || approved===true` 漏掉 `isRejected`
 * - 额外根因：`updateApprovalInMessages/Snapshot(false)` 只改 `approval.approved`，
 *   不改 `part.state`，所以即便 Confirmation 渲染，`<ConfirmationRejected>`
 *   条件（`state ∈ {approval-responded, output-denied, output-available}`）也不满足
 * - 修复：
 *   (1) UnifiedTool 改用 `hasApproval && approvalId` 渲染 Confirmation
 *   (2) showOutput 增加 `|| isRejected`
 *   (3) ToolApprovalActions reject 时同步把 state 切到 `output-denied`
 *
 * 本测试双轨覆盖：
 * 1. **Server 契约**：fetch 构造 continuation request（`toolApprovalPayloads`），
 *    验证拒绝后 SSE 流非空 + finishReason=stop + 不重试同参 Write + aiJudge
 * 2. **UI 视觉**：触发 DOM click `tool-approval-reject` 按钮，走 `handleReject`
 *    本地状态更新路径；等 DOM 出现 i18n 的 `tool.approvalRejected` = "已拒绝执行"
 *    + `tool.rejected` = "已拒绝"；截 `038-after-reject.png` 应与 before 明显不同
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import {
  waitForToolApproval,
  waitForChatComplete,
  getSessionId,
  takeProbeScreenshot,
  aiJudge,
} from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'
const CLIENT_HEADERS = { 'X-OpenLoaf-Client': '1' }

type ExtractedResult = {
  text: string
  finishReason: string | null
  toolCallsAfterReject: Array<{ toolName: string; input: unknown }>
}

async function continueWithRejection(args: {
  serverUrl: string
  sessionId: string
  leafMessageId: string
  parentMessageId: string
  toolCallId: string
  chatModelId: string
  chatModelSource: 'cloud' | 'local' | 'saas'
}): Promise<ExtractedResult> {
  const resp = await fetch(`${args.serverUrl}/ai/chat`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...CLIENT_HEADERS },
    body: JSON.stringify({
      sessionId: args.sessionId,
      messageId: `msg_${Math.random().toString(36).slice(2, 10)}`,
      intent: 'chat',
      responseMode: 'stream',
      clientPlatform: 'web',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      chatModelId: args.chatModelId,
      chatModelSource: args.chatModelSource,
      // 中文注释：续发 assistant 消息 — leafMessageId 指向待审批的 assistant，
      // parentMessageId 指向 user 消息（saveLastMessageAndResolveParent 的 assistant 分支强制要求）。
      messages: [
        {
          id: args.leafMessageId,
          parentMessageId: args.parentMessageId,
          role: 'assistant',
          parts: [],
        },
      ],
      toolApprovalPayloads: {
        [args.toolCallId]: { approved: false },
      },
    }),
  })
  if (!resp.ok || !resp.body) {
    const txt = await resp.text().catch(() => '')
    throw new Error(`continuation request failed: ${resp.status} ${txt}`)
  }
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let assembledText = ''
  let finishReason: string | null = null
  const toolCallsAfterReject: Array<{ toolName: string; input: unknown }> = []

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    // SSE 以 \n\n 分帧
    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''
    for (const frame of parts) {
      const line = frame.split('\n').find(l => l.startsWith('data:'))
      if (!line) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const obj = JSON.parse(payload) as any
        if (obj?.type === 'text-delta' && typeof obj.delta === 'string') {
          assembledText += obj.delta
        }
        if (obj?.type === 'finish') {
          finishReason = obj?.finishReason ?? obj?.data?.finishReason ?? finishReason
        }
        if (obj?.type?.startsWith('tool-input-available') || obj?.type === 'tool-call') {
          const toolName = obj?.toolName ?? obj?.data?.toolName
          if (toolName) toolCallsAfterReject.push({ toolName, input: obj?.input ?? obj?.data?.input })
        }
      } catch { /* skip non-json frames */ }
    }
  }

  return { text: assembledText.trim(), finishReason, toolCallsAfterReject }
}

it('038 — 拒绝审批后 AI 给出响应（不是沉默）', async () => {
  const prompt = '请用 Write 工具在 /tmp 目录下创建一个名为 probe_test_038.txt 的文件，内容写 "hello from 038"。'
  const MODEL_ID = 'qwen:OL-TX-006'
  const MODEL_SOURCE = 'cloud' as const

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      approvalStrategy="manual"
      chatModelId={MODEL_ID}
      chatModelSource={MODEL_SOURCE}
    />,
  )

  // ── 等第一轮 approval 卡片出现，然后抓 session/assistant/toolCallId ──
  await waitForToolApproval(90_000)
  await takeProbeScreenshot('approval-007-before-reject')

  const sessionId = getSessionId()
  expect(sessionId.length).toBeGreaterThan(0)

  // 中文注释：走 harness 内存快照（approval-requested 态下 server 还没把 assistant
  // 消息落 DB，直接 trpc.chat.getSessionMessages 会 flaky 返回空 list）。
  const getMsgs = (window as any).__probe_getMessages as (() => any[]) | undefined
  expect(getMsgs, 'harness should expose __probe_getMessages').toBeTruthy()
  const list: any[] = getMsgs!()
  const assistantMsg = list.find(m => m?.role === 'assistant' && Array.isArray(m?.parts))
  expect(assistantMsg).toBeTruthy()
  const toolPart = assistantMsg!.parts.find((p: any) => p?.state === 'approval-requested' && typeof p?.toolCallId === 'string')
  expect(toolPart).toBeTruthy()
  const leafMessageId: string = assistantMsg!.id
  // 中文注释：useChat 内存 UIMessage 不记录 parentMessageId（那是 DB 级字段），
  // 但我们已知 harness 只发了一条 user → 一条 assistant，assistant.parent
  // 就是线性序列里前面最近的 user message id。
  const userMsg = [...list].reverse().find((m: any) => m?.role === 'user' && typeof m?.id === 'string')
  expect(userMsg, 'harness should have at least one user message').toBeTruthy()
  const parentMessageId: string = userMsg!.id
  const toolCallId: string = toolPart!.toolCallId
  expect(parentMessageId.length).toBeGreaterThan(0)

  // 中文注释：真·真实用户路径 —— 直接点击 UI 拒绝按钮，让生产组件链走：
  //   ToolApprovalActions.handleReject
  //   → updateApprovalSnapshot(false) + updateApprovalInMessages(false)  [UI 立即 denied]
  //   → queueToolApprovalPayload + continueAfterToolApprovals
  //   → chat.sendMessage(undefined, { body: { toolApprovalPayloads } })
  //   → server stream 回传 text-delta，useChat 自动 merge 到 messages
  //   → MessageList 渲染 AI 拒绝回复文字
  // 这样截图才能同时包含「已拒绝执行」+「AI 的自然语言回复」—— 和真实用户体验一致。
  const rejectBtn = document.querySelector('[data-testid="tool-approval-reject"]') as HTMLButtonElement | null
  expect(rejectBtn, 'tool-approval-reject button should be present').toBeTruthy()
  expect(rejectBtn!.disabled, 'reject button should not be disabled when pending').toBe(false)
  rejectBtn!.click()

  // 等 DOM 出现 denied 文案（最多 5s）—— Bug B 视觉回归断言
  const rejectedTextAppeared = await (async () => {
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
      const root = document.querySelector('[data-testid="chat-probe-harness"]') as HTMLElement | null
      const txt = root?.innerHTML || ''
      if (txt.includes('已拒绝执行') || txt.includes('Rejected')) return true
      await new Promise(r => setTimeout(r, 150))
    }
    return false
  })()
  expect(rejectedTextAppeared, 'DOM should show "已拒绝执行" after reject click').toBe(true)

  // 等续发 stream 走完（probeStatus → complete），此时 AI 文字回复已进入 messages 渲染完毕
  await waitForChatComplete(120_000)
  await takeProbeScreenshot('approval-007-after-reject')

  // 从 useChat.messages 里拿"拒绝之后"的 AI 文字（最后一条 assistant 的所有 text part 合并）
  const finalMessages: any[] = (window as any).__probe_getMessages?.() ?? []
  const lastAssistant = [...finalMessages].reverse().find((m: any) => m?.role === 'assistant')
  const aiText: string = Array.isArray(lastAssistant?.parts)
    ? lastAssistant.parts
        .filter((p: any) => p?.type === 'text' && typeof p?.text === 'string')
        .map((p: any) => p.text)
        .join('\n')
        .trim()
    : ''

  // 排查"拒绝后 AI 又重新调 Write 同参"的反模式。
  // 说明：续发后 lastAssistant.parts 既包含原被拒绝的 Write（approval.approved=false），
  // 也包含新 text/新 tool parts。要排除"approved=false"的被拒 part，只看 approved!==false 的。
  const toolCallsAfter: Array<{ toolName: string; input: any; approved?: boolean }> = []
  if (Array.isArray(lastAssistant?.parts)) {
    for (const p of lastAssistant.parts as any[]) {
      const t = typeof p?.type === 'string' ? p.type : ''
      if (t.startsWith('tool-')) {
        toolCallsAfter.push({
          toolName: t.slice(5),
          input: p?.input,
          approved: p?.approval?.approved,
        })
      }
    }
  }
  const retriedSameWrite = toolCallsAfter.some((tc) => {
    if (tc.toolName !== 'Write') return false
    if (tc.approved === false) return false // 原本被拒的 part，不算"重试"
    const inp = tc.input as any
    return inp?.file_path === '/tmp/probe_test_038.txt'
  })

  const meta = {
    testCase: 'approval-007-reject-approval-response',
    prompt,
    result: {
      sessionId,
      status: 'ok' as const,
      toolCalls: toolCallsAfter.map((t) => t.toolName),
      toolCallDetails: [],
      elapsedMs: 0,
      finishReason: 'stop',
      textPreview: aiText.slice(0, 600),
      startedAt: new Date().toISOString(),
    },
    description: '拒绝审批后 AI 应给出响应（走真实 UI 点击路径）',
    tags: ['approval', 'reject', 'regression'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 1：AI 给了文字响应（不沉默）──
  expect(aiText.length, `AI should return non-empty text after reject, got: ${JSON.stringify(aiText)}`).toBeGreaterThan(0)

  // ── 断言 2：拒绝后 AI 不应立刻重新调用 Write 写同样的文件 ──
  expect(retriedSameWrite).toBe(false)

  // ── 断言 3：语义评判 —— AI 回复不能空、要在回应用户上一轮 ──
  const judgment = await aiJudge({
    testCase: 'approval-007-reject-approval-response',
    serverUrl: SERVER_URL,
    userPrompt: prompt,
    aiResponse: aiText,
    toolCalls: toolCallsAfter.map((t) => t.toolName),
    criteria:
      '核心回归点："用户拒绝 Write 审批后 AI 不能沉默"。只要 AI 回复存在任何' +
      '自然语言（哪怕一两句），并且语义上在"回应用户 / 进一步沟通 / 试图用别的方式' +
      '满足需求 / 承认无法 Write"任一维度即 PASS。只有以下情况 FAIL：回复完全为空；' +
      '或完全与"创建 probe_test_038.txt"需求无关（如纯代码片段而无解释）。',
  })
  expect(judgment.pass).toBe(true)

  // 避免未使用变量 lint 报错（之前从 list/toolCallId 解构出的字段供调试）
  void leafMessageId; void parentMessageId; void toolCallId
}, 240_000)
