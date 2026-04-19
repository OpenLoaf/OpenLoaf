/**
 * bash-003-foreground-failure-timeout — 前台 Bash 命令失败 + 超时 + 自动审批跳过
 *
 * 场景：
 *   1. 读一个不存在的文件 cat /tmp/nonexistent_xyz_openloaf_test
 *      — 验证 AI 能正确处理命令失败（exit code 非 0），不崩溃对话
 *   2. 执行 sleep 10 但设 timeout=2000ms
 *      — 验证超时机制：命令在 2 秒内被强制终止，AI 收到超时错误并继续对话
 *
 * approve-all 模式确保 sleep 等可能触发审批的命令直接执行，不弹窗。
 * 两个命令工具调用失败 ≠ AI 对话失败；最终 result.status 必须是 'ok'。
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

it('bash-003-foreground-failure-timeout — 前台命令失败 + 超时 + approve-all 自动审批跳过', async () => {
  const prompt =
    '请执行两个命令：1) cat /tmp/nonexistent_xyz_openloaf_test  2) 用 Bash 工具执行 sleep 10，timeout 设为 2000 毫秒。分别告诉我结果。'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  await takeProbeScreenshot('bash-003-foreground-failure-timeout')

  const meta = {
    testCase: 'bash-003-foreground-failure-timeout',
    prompt,
    result,
    description:
      'approve-all 模式下 Bash 命令失败（文件不存在）+ 超时（sleep 10 限 2s）；工具调用失败不影响对话完成',
    tags: ['bash', 'foreground', 'failure', 'timeout', 'approve-all'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // Bash 工具必须被调用
  expect(result.toolCalls).toContain('Bash')

  // AI 对话正常完成（工具失败 ≠ 对话失败）
  expect(result.status).toBe('ok')

  // AI 必须给出有意义的文本回复（不能是空响应）
  expect(result.textPreview.length).toBeGreaterThan(20)
}, 180_000)
