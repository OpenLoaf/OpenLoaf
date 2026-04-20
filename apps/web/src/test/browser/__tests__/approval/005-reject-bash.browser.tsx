/**
 * Bash 审批 reject-all 路径：
 * reject-all → 审批拒绝 → Bash 不执行 → turn 直接结束（无 AI 续发文字）。
 *
 * 设计行为（2026-04-20 修复后）：
 * - 用户拒绝后 server 返回空 SSE finish，不跑 LLM。
 * - probe 状态正确到达 complete，无 AI text parts。
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

it('approval-005 — reject-all Bash 审批被拒绝，turn 直接结束（无 AI 续发）', async () => {
  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={APPROVAL_PROMPT}
      approvalStrategy="reject-all"
    />,
  )

  await waitForChatComplete(60_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('approval-005-reject-bash')
  const meta = {
    testCase: 'approval-005-reject-bash',
    prompt: APPROVAL_PROMPT,
    result,
    description: '审批闸门拒绝 Bash，turn 直接结束，无 AI 续发',
    tags: ['approval', 'bash', 'reject-all'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  // 拒绝后 turn 结束，不应有 AI 文字回复
  expect(result.textPreview.length, '拒绝后 AI 不应生成文字').toBe(0)
})
