/**
 * 015: XLSX 创建。
 *
 * 要求 AI 用 ExcelMutate create 生成一份中文 Excel 销售表。
 * 断言：调用了 ExcelMutate 工具，AI 语义评判确认文件已创建。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('015 — XLSX 创建：生成中文销售数据表', async () => {
  const prompt =
    '帮我创建一份 Excel 销售数据表。Sheet 名称："Q1 销售"。' +
    '列：产品名称、区域、销量、单价（元）、收入（元）。' +
    '数据：智能音箱/华东/1240/300/372000，扫地机器人/华南/410/3000/1230000，' +
    '无线耳机/华北/860/150/129000。最后加一行合计。' +
    '保存为 sales_q1_015.xlsx。'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  await takeProbeScreenshot('015-xlsx-create')
  const meta = {
    testCase: '015-xlsx-create', prompt, result,
    description: 'ExcelMutate 生成中文销售表 XLSX',
    tags: ['excelmutate', 'create', 'xlsx'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 工具调用：必须用了 ExcelMutate
  expect(result.toolCalls).toContain('ExcelMutate')

  // AI 语义评判：验证回复确认了 XLSX 创建并提及关键内容
  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '回复应确认已成功创建 Excel 销售数据表，并提到以下至少 2 项：' +
      'Q1 销售、产品（智能音箱/扫地机器人/无线耳机）、区域、合计行、文件名',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
