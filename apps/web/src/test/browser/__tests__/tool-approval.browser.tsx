/**
 * 工具审批流测试。
 * - 101: approve-all → 搜索工具被调用，结果包含天气信息
 * - 102: reject-all → 工具被拒绝，AI 以纯文字回复
 */
import { describe, it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import {
  waitForChatComplete,
  waitForProbeResult,
  takeProbeScreenshot,
} from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

describe('Tool approval probe', () => {
  it('101 — approve-all 搜索工具被调用', async () => {
    const prompt = '搜索一下今天的天气'

    render(
      <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
    )

    await waitForChatComplete()
    const result = await waitForProbeResult()

    // Save data before assertions (recorded even on failure)
    await takeProbeScreenshot('101-web-search-approve')
    const meta = { testCase: '101-web-search-approve', prompt, result, description: 'Search tool called, response contains weather info', tags: ['web-search', 'approval'] }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    // Assertions
    expect(result.status).toBe('ok')
    // 断言：应该调用了搜索相关工具
    expect(result.toolCalls.length).toBeGreaterThan(0)
    // 断言：回复应包含天气相关内容（温度/天气/℃ 等）
    expect(result.textPreview).toMatch(/天气|温度|℃|°C|晴|雨|阴|多云/u)
  })

  it('102 — reject-all 工具被拒绝，AI 纯文字回复', async () => {
    const prompt = '搜索一下今天的天气'

    render(
      <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="reject-all" />,
    )

    await waitForChatComplete()
    const result = await waitForProbeResult()

    // Save data before assertions (recorded even on failure)
    await takeProbeScreenshot('102-web-search-reject')
    const meta = { testCase: '102-web-search-reject', prompt, result, description: 'Tools rejected, AI responds with text-only fallback', tags: ['web-search', 'approval', 'reject'] }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    // Assertions
    expect(result.status).toBe('ok')
    // 断言：回复不为空（AI 应该给出文字回复而非静默）
    expect(result.textPreview.length).toBeGreaterThan(10)
  })
})
