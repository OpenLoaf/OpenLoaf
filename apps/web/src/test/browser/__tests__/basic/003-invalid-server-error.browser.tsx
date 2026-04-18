/**
 * 基础 smoke：连接不存在的 server 必须显示 error 状态（探针错误态路径）。
 */
import { it } from 'vitest'
import { render } from 'vitest-browser-react'
import ChatProbeHarness from '../../ChatProbeHarness'
import { waitForProbeStatus, takeProbeScreenshot } from '../../probe-helpers'

it('basic-003 — 连接无效 server 应显示错误', async () => {
  render(
    <ChatProbeHarness serverUrl="http://127.0.0.1:19999" prompt="this should fail" />,
  )

  await waitForProbeStatus('error', 15_000)

  await takeProbeScreenshot('basic-003-invalid-server-error')
})
