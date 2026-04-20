/**
 * approval-007 — 拒绝审批后 AI 直接结束本轮 turn，不得续发 LLM。
 *
 * 设计行为（2026-04-20 修复后）：
 * - 用户点击「拒绝」→ handleReject 只更新本地 UI 状态（output-denied），
 *   不调用 continueAfterToolApprovals，不向 server 发任何新 stream 请求。
 * - probe 状态保持 complete，无第二条 assistant 消息出现。
 *
 * 回归两类 bug：
 *
 * Bug A（已修复）— Server 续发后 AI 沉默：
 * 本次不再测试，因为修复后根本不发续发请求。
 *
 * Bug B — UI 拒绝后视觉状态正确（仍需验证）：
 * - approval 卡片从 pending → denied 视觉态（"已拒绝执行"）
 * - 不应整块消失（UnifiedTool/ConfirmationRejected 渲染正常）
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import {
  waitForToolApproval,
  waitForProbeStatus,
  getSessionId,
  takeProbeScreenshot,
} from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

it('approval-007-reject-approval-response — 拒绝审批后 turn 直接结束，不触发 LLM 续发', async () => {
  const prompt = '必须使用 Write 工具（不要使用 Bash 或其他工具）在 /tmp 目录下创建一个名为 probe_test_038.txt 的文件，内容写 "hello from 038"。'
  const MODEL_ID = 'qwen:OL-TX-008'
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

  // ── 等 approval 卡片出现 ──
  await waitForToolApproval(90_000)
  const sessionId = getSessionId()
  await takeProbeScreenshot('approval-007-before-reject')

  // ── 点击拒绝按钮 ──
  const rejectBtn = document.querySelector('[data-testid="tool-approval-reject"]') as HTMLButtonElement | null
  expect(rejectBtn, 'tool-approval-reject button should be present').toBeTruthy()
  expect(rejectBtn!.disabled, 'reject button should not be disabled').toBe(false)
  rejectBtn!.click()

  // ── 验证 UI 立刻显示 denied 视觉态（Bug B 回归断言）──
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
  expect(rejectedTextAppeared, 'DOM should show denied state after reject click').toBe(true)

  await takeProbeScreenshot('approval-007-after-reject')

  // ── 等待 3s，确认没有新的 stream 被触发 ──
  await new Promise(r => setTimeout(r, 3_000))

  // ── probe 应处于 complete（初始 stream 结束后不续发）──
  await waitForProbeStatus('complete', 5_000)

  // ── 断言：拒绝后不应产生第二条 assistant 文字消息 ──
  const getMsgs = (window as any).__probe_getMessages as (() => any[]) | undefined
  const allMessages: any[] = getMsgs?.() ?? []
  const assistantMessages = allMessages.filter((m: any) => m?.role === 'assistant')

  // 统计所有 assistant 消息里的 text parts（排除工具相关 parts）
  const assistantTextParts = assistantMessages.flatMap((m: any) =>
    Array.isArray(m?.parts)
      ? m.parts.filter((p: any) => p?.type === 'text' && typeof p?.text === 'string' && p.text.trim().length > 0)
      : [],
  )

  // 拒绝后 AI 不应产生新文字回复（LLM 没有被调用）
  expect(
    assistantTextParts.length,
    `AI should NOT generate new text after rejection, but got ${assistantTextParts.length} text parts: ${JSON.stringify(assistantTextParts.map((p: any) => p.text?.slice(0, 100)))}`,
  ).toBe(0)

  // ── 统计并记录 ──
  const toolPartsRejected = assistantMessages.flatMap((m: any) =>
    Array.isArray(m?.parts)
      ? m.parts.filter((p: any) =>
          typeof p?.type === 'string' &&
          p.type.startsWith('tool-') &&
          p?.approval?.approved === false,
        )
      : [],
  )

  const meta = {
    testCase: 'approval-007-reject-approval-response',
    prompt,
    result: {
      sessionId,
      status: 'ok' as const,
      toolCalls: toolPartsRejected.map((p: any) => p.type.slice(5)),
      toolCallDetails: [],
      elapsedMs: 0,
      finishReason: 'stop',
      textPreview: '',
      startedAt: new Date().toISOString(),
    },
    description: '拒绝审批后 turn 直接结束，UI 显示 denied 态，无 LLM 续发',
    tags: ['approval', 'reject', 'regression', 'visual'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)
}, 120_000)
