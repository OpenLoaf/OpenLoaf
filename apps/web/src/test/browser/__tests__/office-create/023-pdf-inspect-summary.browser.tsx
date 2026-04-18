/**
 * office-create/023: PdfInspect.summary — 分析 PDF 基本信息。
 *
 * 附件一份 PDF，让 AI 给出基本元数据（页数、是否可提取文本、是否加密等）。
 * 这是 PdfInspect 工具链的 workflow 入口，正确用法是 summary 先行（避免
 * 直接扔给 render/text 然后猜测文档性质）。
 * 断言：调用了 PdfInspect，回复给出页数等事实性结论。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('office-create-023 — PdfInspect.summary：分析 PDF 基本元数据', async () => {
  const sessionId = `chat_probe_office_create_023_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt =
    '帮我分析一下这个 PDF：一共有多少页？内容是可以直接提取文本的数字版，还是扫描件？有没有加密？'

  const { tags } = await (commands as any).stageAttachments({
    sessionId, files: ['inside.pdf'],
  })
  const prompt = `${tags.join(' ')} ${userPrompt}`

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} sessionId={sessionId} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  await takeProbeScreenshot('office-create-023-pdf-inspect-summary')
  const meta = {
    testCase: 'office-create-023-pdf-inspect-summary', prompt, result,
    description: 'PdfInspect.summary 分析 PDF 基本元数据（页数/文本类型/加密）',
    tags: ['pdfinspect', 'summary', 'pdf'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')
  expect(result.toolCalls).toContain('PdfInspect')

  // 该问题用 summary 一步就够，不该走重型 render/text
  const callCount = result.toolCallDetails?.length ?? result.toolCalls.length
  expect(
    callCount,
    `工具调用次数 ${callCount} 超标；理想链路是 LoadSkill → PdfInspect(summary)（≤3 步）。`,
  ).toBeLessThanOrEqual(5)

  const judgment = await aiJudge({
    testCase: 'office-create-023-pdf-inspect-summary',
    serverUrl: SERVER_URL,
    criteria:
      '判断 AI 是否基于 PdfInspect 输出给出了 PDF 的基本元数据。满足以下任一即通过：' +
      '1) 回复包含具体页数（一个明确的整数）；' +
      '2) 回复说明了文档是否可提取文本 / 是否扫描件 / 是否加密（至少命中一项）。',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
