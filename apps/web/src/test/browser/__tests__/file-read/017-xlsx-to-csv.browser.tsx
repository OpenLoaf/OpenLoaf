/**
 * 037: XLSX → CSV 格式转换。
 *
 * 用户场景：给 AI 一份 Excel 文件，让它转成 CSV 格式便于导入其他系统。
 *
 * 验证：
 * 1) 读取了 Excel（Read / DocPreview）
 * 2) 产出了 CSV（DocConvert / 写文件 / 文本 CSV 回复）
 * 3) AI 回复里确认转换完成或给出 CSV 内容
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('037 — XLSX → CSV：把 Excel 报价表转成 CSV', async () => {
  const sessionId = `chat_probe_037_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '请把这份 Excel 报价表转换成 CSV 格式，我需要导入到另一个系统里。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['EMS_Quotation_Standard.xlsx'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      sessionId={sessionId}
      title="037 — XLSX → CSV"
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(180_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('file-read-017-xlsx-to-csv')
  const meta = {
    testCase: 'file-read-017-xlsx-to-csv', prompt, result,
    description: 'DocConvert：XLSX 转 CSV',
    tags: ['docconvert', 'xlsx', 'csv', 'cross-format'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 至少读过 Excel
  const readExcel = result.toolCalls.some(t => t === 'Read' || t === 'DocPreview')
  expect(readExcel).toBe(true)

  // AI 语义评判：回复应明确给出 CSV 结果或确认完成
  const judgment = await aiJudge({
    testCase: 'file-read-017-xlsx-to-csv',
    serverUrl: SERVER_URL,
    criteria:
      'AI 应该完成 XLSX 到 CSV 的转换。满足以下任一即通过：' +
      '1) 回复里直接贴出了 CSV 内容（逗号或制表符分隔）；' +
      '2) 工具调用中使用了 DocConvert / Write 写出 .csv 文件；' +
      '3) 回复明确说 CSV 已生成并给出文件名',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
