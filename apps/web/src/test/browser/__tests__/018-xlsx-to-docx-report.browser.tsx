/**
 * 018: XLSX → DOCX 数据分析报告（多轮）。
 *
 * 用户场景：给 AI 一份 Excel 报价表，让它分析后生成一份 Word 分析报告。
 * 第一轮：读取 Excel 并分析数据
 * 第二轮：根据分析结果生成 Word 报告
 *
 * 验证：
 * 1) 读取了 Excel 数据（Read/DocPreview）
 * 2) 生成了 Word 报告（WordMutate）
 * 3) 多轮对话连贯
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('018 — XLSX → DOCX：读取报价表后生成分析报告', async () => {
  const sessionId = `chat_probe_018_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '请帮我看看这份 EMS 报价表的内容，列出所有产品和价格。'

  const followUp =
    '好的，现在请根据刚才的分析，帮我生成一份 Word 格式的报价分析报告。' +
    '报告要包含：标题"EMS 报价分析报告"、产品清单表格、价格汇总。' +
    '保存为 ems_analysis_018.docx。'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['EMS_Quotation_Standard.xlsx'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      followUpPrompts={[followUp]}
      sessionId={sessionId}
      approvalStrategy="approve-all"
    />,
  )

  // 多轮 + 跨格式操作需要较长超时
  await waitForChatComplete(240_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('018-xlsx-to-docx-report')
  const meta = {
    testCase: '018-xlsx-to-docx-report', prompt: `${prompt} → ${followUp}`, result,
    description: 'Multi-turn: read XLSX then generate DOCX analysis report',
    tags: ['multi-turn', 'xlsx', 'docx', 'wordmutate', 'cross-format'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 多轮验证
  expect(result.totalTurns).toBe(2)
  expect(result.messages.length).toBeGreaterThanOrEqual(4)

  // 工具调用：读取了 Excel + 生成了 Word
  const usedRead = result.toolCalls.some(t => t === 'Read' || t === 'DocPreview')
  const usedWordMutate = result.toolCalls.includes('WordMutate')
  expect(usedRead).toBe(true)
  expect(usedWordMutate).toBe(true)

  // AI 语义评判：第二轮回复应确认报告已生成
  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '这是多轮对话的第二轮回复。AI 应确认已基于 Excel 报价数据生成了 Word 分析报告。' +
      '满足以下任一即通过：1) 提到报告已创建/生成/保存；2) 提到文件名 ems_analysis；' +
      '3) 工具调用包含 WordMutate 且回复不为空',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt: followUp,
  })
  expect(judgment.pass).toBe(true)
})
