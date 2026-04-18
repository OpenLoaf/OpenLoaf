/**
 * 011: PDF 创建。
 *
 * 要求 AI 用 PdfMutate create action 生成一份简单的英文 PDF 报告。
 * 断言：调用了 PdfMutate 工具，回复确认文件已创建。
 *
 * 注意：PdfMutate create 不支持 CJK，所以使用英文内容测试。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('011 — PDF 创建：生成英文发票 PDF', async () => {
  const prompt =
    '帮我创建一份英文 PDF 发票。公司名称："Acme Corp"，发票编号 2026-042，' +
    '明细：Widget 1个 $50，Gadget 2个 每个$30。总计 $110。' +
    '保存为 invoice_test_011.pdf，放在当前项目目录下。'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  await takeProbeScreenshot('office-create-001-pdf-create')
  const meta = {
    testCase: 'office-create-001-pdf-create', prompt, result,
    description: 'PdfMutate 生成英文发票 PDF',
    tags: ['pdfmutate', 'create', 'pdf'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 工具调用：必须用了 PdfMutate
  expect(result.toolCalls).toContain('PdfMutate')

  // 工具链效率：理想 3 步（LoadSkill + ToolSearch(PdfMutate) + PdfMutate），允许 ≤ 4 次容差
  const callCount = result.toolCallDetails?.length ?? result.toolCalls.length
  expect(
    callCount,
    `工具调用次数 ${callCount} 超标；prompt 已经很明确，理想链路是 LoadSkill → ToolSearch(PdfMutate) → PdfMutate（3 步），不应出现猜错工具名（如 PdfCreate）的多余 ToolSearch 或无意义的 Bash 探测。`,
  ).toBeLessThanOrEqual(4)

  // AI 语义评判：聚焦"PDF 是否被正确创建"。回复啰嗦属于 prompt 层面的横切问题，
  // 不在本用例范围内；本用例只关心核心任务（创建发票 PDF）是否完成。
  await aiJudge({
    serverUrl: SERVER_URL,
    testCase: 'office-create-001-pdf-create',
    criteria:
      '核心评估：AI 是否成功创建了 PDF 发票文件。pass 条件：\n' +
      '1) 回复确认文件已成功创建（措辞不限）；\n' +
      '2) 回复中出现了目标文件名 invoice_test_011.pdf（或其完整路径）。\n' +
      '只要这两点都满足即 pass。无需评估回复风格/长度/是否复述字段——那是其他用例的范畴。',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
})
