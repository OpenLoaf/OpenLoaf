/**
 * macOS 桌面控制 — 端到端真机（Layer 4）：observe-act 循环改变真实 UI 状态。
 *
 * 任务：在 `MacosControlTestHarness` 窗口里，用 `ax_action: AXPress` 点击
 * `btn-increment` 按钮 3 次，然后读 `lbl-count` 的最终值。
 *
 * **为什么指定 AXPress 而不是 click**：AXPress 通过 Accessibility API 直接驱动，
 * 不依赖窗口 frontmost 状态；CGEvent click/type 需要目标窗口在前台，浏览器
 * 测试里 Chromium 会抢焦点，click 路径不可靠。
 *
 * 前置：同 001。
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

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'

it('macos-control-real-005-axpress-increment — 3 次 AXPress + 读 counter 终值', async () => {
  const prompt =
    '请拉起 "MacosControlTestHarness" 这个 macOS 应用。启动后做以下操作：\n' +
    '1. observe 一次拿到 AX 树\n' +
    '2. 找到 identifier 为 "btn-increment" 的按钮，用 `ax_action: AXPress`（不要用 click 坐标）触发一次\n' +
    '3. 再 observe 一次确认状态变化\n' +
    '4. 重复 AXPress + observe 共 3 轮\n' +
    '5. 最后一次 observe 后，告诉我 identifier 为 "lbl-count" 的节点显示的完整文字。简短回答。'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      approvalStrategy="approve-all"
    />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(240_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: false })

  await takeProbeScreenshot('macos-control-real-005-axpress-increment')
  const meta = {
    testCase: 'macos-control-real-005-axpress-increment',
    prompt,
    result,
    description: '真 helper + 真 harness：AXPress 循环 + 状态验证',
    tags: ['macos-control-real', 'observe-act', 'axpress', 'e2e'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  expect(result.toolCalls).toContain('MacosAct')
  expect(result.toolCalls).toContain('MacosObserve')
  expect(result.toolErrorCount).toBe(0)

  // counter 起始 0，AXPress 3 次后应为 3 — 回答里必须出现 "3"
  expect(result.textPreview).toMatch(/3|三/)

  // 序列检查：至少 3 次 MacosAct（launch + 3 次 AXPress）+ 3 次以上 MacosObserve
  const actCount = result.toolCallDetails.filter(
    (t: { name: string }) => t.name === 'MacosAct',
  ).length
  const obsCount = result.toolCallDetails.filter(
    (t: { name: string }) => t.name === 'MacosObserve',
  ).length
  expect(actCount).toBeGreaterThanOrEqual(3)
  expect(obsCount).toBeGreaterThanOrEqual(3)
})
