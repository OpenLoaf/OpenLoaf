/**
 * 025: Cloud 能力发现 — 只 Browse 不 Generate。
 *
 * 用户只是问有哪些能力，AI 应该只调 Browse 返回信息，
 * 不应该触发任何 Generate 操作（零积分消耗）。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import { waitForChatComplete, waitForProbeResult, takeProbeScreenshot, aiJudge } from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('025 — Cloud 能力发现：查看可用生成能力', async () => {
  const prompt = '你能帮我生成哪些东西？图片视频音频什么的，有哪些模型可以用？'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} title="025 — Cloud 能力发现" approvalStrategy="approve-all" />,
  )

  await waitForChatComplete(90_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('025-cloud-browse-discovery')
  const meta = {
    testCase: '025-cloud-browse-discovery', prompt, result,
    description: 'Cloud capability discovery: Browse only, no Generate calls',
    tags: ['cloud', 'browse', 'discovery'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')

  // 必须调了 Browse
  expect(result.toolCalls).toContain('CloudCapBrowse')

  // 不应调 Generate（用户只是问有什么能力）
  expect(result.toolCalls).not.toContain('CloudModelGenerate')
  expect(result.toolCalls).not.toContain('CloudTextGenerate')

  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria:
      '回复应列出可用的云端生成能力，至少提到图片和视频两个类别。' +
      '应该给出一些具体的模型或功能名称。不应尝试执行任何生成操作。',
    aiResponse: result.textPreview,
    toolCalls: result.toolCalls,
    userPrompt: prompt,
  })
  expect(judgment.pass).toBe(true)
})
