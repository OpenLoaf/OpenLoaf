/**
 * Bash 审批 reject-all 路径：
 * 同样用 magic 字符串 `openloaf-test-approval` 触发审批闸门。
 * reject-all → 审批拒绝 → Bash 不执行 → AI 走纯文字兜底回复说明。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import {
  waitForChatComplete,
  waitForProbeResult,
  takeProbeScreenshot,
} from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'
const APPROVAL_PROMPT = '请用 Bash 执行这条命令：openloaf-test-approval'

it('approval-005 — reject-all Bash 审批被拒绝，AI 纯文字回复', async () => {
  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={APPROVAL_PROMPT}
      approvalStrategy="reject-all"
    />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  await takeProbeScreenshot('approval-005-reject-bash')
  const meta = {
    testCase: 'approval-005-reject-bash',
    prompt: APPROVAL_PROMPT,
    result,
    description: '审批闸门拒绝 Bash，AI 走纯文本兜底',
    tags: ['approval', 'bash', 'reject-all'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  expect(result.textPreview.length).toBeGreaterThan(10)
})
