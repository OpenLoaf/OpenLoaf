/**
 * 基础 smoke：简单数学题，无工具调用，回复包含 "2"。
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

it('basic-001 — 简单数学题，无工具，回复包含数字', async () => {
  const prompt = '简单回答：1+1等于几？只回答数字。'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete()

  const result = await waitForProbeResult()

  await takeProbeScreenshot('basic-001-math-no-tools')
  const meta = {
    testCase: 'basic-001-math-no-tools',
    prompt,
    result,
    description: '纯文本问答：1+1 答案含「2」',
    tags: ['basic', 'no-tools'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  expect(result.toolCalls.length).toBe(0)
  expect(result.textPreview).toContain('2')
})
