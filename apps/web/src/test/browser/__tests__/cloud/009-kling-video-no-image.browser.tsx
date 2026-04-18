/**
 * 024: Kling 视频生成 — 用户没给图片。
 *
 * 用户直接要求用 Kling 生成视频但没提供图片。
 * AI 应该意识到 Kling 视频需要首帧图片，主动先生成一张图再生成视频，
 * 或者向用户确认。不应直接调 Generate 导致 502。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('024 — Kling 视频生成：无图片输入', async () => {
  const prompt = '用 Kling 帮我生成一段猫咪在草地上奔跑的视频，大概 5 秒就行'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      title="024 — Kling 视频（无图）"
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(600_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('cloud-009-kling-video-no-image')
  const meta = {
    testCase: 'cloud-009-kling-video-no-image', prompt, result,
    description: '无起始图时 Kling 应先生成图或询问用户',
    tags: ['cloud', 'video', 'kling', 'no-image'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 不应有 502 报错
  const judgment = await aiJudge({
    testCase: 'cloud-009-kling-video-no-image',
    serverUrl: SERVER_URL,
    criteria:
      '以下任一情况算通过：' +
      '1) AI 先生成了一张图片再用 Kling 生成视频，最终成功产出视频文件；' +
      '2) AI 主动告知用户 Kling 需要首帧图片，建议先生图或让用户提供图片。' +
      '以下情况算失败：直接调用 Kling 视频 Generate 导致 502 或 "需要输入首帧图片" 报错。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
