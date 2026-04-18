/**
 * office-create/027: PdfInspect.render — 多页渲染为图片。
 *
 * 附件一份多页 PDF，让 AI 渲染前 2 页为图片给用户看。这是扫描件 / 版式
 * 敏感场景的必经工具（summary 判断不可直接提取文本后应走 render）。
 * 断言：调用了 PdfInspect（render），回复确认页面图像已生成。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('office-create-027 — PdfInspect.render：把 PDF 前 2 页渲染成图片', async () => {
  const sessionId = `chat_probe_office_create_027_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '把这份 PDF 的第 1 页和第 2 页渲染成图片让我看，保持原始版式，不要改文字。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['inside.pdf'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete(180_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('office-create-027-pdf-inspect-render')
  const meta = {
    testCase: 'office-create-027-pdf-inspect-render', prompt, result,
    description: 'PdfInspect.render 把 PDF 多页渲染成 PNG',
    tags: ['pdfinspect', 'render', 'pdf'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 正确路径：PdfInspect.render
  expect(result.toolCalls).toContain('PdfInspect')

  // 不能走 ImageProcess（它是针对图像后处理，不是 PDF → 图片）
  expect(result.toolCalls).not.toContain('ImageProcess')

  const judgment = await aiJudge({
    testCase: 'office-create-027-pdf-inspect-render',
    serverUrl: SERVER_URL,
    criteria:
      '判断 AI 是否把 PDF 前 2 页渲染成了图片。满足以下任一即通过：' +
      '1) 回复提到已渲染/生成/输出图片（提到页数或页码更好）；' +
      '2) 回复为空但工具调用包含 PdfInspect（render 已执行）。',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
