/**
 * office-create/031: PdfMutate.extract-pages — 提取指定页。
 *
 * 附件一份多页 PDF，让 AI 只保留指定页输出为新 PDF。正确路径是
 * PdfMutate.extract-pages 或 split（配 pages 参数），一步完成。
 * 断言：调用了 PdfMutate，回复确认提取完成。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('office-create-031 — PdfMutate.extract-pages：只抽第 1 和第 3 页', async () => {
  const sessionId = `chat_probe_office_create_031_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '请从这份 PDF 里只提取第 1 页和第 3 页，输出成新的 PDF 文件，保存为 extracted_office_create_031.pdf。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['inside.pdf'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete(180_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('office-create-031-pdf-extract-pages')
  const meta = {
    testCase: 'office-create-031-pdf-extract-pages', prompt, result,
    description: 'PdfMutate.extract-pages 抽取指定页输出新 PDF',
    tags: ['pdfmutate', 'extract-pages', 'pdf'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')
  expect(result.toolCalls).toContain('PdfMutate')

  // 反模式：不该退化到 Python/pdftk 等 shell 命令
  const details = result.toolCallDetails ?? []
  const wroteAnyPy = details.some(d => {
    if (d.name !== 'Write') return false
    const p = (d.input as Record<string, unknown> | undefined)?.file_path
    return typeof p === 'string' && p.endsWith('.py')
  })
  expect(wroteAnyPy, 'AI 退化到写 Python 脚本抽页（应直接 PdfMutate.extract-pages）').toBe(false)

  const judgment = await aiJudge({
    testCase: 'office-create-031-pdf-extract-pages',
    serverUrl: SERVER_URL,
    criteria:
      '判断 AI 是否成功从 PDF 抽取了第 1 页和第 3 页。满足以下任一即通过：' +
      '1) 回复提到已提取 / 已输出 extracted_office_create_031.pdf（或其路径）；' +
      '2) 回复为空但工具调用包含 PdfMutate（extract-pages 已执行）。',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
