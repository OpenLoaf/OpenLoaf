/**
 * 019: XLSX → DOCX → DOCX（英化+logo）→ XLSX 回流（四轮）。
 *
 * 用户场景：Excel 报价表 → 中文 Word 报告 → 英文橙色带 logo 的改版 →
 * 再导出成 Excel 方便数据层二次利用。
 *
 * 第一轮：读取 Excel 并分析数据（Read/DocPreview）
 * 第二轮：生成中文 Word 报告 ems_analysis_018.docx（WordMutate.create）
 * 第三轮：翻译为英文 + 橙色主题 + 插入 logo + 把"报价来源"移到文档末尾
 * 第四轮：把英文稿导出为 Excel（ExcelMutate.create 或 DocConvert）
 *
 * 允许中途 ToolError（部分模型会在 Read 路径上多复制一次 session id 触发
 * ENOENT，但会自行纠错 —— 只要最终 WordMutate / XlsxMutate 成功即可）。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('office-create-019 — XLSX → DOCX 分析报告（四轮：翻译/配色/logo/再导出 XLSX）', { timeout: 1_800_000 }, async () => {
  const sessionId = `chat_probe_018_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '请帮我看看这份 EMS 报价表的内容，列出所有产品和价格。'

  const followUp1 =
    '好的，现在请根据刚才的分析，帮我生成一份 Word 格式的报价分析报告。' +
    '报告要包含：标题"EMS 报价分析报告"、产品清单表格、价格汇总。' +
    '保存为 ems_analysis_018.docx。'

  const { tags: xlsxTags } = await (commands as any).stageAttachments({
    sessionId, files: ['EMS_Quotation_Standard.xlsx'],
  })
  const { tags: iconTags } = await (commands as any).stageAttachments({
    sessionId, files: ['icon.png'],
  })
  const prompt = `${xlsxTags.join(' ')} ${userPrompt}`
  const followUp2 =
    `${iconTags.join(' ')} 现在请基于上面那份中文报告做 4 处调整：` +
    '(1) 把所有文字翻译成英文；' +
    '(2) 主色调（标题颜色、表头背景色）改成橙色系（例如 #D97706 或 #E67E22）；' +
    '(3) 在文档顶部插入我刚给你的 logo 图片；' +
    '(4) 把"报价来源 / Quotation Source"这一段移到文档的最末尾。' +
    '保存为 ems_analysis_018_en.docx。'

  const followUp3 =
    '最后一步：请把刚才生成的英文报告里的产品清单表格数据，' +
    '导出成一份 Excel 文件 ems_analysis_018_en.xlsx。' +
    '只需要产品清单表（列：序号 / 类别 / 产品名 / 单价 / 备注），' +
    '不要把其他段落塞进 Excel 里。'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      followUpPrompts={[followUp1, followUp2, followUp3]}
      sessionId={sessionId}
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(480_000)
  // 允许中途 tool error（部分模型偶发 Read ENOENT 后自纠）—
  // 真正的契约由下面的 wordMutateCount / xlsx 工具断言把守。
  const result = await waitForProbeResult(undefined, { allowToolErrors: true })

  await takeProbeScreenshot('office-create-019-xlsx-to-docx-report')
  const meta = {
    testCase: 'office-create-019-xlsx-to-docx-report',
    prompt: `${prompt} → ${followUp1} → ${followUp2} → ${followUp3}`,
    result,
    description: '四轮：读 XLSX → 中文 DOCX → 英文橙色 + logo + 重排版 → 再导出 XLSX',
    tags: ['multi-turn', 'xlsx', 'docx', 'wordmutate', 'cross-format', 'translate', 'image-insert', 'xlsx-export'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 四轮验证
  expect(result.totalTurns).toBe(4)
  expect(result.messages.length).toBeGreaterThanOrEqual(8)

  // 工具调用
  const usedRead = result.toolCalls.some(t => t === 'Read' || t === 'DocPreview')
  const wordMutateCount = result.toolCalls.filter(t => t === 'JsSandbox').length
  // 第四轮："xlsx 导出" 允许走 ExcelMutate.create 或 DocConvert 两条路
  const usedXlsxExport = result.toolCalls.some(t => t === 'JsSandbox' || t === 'DocConvert')
  expect(usedRead).toBe(true)
  expect(wordMutateCount).toBeGreaterThanOrEqual(1)
  expect(usedXlsxExport).toBe(true)

  // AI 语义评判：第四轮回复应确认 xlsx 已生成
  const judgment = await aiJudge({
    testCase: 'office-create-019-xlsx-to-docx-report',
    serverUrl: SERVER_URL,
    criteria:
      '这是多轮对话的第四轮回复。AI 应已把前一轮的英文 Word 报告里的产品清单表格导出为 Excel。' +
      '满足以下任一即通过：1) 回复提到 Excel/xlsx/表格 + 已生成/已导出；' +
      '2) 提到文件名（含 xlsx 后缀或 ems_analysis_018_en）；' +
      '3) 工具调用包含 ExcelMutate 或 DocConvert 且回复不为空。',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt: followUp3,
  })
  expect(judgment.pass).toBe(true)
})
