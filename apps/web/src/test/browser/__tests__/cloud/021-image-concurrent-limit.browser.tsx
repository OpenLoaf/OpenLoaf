/**
 * 021: Cloud 图片生成 — 并发超限（HTTP 503）错误路径。
 *
 * 用 handcrafted 错误 fixture 强制 CloudImageGenerate 返回:
 *   { ok:false, httpStatus:503, code:"http_503",
 *     detail:"并发超出限制，请稍后重试", ... }
 *
 * 验证 AI 收到 503 后:
 * - 不伪造成功
 * - 把 detail 原样告知用户（并发超限 / 稍后重试）
 * - 不盲目立即重试
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('cloud-021-image-concurrent-limit — 并发超限 (HTTP 503)', async () => {
  const prompt = '帮我生成一张雪山湖泊的风景图'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      title="021 — 并发超限 (HTTP 503)"
      approvalStrategy="approve-all"
      cloudMock={{
        testCase: 'cloud-021-image-concurrent-limit',
        mode: 'mock',
        fixtureId: 'error_503',
      }}
    />,
  )

  await waitForChatComplete(180_000)
  const result = await waitForProbeResult(120_000, { allowToolErrors: true })

  await takeProbeScreenshot('cloud-021-image-concurrent-limit')
  const meta = {
    testCase: 'cloud-021-image-concurrent-limit', prompt, result,
    description: 'CloudImageGenerate 返回 503 并发超限，AI 必须把原因告知用户而非伪造成功',
    tags: ['cloud', 'image', 'error', 'concurrent', '503'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.toolCalls).toContain('CloudImageGenerate')
  const call = result.toolCallDetails.find((t: any) => t.name === 'CloudImageGenerate')
  expect(call, 'CloudImageGenerate call should be present').toBeTruthy()
  expect((call as any)?.hasError, 'tool call should be marked hasError').toBeTruthy()

  expect(result.toolCallDetails.filter((t: any) => t.name === 'CloudImageGenerate').length).toBeLessThanOrEqual(3)

  const judgment = await aiJudge({
    testCase: 'cloud-021-image-concurrent-limit',
    serverUrl: SERVER_URL,
    criteria:
      '图片生成工具返回了 HTTP 503 并发超限错误。AI 回复必须满足 ALL 条件：' +
      '1) 明确告知用户图片未能生成；' +
      '2) 说明原因是"服务端并发超限 / 当前请求过多 / 稍后重试"（detail 原文是"并发超出限制，请稍后重试"）；' +
      '3) 不得伪造"图片已生成"、"展示给你" 等成功语义。' +
      '失败情形：回复声称生成成功 / 编造图片URL / 只说"抱歉失败"却不说并发超限原因。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
