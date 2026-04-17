/**
 * 016: PPTX 创建。
 *
 * 要求 AI 用 PptxMutate create 生成一份中文 PPT 汇报。
 * 断言：调用了 PptxMutate 工具，AI 语义评判确认文件已创建。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('016 — PPTX 创建：生成中文季度汇报 PPT', async () => {
  const prompt =
    '帮我创建一份 PPT 季度汇报。主题："2026 Q1 业务回顾"。' +
    '需要 4 页幻灯片：' +
    '第 1 页：封面，标题"2026 Q1 业务回顾"，副标题"产品部 · 张三"；' +
    '第 2 页：核心指标，营收同比 +32%，新增付费用户 1.2 万，NPS 从 42 提升到 51；' +
    '第 3 页：下季度重点，扩张东南亚市场、上线企业版、完成 B 轮融资；' +
    '第 4 页：Q&A 页，写"谢谢聆听"。' +
    '保存为 q1_review_016.pptx。'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  await takeProbeScreenshot('016-pptx-create')
  const meta = {
    testCase: '016-pptx-create', prompt, result,
    description: 'PptxMutate 生成中文季度回顾 PPTX',
    tags: ['pptxmutate', 'create', 'pptx'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 工具调用：必须用了 PptxMutate
  expect(result.toolCalls).toContain('PptxMutate')

  // AI 语义评判：验证回复确认了 PPTX 创建并提及关键内容
  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '回复应确认已成功创建 PPT 季度汇报，并提到以下至少 2 项：' +
      'Q1 业务回顾、4 页幻灯片、核心指标（营收/用户/NPS）、下季度重点、文件名',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
