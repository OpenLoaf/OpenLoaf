/**
 * 010: AI 介入式工具审批测试。
 *
 * 演示 approvalStrategy="manual" 模式下，测试代码（代表 AI agent）
 * 通过 waitForInteraction → approveCurrentTool/rejectCurrentTool
 * 循环驱动审批流程，而非预设 approve-all/reject-all。
 *
 * 使用 Write 工具（needsApproval: true）确保触发审批流程。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../ChatProbeHarness'
import {
  waitForInteraction,
  approveCurrentTool,
  waitForProbeResult,
  takeProbeScreenshot,
} from '../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('010 — AI 介入式审批：Write 工具触发审批，逐个决策', async () => {
  const prompt = '请用 Write 工具在 /tmp 目录下创建一个名为 probe_test_010.txt 的文件，内容写 "hello from probe test"。'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      approvalStrategy="manual"
    />,
  )

  // ── 交互循环：等待审批 → 观察 → 决策 → 继续 ──
  let approvedCount = 0
  const maxRounds = 20

  for (let round = 0; round < maxRounds; round++) {
    const state = await waitForInteraction(90_000)

    if (state.hasPendingApproval) {
      await approveCurrentTool()
      approvedCount++
      await takeProbeScreenshot(`010-round-${round}-approved`)
      continue
    }

    if (state.probeStatus === 'complete' || state.probeStatus === 'error') {
      break
    }

    await new Promise(r => setTimeout(r, 500))
  }

  const result = await waitForProbeResult()

  // ── 先保存数据和截图（无论 pass/fail 都记录） ──
  await takeProbeScreenshot('010-interactive-approval-final')
  const meta = {
    testCase: '010-interactive-approval', prompt, result,
    description: `AI 驱动交互审批：已批准 ${approvedCount} 次 Write 工具`,
    tags: ['interactive', 'approval', 'write-tool'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // ── 断言 ──
  expect(result.status).toBe('ok')
  expect(approvedCount).toBeGreaterThan(0)
  expect(result.toolCalls).toContain('Write')
})
