/**
 * 022: Cloud 图片生成 — 资源包已用完（HTTP 502）错误路径。
 *
 * 用 handcrafted 错误 fixture 强制 CloudImageGenerate 返回:
 *   { ok:false, httpStatus:502, code:"http_502",
 *     detail:"资源包已用完或已过期，请联系管理员", ... }
 *
 * 验证 AI 收到 502 后:
 * - 不伪造成功
 * - 把 detail 原样告知用户（资源包耗尽 / 联系管理员）
 * - 不盲目重试
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('cloud-022-image-resource-exhausted — 资源包已用完 (HTTP 502)', async () => {
  const prompt = '帮我生成一张雪山湖泊的风景图'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      title="022 — 资源包已用完 (HTTP 502)"
      approvalStrategy="approve-all"
      cloudMock={{
        testCase: 'cloud-022-image-resource-exhausted',
        mode: 'mock',
        fixtureId: 'error_502',
      }}
    />,
  )

  await waitForChatComplete(180_000)
  const result = await waitForProbeResult(120_000, { allowToolErrors: true })

  await takeProbeScreenshot('cloud-022-image-resource-exhausted')
  const meta = {
    testCase: 'cloud-022-image-resource-exhausted', prompt, result,
    description: 'CloudImageGenerate 返回 502 资源包已用完，AI 必须把原因告知用户而非伪造成功',
    tags: ['cloud', 'image', 'error', 'resource-pack', '502'],
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
    testCase: 'cloud-022-image-resource-exhausted',
    serverUrl: SERVER_URL,
    criteria:
      '图片生成工具返回了 HTTP 502 资源包已用完错误。AI 回复必须满足 ALL 条件：' +
      '1) 明确告知用户图片未能生成；' +
      '2) 说明原因是"资源包已用完/已过期，需要联系管理员"（detail 原文是"资源包已用完或已过期，请联系管理员"）；' +
      '3) 不得伪造"图片已生成"、"展示给你" 等成功语义。' +
      '失败情形：回复声称生成成功 / 编造图片URL / 只说"抱歉失败"却不说资源包原因。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
