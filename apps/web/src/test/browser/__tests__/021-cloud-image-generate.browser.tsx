/**
 * 021: Cloud 图片生成 — 命名工具首选路径。
 *
 * 验证 AI 使用扁平化命名工具 CloudImageGenerate 完成生图，不走
 * Browse → Detail → Generate 的进阶路径。链路应压缩到 4 轮以内：
 * LoadSkill → ToolSearch → CloudImageGenerate → (Read 展示)。
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
    description: '云端文生图：Browse → Detail → Generate 全流程',
    tags: ['cloud', 'image', 'generate'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 命名工具首选路径：必须调了 CloudImageGenerate
  expect(result.toolCalls).toContain('CloudImageGenerate')

  // 不应回退到 Browse/Detail/ModelGenerate 的长链路
  expect(result.toolCalls).not.toContain('CloudCapBrowse')
  expect(result.toolCalls).not.toContain('CloudCapDetail')
  expect(result.toolCalls).not.toContain('CloudModelGenerate')

  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '回复应该确认图片已生成成功（例如"图片已生成"、"这是你的图"等），或以某种方式呈现生成结果（文本、路径、说明均可）。不应出现报错信息、未登录提示、"capabilities_probing"、"no_variant_available" 等失败词汇。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
