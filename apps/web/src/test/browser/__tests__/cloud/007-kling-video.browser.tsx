/**
 * 022: Kling 视频生成 — 带首帧图片。
 *
 * 先让 AI 生成一张图片，再用 Kling 模型把图片做成视频。
 * 核心验证：AI 用 CloudImageGenerate 先生成首帧图，再用 CloudVideoGenerate（带 startImage）生视频，
 * 并用 { url/path } 对象格式传入，不会 502。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('022 — Kling 视频生成：图生视频', async () => {
  const prompt =
    '我想用 Kling 模型生成一段视频。先帮我生成一张海边日落的图片，然后把它做成一段 5 秒的视频，要有海浪涌动的效果'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      title="022 — Kling 视频生成"
      approvalStrategy="approve-all"
    />,
  )

  // 视频生成耗时较长
  await waitForChatComplete(600_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('cloud-007-kling-video')
  const meta = {
    testCase: 'cloud-007-kling-video', prompt, result,
    description: 'Kling 视频生成（使用上一步生成的图片作起始帧）',
    tags: ['cloud', 'video', 'kling', 'startImage'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 命名工具路径：先生图，再用结果作为首帧生视频
  expect(result.toolCalls).toContain('CloudImageGenerate')
  expect(result.toolCalls).toContain('CloudVideoGenerate')
  // 至少两次命名生成调用（image + video）
  const generateCount = result.toolCalls.filter(
    (t: string) => t === 'CloudImageGenerate' || t === 'CloudVideoGenerate',
  ).length
  expect(generateCount).toBeGreaterThanOrEqual(2)

  const judgment = await aiJudge({
    testCase: 'cloud-007-kling-video',
    serverUrl: SERVER_URL,
    criteria:
      '回复应确认视频已生成成功。流程中不应出现 "502"、"需要输入首帧图片" 之类的报错。' +
      '应该先生成了一张图片，再用这张图片作为首帧生成了视频。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
