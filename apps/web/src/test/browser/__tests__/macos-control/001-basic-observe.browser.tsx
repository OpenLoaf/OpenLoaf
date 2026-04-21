/**
 * macOS 桌面控制 — 基础 observe smoke。
 *
 * 验证：用户问"看看我电脑屏幕上在干什么"时，agent 调用一次 `MacosObserve`
 * 就拿到截图 + AX 树，然后回答——**不要**无意义地再调 act。
 *
 * 前置：server 以 `OPENLOAF_MACOS_HELPER_MOCK=1` 启动；mock 默认 scenario 返回
 * Finder/Downloads 窗口的 AX 树样本 + 1×1 PNG 占位。
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

it('macos-control-001-basic-observe — agent 用 MacosObserve 读屏一次并作答', async () => {
  const prompt = '看看我电脑屏幕上当前显示的是什么，简短回答一下就行。'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      approvalStrategy="approve-all"
      macosHelperMock={{ scenario: 'default' }}
    />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(120_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: false })

  await takeProbeScreenshot('macos-control-001-basic-observe')
  const meta = {
    testCase: 'macos-control-001-basic-observe',
    prompt,
    result,
    description: 'MacosObserve 基础 smoke — 读屏一次并作答',
    tags: ['macos-control', 'observe', 'smoke'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  expect(result.toolCalls).toContain('MacosObserve')
  // 读屏场景不需要操作动作
  expect(result.toolCalls).not.toContain('MacosAct')
  expect(result.toolErrorCount).toBe(0)
  // 回答必须提到 mock 场景里的 Finder 或 Downloads
  expect(result.textPreview).toMatch(/finder|downloads|访达|下载/i)
})
