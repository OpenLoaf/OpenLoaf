/**
 * office-create/003: PDF 水印。
 *
 * 附件一个现有 PDF，要求 AI 在上面加水印文字。
 * 新架构下 PDF 水印有独立 watermark action（区别于 add-text 的定位单段文字）；
 * AI 应走 PdfMutate.watermark。断言：调用了 PdfMutate 工具并完成操作。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('office-create-003 — PDF 水印：在现有 PDF 上添加 CONFIDENTIAL 水印', async () => {
  const sessionId = `chat_probe_office_create_003_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '请在这份 PDF 的第一页右上角添加红色的 "CONFIDENTIAL" 水印文字，字号用 24pt。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['BMR_PLA34_en_v2-3.pdf'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  await takeProbeScreenshot('office-create-003-pdf-add-watermark')
  const meta = {
    testCase: 'office-create-003-pdf-add-watermark', prompt, result,
    description: 'PdfMutate.watermark 给 PDF 加红色 CONFIDENTIAL 水印',
    tags: ['pdfmutate', 'watermark', 'pdf'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 核心断言：必须用了 PdfMutate（说明水印操作被执行了）
  expect(result.toolCalls).toContain('PdfMutate')

  // AI 语义评判：验证水印操作的完成确认
  // AI 有时只输出工具调用不带文字总结，加入 toolCalls 供辅助模型综合判断
  const judgment = await aiJudge({
    testCase: 'office-create-003-pdf-add-watermark',
    serverUrl: SERVER_URL,
    criteria:
      '判断 AI 是否成功完成了在 PDF 上添加 "CONFIDENTIAL" 红色水印的任务。' +
      '满足以下任一条件即通过：' +
      '1) 回复文字提到了已添加/已完成/水印/文字/红色/CONFIDENTIAL 等相关内容；' +
      '2) 回复文字较短或被截断但工具调用包含 PdfMutate（说明操作已执行）',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
