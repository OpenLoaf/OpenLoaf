/**
 * macOS 桌面控制 — 权限缺失流程。
 *
 * 当 mock 返回 `permissionsMissing: ['screen','accessibility']` 时：
 * 1. MacosObserve 返回权限缺失消息
 * 2. Agent 必须**停止**，把引导文案复述给用户，不能进入无意义重试循环
 * 3. maxSteps=3 — 再重试就会触顶，硬性兜底
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

it('macos-control-003-permission-missing — 缺权限时 agent 应停止并复述引导，不重试', async () => {
  const prompt = '帮我看看屏幕上显示什么。'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      approvalStrategy="approve-all"
      macosHelperMock={{ scenario: 'permissionsMissing' }}
    />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(120_000)

  // allowToolErrors=true — mock 返回 ok:false 但这不是工具 bug，是预期行为
  const result = await waitForProbeResult(15_000, { allowToolErrors: true })

  await takeProbeScreenshot('macos-control-003-permission-missing')
  const meta = {
    testCase: 'macos-control-003-permission-missing',
    prompt,
    result,
    description: '权限缺失时 agent 应复述引导、不重试',
    tags: ['macos-control', 'permissions', 'error-path'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  // 至少调用一次 MacosObserve 才能看到缺权限信号
  const observeCalls = result.toolCallDetails.filter((t) => t.name === 'MacosObserve')
  expect(observeCalls.length).toBeGreaterThanOrEqual(1)
  // 但不能无脑重试——2 次以内可接受（首次 + 可能的一次 LLM 自我纠正），>2 就是退化
  expect(observeCalls.length).toBeLessThanOrEqual(2)
  // 缺权限时不应调 MacosAct
  expect(result.toolCalls).not.toContain('MacosAct')
  // AI 必须向用户提到权限/设置/授权/Privacy 等关键词
  expect(result.textPreview).toMatch(/权限|授权|设置|permission|privacy|settings/i)
})
