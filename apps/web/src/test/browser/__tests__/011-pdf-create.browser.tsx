/**
 * 011: PDF 创建。
 *
 * 要求 AI 用 PdfMutate create action 生成一份简单的英文 PDF 报告。
 * 断言：调用了 PdfMutate 工具，回复确认文件已创建。
 *
 * 注意：PdfMutate create 不支持 CJK，所以使用英文内容测试。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('011 — PDF 创建：生成英文发票 PDF', async () => {
  const prompt =
    '帮我创建一份英文 PDF 发票。公司名称："Acme Corp"，发票编号 2026-042，' +
    '明细：Widget 1个 $50，Gadget 2个 每个$30。总计 $110。' +
    '保存为 invoice_test_011.pdf，放在当前项目目录下。'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete(90_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('011-pdf-create')
  const meta = {
    testCase: '011-pdf-create', prompt, result,
    description: 'PdfMutate create action generates an English invoice PDF',
    tags: ['pdfmutate', 'create', 'pdf'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 工具调用：必须用了 PdfMutate
  expect(result.toolCalls).toContain('PdfMutate')

  // AI 语义评判：验证回复确认了 PDF 创建并提及关键内容
  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '回复应确认已成功创建 PDF 发票文件，并提到以下至少 2 项：' +
      'Acme Corp 公司名、发票编号 2026-042、总计 $110、文件名 invoice_test_011.pdf',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
