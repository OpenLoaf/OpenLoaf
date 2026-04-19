/**
 * bash-007-background-kill-and-fail — 后台任务 Kill + 失败通知
 *
 * 测试目的：
 * 验证 AI 能正确完成复杂的后台任务管理流程：
 * 1. 在后台启动长时间任务 sleep 300
 * 2. 立刻用 Kill 工具杀掉该任务
 * 3. 用 Jobs 确认任务状态为 killed
 * 4. 再在后台启动必定失败的任务 exit 1
 * 5. 等待失败通知并汇报所有结果
 *
 * approvalStrategy: approve-all（场景复杂，避免审批干扰核心验证）
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

it('bash-007-background-kill-and-fail — 后台任务 Kill + 失败通知', async () => {
  const prompt =
    '请完成以下操作：1) 用 Bash 工具的 run_in_background 在后台运行 sleep 300  2) 然后立刻用 Kill 工具杀掉这个后台任务  3) 用 Jobs 工具确认任务状态  4) 再用 Bash 工具在后台运行 exit 1  5) 用 Sleep 工具等待失败通知，告诉我所有结果'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  await takeProbeScreenshot('bash-007-background-kill-and-fail')

  const meta = {
    testCase: 'bash-007-background-kill-and-fail',
    prompt,
    result,
    description: '在 approve-all 模式下，AI 后台启动 sleep 300 → Kill 杀掉 → Jobs 确认 killed → 后台运行 exit 1 → 等待失败通知并汇报所有结果',
    tags: ['bash', 'background', 'kill', 'fail-notification', 'jobs', 'approve-all'],
  }

  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.toolCalls).toContain('Bash')
  expect(result.toolCalls).toContain('Kill')
  expect(result.toolCalls).toContain('Jobs')
  expect(result.status).toBe('ok')
  expect(result.textPreview.length).toBeGreaterThan(20)
}, 180_000)
