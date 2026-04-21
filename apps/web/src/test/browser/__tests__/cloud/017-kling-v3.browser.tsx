/**
 * 017: Kling 视频生成 — v3 版（OL-VG-011 "Kling v3"）。
 *
 * 模拟用户明确指定 v3 + 非默认时长（slider 3-15s）+ 带首尾帧的场景：
 *   "先画一张朝阳、再画一张夕阳，用 Kling v3 做一段 5 秒的时间流逝视频，从朝阳过渡到夕阳"
 *
 * 关键验证：
 *   - modelHint fuzzy-match 到 "Kling v3"（OL-VG-011），不退化到 OL-VG-010（基础版）
 *   - CloudImageGenerate 调用 ≥ 2 次（start + end 两张帧）
 *   - CloudVideoGenerate 同时带 startImage + endImage + duration≈5（统一按 5s 省积分；v3 schema 理论最低是 3s）
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('cloud-017-kling-v3 — Kling v3 视频，带首尾帧（OL-VG-011）', async () => {
  const prompt =
    '先帮我生成两张图：一张朝阳下的山谷、一张夕阳下的同一山谷；然后用 Kling v3 把它们做成一段 5 秒的时间流逝视频，画面从朝阳自然过渡到夕阳'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      title="017 — Kling v3 首尾帧"
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(600_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('cloud-017-kling-v3')
  const meta = {
    testCase: 'cloud-017-kling-v3', prompt, result,
    description: 'Kling v3 视频生成（OL-VG-011），首帧+尾帧+最小时长 5s',
    tags: ['cloud', 'video', 'kling', 'kling-v3', 'OL-VG-011', 'startImage', 'endImage'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 工作流：至少两次生图 + 一次生视频。
  // 注意：result.toolCalls 是去重 Set，只能判"用过没用过"；要统计次数必须从 toolCallDetails 数。
  expect(result.toolCalls).toContain('CloudImageGenerate')
  expect(result.toolCalls).toContain('CloudVideoGenerate')
  const imageCallCount = result.toolCallDetails.filter((t: any) => t.name === 'CloudImageGenerate').length
  expect(imageCallCount, 'expect 2 images (start + end frame)').toBeGreaterThanOrEqual(2)

  const videoCall = result.toolCallDetails.find((t: any) => t.name === 'CloudVideoGenerate')
  expect(videoCall, 'CloudVideoGenerate call should be present').toBeTruthy()
  const videoInput: any = (videoCall as any)?.input ?? {}
  const hint = String(videoInput.modelHint ?? '').toLowerCase()
  // 必须明确命中 v3（不能退到基础 kling 或 omni）
  expect(hint).toMatch(/(kling\s*v3|ol-vg-011|v3)/)
  expect(hint).not.toMatch(/omni/)

  // 带了首尾帧
  expect(videoInput.startImage, 'startImage required').toBeTruthy()
  expect(videoInput.endImage, 'endImage expected for v3 two-keyframe test').toBeTruthy()
  // duration 请求 5s；允许后端取整到 3-6
  if (typeof videoInput.duration === 'number') {
    expect(videoInput.duration).toBeGreaterThanOrEqual(3)
    expect(videoInput.duration).toBeLessThanOrEqual(6)
  }
  expect((videoCall as any)?.hasError).toBeFalsy()

  const judgment = await aiJudge({
    testCase: 'cloud-017-kling-v3',
    serverUrl: SERVER_URL,
    criteria:
      '回复应确认视频已生成。流程：先画了两张图（朝阳山谷 + 夕阳山谷），再用 Kling v3 以它们为首尾帧合成一段约 5 秒的时间流逝视频。' +
      '不应出现 "502"、"no_variant_available"、"需要输入首帧图片"、"未登录" 等失败词；不应把 CDN URL 当正文贴回气泡。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
