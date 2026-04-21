/**
 * 020: Cloud 图片生成 — 积分不足（HTTP 402）错误路径。
 *
 * 用 handcrafted 错误 fixture 强制 CloudImageGenerate 返回:
 *   { ok:false, httpStatus:402, code:"http_402",
 *     detail:"SaaS 账户积分不足，请前往控制台充值后重试", ... }
 *
 * 验证 AI 收到 402 后:
 * - 不伪造成功（不能声称"已生成图片"）
 * - 把 detail（积分不足 / 充值）原样告知用户
 * - 不盲目重试直到耗尽 maxSteps
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('cloud-020-image-credits-insufficient — 积分不足 (HTTP 402)', async () => {
  const prompt = '帮我生成一张雪山湖泊的风景图'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      title="020 — 积分不足 (HTTP 402)"
      approvalStrategy="approve-all"
      cloudMock={{
        testCase: 'cloud-020-image-credits-insufficient',
        mode: 'mock',
        fixtureId: 'error_402',
      }}
    />,
  )

  await waitForChatComplete(180_000)
  const result = await waitForProbeResult(120_000, { allowToolErrors: true })

  await takeProbeScreenshot('cloud-020-image-credits-insufficient')
  const meta = {
    testCase: 'cloud-020-image-credits-insufficient', prompt, result,
    description: 'CloudImageGenerate 返回 402 积分不足，AI 必须把原因告知用户而非伪造成功',
    tags: ['cloud', 'image', 'error', 'credits', '402'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.toolCalls).toContain('CloudImageGenerate')
  const call = result.toolCallDetails.find((t: any) => t.name === 'CloudImageGenerate')
  expect(call, 'CloudImageGenerate call should be present').toBeTruthy()
  expect((call as any)?.hasError, 'tool call should be marked hasError').toBeTruthy()

  // AI 不能无限重试 — 单个用例预算内完成
  expect(result.toolCallDetails.filter((t: any) => t.name === 'CloudImageGenerate').length).toBeLessThanOrEqual(3)

  const judgment = await aiJudge({
    testCase: 'cloud-020-image-credits-insufficient',
    serverUrl: SERVER_URL,
    criteria:
      '图片生成工具返回了 HTTP 402 积分不足错误。AI 回复必须满足 ALL 条件：' +
      '1) 明确告知用户图片未能生成；' +
      '2) 说明原因是"积分不足/余额不足/需要充值"（detail 原文是"SaaS 账户积分不足，请前往控制台充值后重试"）；' +
      '3) 不得伪造"图片已生成"、"展示给你" 等成功语义。' +
      '失败情形：回复声称生成成功 / 编造图片URL / 只说"抱歉失败"却不说积分原因。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
