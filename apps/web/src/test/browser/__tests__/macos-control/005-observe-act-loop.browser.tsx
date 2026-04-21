/**
 * macOS 桌面控制 — observe-act 循环 smoke。
 *
 * 验证 agent 在执行交互任务时遵守 SKILL.md 铁律：
 * - **每次 act 后 observe 验证**：toolCalls 里 MacosObserve / MacosAct 应交替出现
 * - 首次操作前先 observe
 *
 * 任务：让 agent 在 mock Finder 窗口里点击"Downloads"侧边栏节点。
 * mock 默认 scenario 让所有 observe/act 都返回成功，agent 走完流程后作答。
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

it('macos-control-005-observe-act-loop — agent 遵守 observe-act 交替循环', async () => {
  const prompt = '在当前的访达窗口里，帮我点一下侧边栏的"Downloads"项。'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      approvalStrategy="approve-all"
      macosHelperMock={{ scenario: 'default' }}
    />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(180_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: false })

  await takeProbeScreenshot('macos-control-005-observe-act-loop')
  const meta = {
    testCase: 'macos-control-005-observe-act-loop',
    prompt,
    result,
    description: 'observe-act 循环 — act 前后必须 observe',
    tags: ['macos-control', 'observe-act', 'iron-rules'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  expect(result.toolCalls).toContain('MacosObserve')
  expect(result.toolCalls).toContain('MacosAct')
  expect(result.toolErrorCount).toBe(0)

  // 序列检查：首个 macos-* 调用必须是 Observe（铁律：先看后动）
  const macosSeq = result.toolCallDetails
    .map((t) => t.name)
    .filter((n) => n === 'MacosObserve' || n === 'MacosAct')
  expect(macosSeq[0]).toBe('MacosObserve')

  // 每次 Act 之后必须接一次 Observe 验证（最后一次 Act 可以不接，允许任务结束）
  for (let i = 0; i < macosSeq.length - 1; i++) {
    if (macosSeq[i] === 'MacosAct') {
      expect(macosSeq[i + 1]).toBe('MacosObserve')
    }
  }
})
