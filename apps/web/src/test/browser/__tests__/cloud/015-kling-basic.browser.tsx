/**
 * 015: Kling 视频生成 — 基础版（OL-VG-010 "Kling"）。
 *
 * 模拟用户最直白的说法："用 Kling 做一段视频"。
 * AI 先调 CloudImageGenerate 出一张首帧图，再调 CloudVideoGenerate 并把
 * modelHint 设成 "Kling" 类子串，让 pickVariant fuzzy-match 到 OL-VG-010
 * （三个 Kling 变体里最便宜的基础版，30 credits/s）。
 *
 * 不断言 duration / aspectRatio / mode — 工具层只暴露 duration + modelHint，
 * Kling variant 特色参数（std/pro、16:9/9:16、audio）当前工具层不透传。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('cloud-015-kling-basic — Kling 基础版视频（OL-VG-010）', async () => {
  const prompt =
    '帮我画一张雪山湖泊的风景图，然后用 Kling 把它做成一段 5 秒的视频，要有湖面微风波纹和云层缓慢飘动的效果'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      title="015 — Kling 基础版"
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(600_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('cloud-015-kling-basic')
  const meta = {
    testCase: 'cloud-015-kling-basic', prompt, result,
    description: 'Kling 基础版视频生成（OL-VG-010，先生图再生视频）',
    tags: ['cloud', 'video', 'kling', 'kling-basic', 'OL-VG-010'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 工作流：先生图，再生视频
  expect(result.toolCalls).toContain('CloudImageGenerate')
  expect(result.toolCalls).toContain('CloudVideoGenerate')

  // 取 CloudVideoGenerate 这一次调用的 modelHint，验证选到了 Kling 变体
  const videoCall = result.toolCallDetails.find((t: any) => t.name === 'CloudVideoGenerate')
  expect(videoCall, 'CloudVideoGenerate call should be present').toBeTruthy()
  const hint = String((videoCall as any)?.input?.modelHint ?? '').toLowerCase()
  // 必须带 kling 关键词；不应显式指向 v3 / omni
  expect(hint).toMatch(/kling|ol-vg-01[012]/)
  expect(hint).not.toMatch(/v3|omni/)
  expect((videoCall as any)?.hasError).toBeFalsy()

  const judgment = await aiJudge({
    testCase: 'cloud-015-kling-basic',
    serverUrl: SERVER_URL,
    criteria:
      '回复应确认视频已生成成功。流程：先生成一张雪山湖泊图，再用 Kling 把它做成 5 秒视频。' +
      '不应出现 "502"、"no_variant_available"、"未登录" 等失败词；不应把 CDN URL 当正文贴回气泡。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
