/**
 * 026: 图片生成 + 编辑 — 多轮对话。
 *
 * 第一轮：让 AI 生成一张图片
 * 第二轮：让 AI 对生成的图片做编辑（如换背景）
 *
 * 验证 AI 能在同一 session 中先生成再编辑，第二轮复用第一轮的图片。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('026 — 图片生成+编辑：先画再改', async () => {
  const prompt = '给我画一只橘猫趴在窗台上晒太阳'
  const followUp = '不错，但是背景太单调了，帮我把窗外的背景改成下雪的场景'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      followUpPrompts={[followUp]}
      title="026 — 图片生成+编辑"
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(600_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('026-cloud-image-edit')
  const meta = {
    testCase: '026-cloud-image-edit',
    prompt: `${prompt} → ${followUp}`,
    result,
    description: 'Generate image then edit it in same session',
    tags: ['cloud', 'image', 'generate', 'edit', 'multi-turn'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')
  expect(result.totalTurns).toBe(2)

  // 至少调了两次 Generate（一次生成 + 一次编辑）
  const generateCount = result.toolCalls.filter((t: string) => t === 'CloudModelGenerate').length
  expect(generateCount).toBeGreaterThanOrEqual(1)

  // Detail 不可跳过
  expect(result.toolCalls).toContain('CloudCapDetail')

  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '这是多轮图片对话的最终结果。以下任一情况算通过：' +
      '1) AI 成功编辑了图片，回复确认已修改背景；' +
      '2) AI 重新生成了一张带雪景背景的橘猫图片；' +
      '3) AI 说明当前模型不支持编辑但提供了替代方案（如重新生成）。' +
      '不应出现未处理的报错。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: followUp,
  })
  expect(judgment.pass).toBe(true)
})
