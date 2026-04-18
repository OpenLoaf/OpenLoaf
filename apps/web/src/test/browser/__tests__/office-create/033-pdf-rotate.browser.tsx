/**
 * office-create/033: PdfMutate.rotate — 旋转指定页。
 *
 * 附件一份 PDF，让 AI 把第 1 页顺时针旋转 90 度。正确路径是
 * PdfMutate.rotate（angle=90），一步完成。
 * 断言：调用了 PdfMutate，回复确认旋转完成。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('office-create-033 — PdfMutate.rotate：第 1 页顺时针旋转 90 度', async () => {
  const sessionId = `chat_probe_office_create_033_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '请把这份 PDF 的第 1 页顺时针旋转 90 度，其他页保持不变，保存为 rotated_office_create_033.pdf。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['inside.pdf'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete(120_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('office-create-033-pdf-rotate')
  const meta = {
    testCase: 'office-create-033-pdf-rotate', prompt, result,
    description: 'PdfMutate.rotate 把 PDF 指定页旋转 90 度',
    tags: ['pdfmutate', 'rotate', 'pdf'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')
  expect(result.toolCalls).toContain('PdfMutate')

  // 工具链效率：理想 ≤4 步（LoadSkill + PdfMutate.rotate）
  const callCount = result.toolCallDetails?.length ?? result.toolCalls.length
  expect(
    callCount,
    `工具调用次数 ${callCount} 超标；旋转是原子操作，不应出现多步探测。`,
  ).toBeLessThanOrEqual(5)

  const judgment = await aiJudge({
    testCase: 'office-create-033-pdf-rotate',
    serverUrl: SERVER_URL,
    criteria:
      '判断 AI 是否成功旋转了 PDF 第 1 页。满足以下任一即通过：' +
      '1) 回复提到已旋转 / 已输出 rotated_office_create_033.pdf（或其路径）；' +
      '2) 回复为空但工具调用包含 PdfMutate（rotate 已执行）。',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
