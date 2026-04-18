/**
 * 002: PDF 内容深度理解。
 *
 * 使用 PLA34 电力分析仪手册 (32页)，验证 AI 能准确提取具体事实内容，
 * 而不仅是"调了工具"。断言：工具调用正确 + 回复包含手册中的具体信息。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('002 — PDF 内容深度理解：提取产品名称、页数、关键参数', async () => {
  const sessionId = `chat_probe_002_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '请仔细阅读这份 PDF 手册，告诉我：1) 这是什么产品的手册？具体型号是什么？2) 总共多少页？3) 手册的主要章节有哪些？请列出至少 5 个章节标题。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['BMR_PLA34_en_v2-3.pdf'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  // Save data before assertions
  await takeProbeScreenshot('file-read-003-docpreview-pdf')
  const meta = {
    testCase: 'file-read-003-docpreview-pdf', prompt, result,
    description: 'DocPreview 读取 PDF，提取产品名/页数/章节',
    tags: ['docpreview', 'pdf', 'content-verification'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 工具调用：必须用了 Read 或 DocPreview
  expect(result.toolCalls.some(t => t === 'Read' || t === 'DocPreview')).toBe(true)

  // AI 语义评判：验证回复包含手册的具体事实内容
  const judgment = await aiJudge({
    testCase: 'file-read-003-docpreview-pdf',
    serverUrl: SERVER_URL,
    criteria:
      '回复必须满足以下全部条件：' +
      '1) 提到产品型号 PLA34 或 PLA 34；' +
      '2) 提到手册总页数（32 页）；' +
      '3) 列出至少 3 个具体章节标题（如 Safety、Installation、Connection、Measured parameters、Communication 等）；' +
      '4) 回复有结构化分析，不是泛泛而谈',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
