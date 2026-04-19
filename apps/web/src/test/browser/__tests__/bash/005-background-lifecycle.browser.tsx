/**
 * bash-005-background-lifecycle
 *
 * 测试目的：验证 AI 能完整处理后台 Bash 任务的生命周期
 *
 * 测试步骤：
 * 1. 用户请求在后台运行命令（sleep 2 && echo OPENLOAF_BG_TEST_DONE）
 * 2. AI 调用 Bash(run_in_background: true) 启动后台任务
 * 3. AI 调用 Sleep 等待任务完成通知
 * 4. bg-task-notification 唤醒 AI
 * 5. AI 通过 Read(output_path) 或 Jobs 读取执行结果
 * 6. AI 向用户报告输出内容
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

it('bash-005-background-lifecycle — 后台 Bash 任务完整生命周期：启动 → Sleep 等待 → 通知唤醒 → 读取结果', async () => {
  const prompt = '用 Bash 工具的 run_in_background 在后台运行命令 sleep 2 && echo OPENLOAF_BG_TEST_DONE，然后用 Sleep 工具等待后台任务完成通知，完成后告诉我输出结果'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="manual" />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  await takeProbeScreenshot('bash-005-background-lifecycle')

  const meta = {
    testCase: 'bash-005-background-lifecycle',
    prompt,
    result,
    description: '后台 Bash 任务完整生命周期：AI 启动后台命令、Sleep 等待通知、唤醒后读取结果并汇报',
    tags: ['bash', 'background', 'sleep', 'notification', 'lifecycle'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // 1. 必须调用过 Bash（后台启动）
  expect(result.toolCalls).toContain('Bash')

  // 2. 必须调用过 Sleep（等待后台任务通知）
  expect(result.toolCalls).toContain('Sleep')

  // 3. 整体状态正常
  expect(result.status).toBe('ok')

  // 4. 最终回复包含实质内容（报告输出结果）
  expect(result.textPreview.length).toBeGreaterThan(10)
}, 180_000)
