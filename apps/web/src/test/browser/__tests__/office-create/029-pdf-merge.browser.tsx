/**
 * office-create/029: PdfMutate.merge — 合并两份 PDF。
 *
 * 附件两个 PDF，让 AI 合并成一个文件。正确路径是 PdfMutate.merge 一步完成，
 * 不应该退化成"逐页 Read 再 PdfMutate.create"这种错误路径。
 * 断言：调用了 PdfMutate（merge），回复确认合并完成。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('office-create-029 — PdfMutate.merge：合并两份 PDF', async () => {
  const sessionId = `chat_probe_office_create_029_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '请把这两份 PDF 合并成一个文件，保留两份文档的所有页面，顺序按我提供的顺序，' +
    '保存为 merged_office_create_029.pdf。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['inside.pdf', 'BMR_PLA34_en_v2-3.pdf'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete(180_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('office-create-029-pdf-merge')
  const meta = {
    testCase: 'office-create-029-pdf-merge', prompt, result,
    description: 'PdfMutate.merge 合并两份 PDF',
    tags: ['pdfmutate', 'merge', 'pdf'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')
  expect(result.toolCalls).toContain('PdfMutate')

  // 反模式：退化成 Bash 调 pdftk / Python PyPDF2 手撸
  const details = result.toolCallDetails ?? []
  const wroteAnyPy = details.some(d => {
    if (d.name !== 'Write') return false
    const p = (d.input as Record<string, unknown> | undefined)?.file_path
    return typeof p === 'string' && p.endsWith('.py')
  })
  expect(wroteAnyPy, 'AI 退化到写 Python 脚本合并（应直接 PdfMutate.merge）').toBe(false)

  // 不应尝试"逐页读 + create"的笨办法
  const readCount = details.filter(d => d.name === 'Read' || d.name === 'DocPreview').length
  expect(
    readCount,
    `Read/DocPreview 次数 ${readCount} 过多；合并 PDF 不需要先读全部内容，PdfMutate.merge 直接做即可。`,
  ).toBeLessThanOrEqual(2)

  const judgment = await aiJudge({
    testCase: 'office-create-029-pdf-merge',
    serverUrl: SERVER_URL,
    criteria:
      '判断 AI 是否成功合并了两份 PDF。满足以下任一即通过：' +
      '1) 回复提到已合并 / 已生成 / 已输出 merged_office_create_029.pdf（或其路径）；' +
      '2) 回复为空但工具调用包含 PdfMutate（merge 已执行）。',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
