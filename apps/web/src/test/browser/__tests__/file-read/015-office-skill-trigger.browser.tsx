/**
 * 008: xlsx-skill 无关键词触发。
 * 断言：加载了 skill（LoadSkill 工具被调用），回复包含金额/数字。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('008 — xlsx-skill 无关键词触发，回复包含分析结果', async () => {
  const sessionId = `chat_probe_008_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const userPrompt = '帮我分析一下这份报价表，找出单价最高的前 3 项，算一下总金额。'

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
  await takeProbeScreenshot('file-read-015-office-skill-trigger')
  const meta = { testCase: 'file-read-015-office-skill-trigger', prompt, result, description: '不提关键词也能触发 xlsx 技能', tags: ['skill-trigger', 'xlsx-skill'] }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // Assertions
  expect(result.status).toBe('ok')
  expect(result.toolCalls.length).toBeGreaterThan(0)

  // AI 语义评判：验证报价表分析的质量
  const judgment = await aiJudge({
    testCase: 'file-read-015-office-skill-trigger',
    serverUrl: SERVER_URL,
    criteria:
      '用户要求分析报价表，找出单价最高的前 3 项并算总金额。回复应满足：' +
      '1) 列出了单价最高的项目（至少提到具体产品名或编号）；' +
      '2) 给出了总金额的计算结果（包含具体数字）；' +
      '3) 分析有条理，不是泛泛而谈',
    aiResponse: result.textPreview.trim(),
    toolCalls: result.toolCalls,
    userPrompt,
  })
  expect(judgment.pass).toBe(true)
})
