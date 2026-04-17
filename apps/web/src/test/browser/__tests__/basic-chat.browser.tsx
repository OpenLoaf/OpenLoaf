/**
 * 基础 Chat Probe 测试。
 * - 100: 简单数学题，无工具调用，回复包含 "2"
 * - error: 连接不存在的 server
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import {
  waitForChatComplete,
  waitForProbeStatus,
  waitForMessageCount,
  waitForProbeResult,
  takeProbeScreenshot,
} from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

describe('Basic chat probe', () => {
  it('100 — 简单数学题，无工具，回复包含数字', async () => {
    const prompt = '简单回答：1+1等于几？只回答数字。'

    render(
      <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
    )

    await waitForMessageCount(2, 30_000)
    await waitForChatComplete()

    const result = await waitForProbeResult()

    // Save data before assertions (recorded even on failure)
    await takeProbeScreenshot('100-basic-math')
    const meta = { testCase: '100-basic-math', prompt, result, description: '纯文本问答：1+1 答案含「2」', tags: ['basic', 'no-tools'] }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    // Assertions
    expect(result.status).toBe('ok')
    // 断言：简单数学题不应该调用工具
    expect(result.toolCalls.length).toBe(0)
    // 断言：回复包含 "2"
    expect(result.textPreview).toContain('2')
  })

  it('error — 连接无效 server 应显示错误', async () => {
    render(
      <ChatProbeHarness serverUrl="http://127.0.0.1:19999" prompt="this should fail" />,
    )

    await waitForProbeStatus('error', 15_000)

    await takeProbeScreenshot('error-invalid-server')
  })
})
