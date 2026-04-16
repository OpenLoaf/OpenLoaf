/**
 * 021: Cloud 图片生成 — 基础文生图流程。
 *
 * 验证 AI 按 Browse → Detail → Generate 三步流程完整执行，
 * 不跳过 CloudCapDetail 步骤。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('021 — Cloud 图片生成：赛博朋克城市', async () => {
  const prompt = '帮我生成一张猫的图片'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} title="021 — Cloud 图片生成" approvalStrategy="approve-all" />,
  )

  await waitForChatComplete(300_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('021-cloud-image-generate')
  const meta = {
    testCase: '021-cloud-image-generate', prompt, result,
    description: 'Cloud image generation: Browse → Detail → Generate full flow',
    tags: ['cloud', 'image', 'generate'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 必须调了 Browse 和 Generate
  expect(result.toolCalls).toContain('CloudCapBrowse')
  expect(result.toolCalls).toContain('CloudModelGenerate')

  // Detail 步骤不应跳过
  expect(result.toolCalls).toContain('CloudCapDetail')

  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '回复应该确认图片已生成成功，并展示了图片文件路径或 URL。不应有报错信息。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
