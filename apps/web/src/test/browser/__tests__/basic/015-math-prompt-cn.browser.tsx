/**
 * 1+1 中文提示词 — 对照组（与 017 英文提示词配对，比较 token 用量差异）。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import {
  waitForChatComplete,
  waitForMessageCount,
  waitForProbeResult,
  takeProbeScreenshot,
} from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('basic-015 — 1+1 中文提示词 token 基线', async () => {
  const prompt = '计算 1+1 等于几？只回答数字。'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete()

  const result = await waitForProbeResult()

  await takeProbeScreenshot('basic-015-math-prompt-cn')
  const meta = {
    testCase: 'basic-015-math-prompt-cn',
    prompt,
    result,
    description: '1+1 中文提示词：对照英文版用于 token 用量比较',
    tags: ['basic', 'no-tools', 'prompt-lang-compare', 'cn'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  expect(result.toolCalls.length).toBe(0)
  expect(result.textPreview).toContain('2')
})
