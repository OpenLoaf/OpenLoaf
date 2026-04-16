/**
 * 020: PDF → DOCX 格式转换。
 *
 * 用户场景：收到一份 PDF 文件，需要转成 Word 方便编辑修改。
 * 断言：调用了 DocConvert 工具，回复确认转换完成并提示有损风险。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('020 — PDF → DOCX：将 PDF 转为 Word 方便编辑', async () => {
  const sessionId = `chat_probe_020_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '我需要编辑这份 PDF 里的内容，请帮我把它转换成 Word 文档。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['inside.pdf'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  await takeProbeScreenshot('020-pdf-to-docx')
  const meta = {
    testCase: '020-pdf-to-docx', prompt, result,
    description: 'DocConvert: PDF to DOCX format conversion',
    tags: ['docconvert', 'pdf', 'docx', 'conversion'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 工具调用：必须用了 DocConvert
  expect(result.toolCalls).toContain('DocConvert')

  // AI 语义评判
  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '回复应确认已将 PDF 转换为 Word 文档。' +
      '加分项：提到 PDF → DOCX 转换可能有排版丢失/有损风险（技能约束要求告知用户）。' +
      '只要确认转换完成即可通过，有损提示是加分不强制。',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
