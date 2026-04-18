/**
 * 021b: Cloud 图片生成 — 使用已采集的 fixture 做 mock 回放。
 *
 * 前置：runs.jsonl 里已存在 `021-cloud-image-generate` 的成功 fixture
 * （fingerprint 与当前代码一致）。Server 必须带 `OPENLOAF_CLOUD_MOCK=1` 启动。
 *
 * 验证：
 * - AI 依然经过 LoadSkill → ToolSearch → CloudImageGenerate 链路
 * - CloudImageGenerate 返回的 output 来自 fixture（elapsed 远小于真实调用，~1-3s）
 * - aiJudge 确认图片已生成（UI 正常渲染复制过来的 fixture 图片）
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('021b — Cloud 图片生成 (mock 回放)', async () => {
  const prompt = '帮我生成一张猫的图片'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      title="021b — Cloud 图片生成 (mock)"
      approvalStrategy="approve-all"
      cloudMock={{ testCase: 'cloud-001-image-generate', mode: 'mock' }}
    />,
  )

  await waitForChatComplete(120_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('cloud-001b-image-generate-mocked')
  const meta = {
    testCase: 'cloud-001b-image-generate-mocked',
    prompt,
    result,
    description: '云端文生图：Browse → Detail → Generate 全流程',
    tags: ['cloud', 'image', 'generate', 'mocked'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  expect(result.toolCalls).toContain('CloudImageGenerate')
  // Mock 回放必须远远快于真实调用（真实 ~30-60s，mock 应 < 15s 含 LoadSkill/ToolSearch）
  expect(result.elapsedMs).toBeLessThan(15_000)

  const judgment = await aiJudge({
    testCase: 'cloud-001-image-generate',
    serverUrl: SERVER_URL,
    criteria:
      '回复应确认图片已生成（例如"图片已生成"、"展示给你"等）。不应出现报错、未登录、capabilities_probing 等失败词汇。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
