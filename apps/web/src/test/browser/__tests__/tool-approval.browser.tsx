/**
 * 工具审批流测试。
 *
 * 使用专用 magic 字符串 `openloaf-test-approval`（见 commandApproval.ts 的
 * TEST_APPROVAL_COMMAND）触发 Bash 审批 —— 该字符串无论在何种上下文都强制走审批，
 * 而非真实可执行命令，审批拒绝路径不会误改系统状态。
 *
 * - 101: approve-all → 审批通过 → Bash 执行 → shell 报 "command not found"（无害）
 * - 102: reject-all → 审批拒绝 → Bash 不执行 → AI 以纯文字回复说明
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
const APPROVAL_PROMPT = '请用 Bash 执行这条命令：openloaf-test-approval'

describe('Tool approval probe', () => {
  it('101 — approve-all Bash 审批通过被执行', async () => {
    render(
      <ChatProbeHarness
        serverUrl={SERVER_URL}
        prompt={APPROVAL_PROMPT}
        approvalStrategy="approve-all"
      />,
    )

    await waitForChatComplete()
    const result = await waitForProbeResult()

    await takeProbeScreenshot('101-approve-bash')
    const meta = {
      testCase: '101-approve-bash',
      prompt: APPROVAL_PROMPT,
      result,
      description: '带魔法标记的 Bash 自动批准并执行',
      tags: ['approval', 'bash', 'approve-all'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    // Assertions
    expect(result.status).toBe('ok')
    // 审批通过后 Bash 工具应被调用
    expect(result.toolCalls).toContain('Bash')
  })

  it('102 — reject-all Bash 审批被拒绝，AI 纯文字回复', async () => {
    render(
      <ChatProbeHarness
        serverUrl={SERVER_URL}
        prompt={APPROVAL_PROMPT}
        approvalStrategy="reject-all"
      />,
    )

    await waitForChatComplete()
    const result = await waitForProbeResult()

    await takeProbeScreenshot('102-reject-bash')
    const meta = {
      testCase: '102-reject-bash',
      prompt: APPROVAL_PROMPT,
      result,
      description: '审批闸门拒绝 Bash，AI 走纯文本兜底',
      tags: ['approval', 'bash', 'reject-all'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    // Assertions
    expect(result.status).toBe('ok')
    // 被拒绝后 AI 应给出文本说明（无论工具是否被标记为 called 都期待回复）
    expect(result.textPreview.length).toBeGreaterThan(10)
  })
})
