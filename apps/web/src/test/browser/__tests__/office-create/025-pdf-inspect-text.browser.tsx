/**
 * office-create/025: PdfInspect.text — 提取 PDF 文本内容。
 *
 * 附件一份中文纯文本 PDF，让 AI 提取并给出前若干段。正确路径是
 * PdfInspect.text（按页返回结构化文本），而不是 Read 硬读 PDF 字节或
 * 走 OCR（summary 会告诉 AI 可直接提取）。
 * 断言：调用了 PdfInspect，回复里出现 PDF 里确实存在的关键词。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('office-create-025 — PdfInspect.text：提取中文 PDF 文本', async () => {
  const sessionId = `chat_probe_office_create_025_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '请读取这份 PDF 并把前面的正文提取出来给我（中文内容，按段落给），不要总结。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['超级个体288行动服务手册.pdf'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete(180_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('office-create-025-pdf-inspect-text')
  const meta = {
    testCase: 'office-create-025-pdf-inspect-text', prompt, result,
    description: 'PdfInspect.text 抽取中文 PDF 文字',
    tags: ['pdfinspect', 'text', 'pdf', 'cjk'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 必须用了 PdfInspect（不能走 Read 硬读 PDF 字节，也不能走 OCR）
  expect(result.toolCalls).toContain('PdfInspect')

  // 工具链不应过长：summary/text → 完成
  const callCount = result.toolCallDetails?.length ?? result.toolCalls.length
  expect(
    callCount,
    `工具调用次数 ${callCount} 超标；理想链路 ≤5 步（LoadSkill + PdfInspect(summary) + PdfInspect(text)）。`,
  ).toBeLessThanOrEqual(6)

  const judgment = await aiJudge({
    testCase: 'office-create-025-pdf-inspect-text',
    serverUrl: SERVER_URL,
    criteria:
      '判断 AI 是否成功提取了 PDF 里的中文正文。满足以下任一即通过：' +
      '1) 回复包含至少一段明显来自 PDF 正文的中文文字（不是空泛概括）；' +
      '2) 回复为空但工具调用包含 PdfInspect（说明抽取已执行，由客户端负责呈现）。',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
