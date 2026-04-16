/**
 * 004: XLSX 全量读取。
 * 断言：使用 DocPreview 或 Read，回复提到 sheet。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('004 — XLSX 全量，回复列出 sheet', async () => {
  const sessionId = `chat_probe_004_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt = '把这份 Excel 的内容完整列出来，每个 sheet 都要看。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['EMS_Quotation_Standard.xlsx'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  // Save data before assertions (recorded even on failure)
  await takeProbeScreenshot('004-docpreview-xlsx')
  const meta = { testCase: '004-docpreview-xlsx-full', prompt, result, description: 'DocPreview/Read used, response lists sheets', tags: ['docpreview', 'xlsx'] }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // Assertions
  expect(result.status).toBe('ok')
  expect(result.toolCalls.some(t => t === 'DocPreview' || t === 'Read')).toBe(true)

  // AI 语义评判：验证 XLSX 内容被完整展开
  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '这是一份 EMS 报价表 Excel 文件。回复应满足：' +
      '1) 列出了 sheet 名称或提到了工作表信息；' +
      '2) 展示了表格数据内容（如列名、产品、价格等）；' +
      '3) 内容不是简单的"已读取"，而是有实际数据展现',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
