/**
 * Bash 审批 approve-all 路径：
 * 使用专用 magic 字符串 `openloaf-test-approval`（见 commandApproval.ts 的
 * TEST_APPROVAL_COMMAND）强制触发审批，不会真正执行破坏性命令。
 * approve-all → 审批通过 → Bash 执行 → shell 报 "command not found"（无害）。
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

it('approval-003 — approve-all Bash 审批通过被执行', async () => {
  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={APPROVAL_PROMPT}
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  await takeProbeScreenshot('approval-003-approve-bash')
  const meta = {
    testCase: 'approval-003-approve-bash',
    prompt: APPROVAL_PROMPT,
    result,
    description: '带魔法标记的 Bash 自动批准并执行',
    tags: ['approval', 'bash', 'approve-all'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  expect(result.toolCalls).toContain('Bash')
})
