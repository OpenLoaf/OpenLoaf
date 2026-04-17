/**
 * 017: 中文 DOCX → PDF 格式转换。
 *
 * 用户场景：把中文 Word 文档转成 PDF 方便分享。
 * DocConvert 的 textToPdf 不支持 CJK（StandardFonts 限制），
 * AI 应该识别到这个限制并采取正确的替代方案（如 WordMutate + DocConvert，或告知用户限制）。
 *
 * 断言：AI 最终完成了任务或给出了合理的替代方案说明。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('017 — 中文 DOCX → PDF：处理 CJK 编码限制', async () => {
  const sessionId = `chat_probe_017_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '请把这份中文 Word 文档转换成 PDF 格式，保存为 project_report.pdf。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['意大利光储充项目汇报(1).docx'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  await takeProbeScreenshot('017-docx-to-pdf')
  const meta = {
    testCase: '017-docx-to-pdf', prompt, result,
    description: 'DocConvert：中文 DOCX 转 PDF',
    tags: ['docconvert', 'docx', 'pdf', 'conversion', 'cjk'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // AI 语义评判：AI 应该完成转换或合理处理 CJK 限制
  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '用户要求将中文 DOCX 转为 PDF。由于 DocConvert 的 PDF 输出不支持 CJK 字符，AI 应以下列方式之一处理：' +
      '1) 成功完成转换（可能通过 Bash 调用外部工具如 pandoc/LibreOffice）；' +
      '2) 使用替代方案（如 WordMutate 创建新文档再转换）；' +
      '3) 明确告知用户 CJK 编码限制并建议替代方案。' +
      '只要 AI 没有静默失败或给出无关回复，都应通过。',
    aiResponse: result.textPreview.trim() || '(无文字回复)',
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
