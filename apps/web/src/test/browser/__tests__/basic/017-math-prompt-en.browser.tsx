/**
 * 1+1 英文提示词 — 对照组（与 015 中文提示词配对，比较 token 用量差异）。
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

it('basic-017 — 1+1 英文提示词 token 基线', async () => {
  const prompt = 'What is 1+1? Reply with only the number.'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      approvalStrategy="approve-all"
      chatPromptLanguage="en"
    />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete()

  const result = await waitForProbeResult()

  await takeProbeScreenshot('basic-017-math-prompt-en')
  const meta = {
    testCase: 'basic-017-math-prompt-en',
    prompt,
    result,
    description: '1+1 英文提示词：对照中文版用于 token 用量比较',
    tags: ['basic', 'no-tools', 'prompt-lang-compare', 'en'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  expect(result.toolCalls.length).toBe(0)
  expect(result.textPreview).toContain('2')
})
