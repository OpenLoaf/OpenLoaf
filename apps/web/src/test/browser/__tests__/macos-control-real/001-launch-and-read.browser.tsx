/**
 * macOS 桌面控制 — 端到端真机（Layer 4）：拉起测试 harness → observe → 回答。
 *
 * 前置（测试作者手工保证）：
 *   1. server 以 **desktop runtime** 运行（`pnpm desktop`），Electron 起，
 *      helper 作为 server 子进程有 GUI 上下文
 *   2. `MacosControlTestHarness.app` 已 build + lsregister（由
 *      `apps/desktop/scripts/buildMacosControlTestHarness.mjs` 负责）
 *   3. Screen Recording + Accessibility 授权给 OpenLoaf Desktop
 *
 * **故意不设 macosHelperMock** — 走真 helper + 真 harness。
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

it('macos-control-real-001-launch-and-read — 拉起 harness 并读 counter', async () => {
  const prompt =
    '请拉起名为 "MacosControlTestHarness" 的 macOS 应用。等它启动后，' +
    '对它做一次 observe，从 AX 树里找到 identifier 为 "lbl-count" 的节点，' +
    '告诉我它当前显示的文字内容。简短回答即可。'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      approvalStrategy="approve-all"
    />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(180_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: false })

  await takeProbeScreenshot('macos-control-real-001-launch-and-read')
  const meta = {
    testCase: 'macos-control-real-001-launch-and-read',
    prompt,
    result,
    description: '真 helper + 真 harness：拉起 + 读屏 smoke',
    tags: ['macos-control-real', 'observe', 'launch_app', 'e2e'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  // 必须走 launch_app（MacosAct）+ 至少一次 MacosObserve
  expect(result.toolCalls).toContain('MacosAct')
  expect(result.toolCalls).toContain('MacosObserve')
  expect(result.toolErrorCount).toBe(0)
  // 初始 counter 是 0 — 回答里应带 "0" 或 "Counter" 字眼
  expect(result.textPreview).toMatch(/counter|0|零/i)
})
