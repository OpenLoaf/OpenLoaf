/**
 * bash-001-foreground-basics
 *
 * 测试目的：验证前台 Bash 基础执行能力，以及 manual 审批模式下白名单命令不触发审批弹窗。
 * 用户请求 AI 列出当前目录文件并查询 node 版本，ls 和 node --version 均为白名单安全命令，
 * 即使在 manual 审批模式下也应直接执行，无需用户手动确认。
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

it('bash-001-foreground-basics — 前台 Bash 基础执行 + manual 审批模式下白名单命令不弹窗', async () => {
  const prompt = '请帮我看一下当前目录有哪些文件，然后告诉我 node 的版本号'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="manual" />,
  )

  await waitForChatComplete()
  const result = await waitForProbeResult()

  await takeProbeScreenshot('bash-001-foreground-basics')
  const meta = {
    testCase: 'bash-001-foreground-basics',
    prompt,
    result,
    description:
      '前台 Bash 基础执行：ls 列目录 + node --version 查版本，manual 审批模式下白名单命令不触发审批弹窗',
    tags: ['bash', 'foreground', 'whitelist', 'manual-approval'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // 断言 1：AI 调用了 Bash 工具
  expect(result.toolCalls).toContain('Bash')
  // 断言 2：整体状态正常完成
  expect(result.status).toBe('ok')
  // 断言 3：AI 给出了实质性回复（不是空回复）
  expect(result.textPreview.length).toBeGreaterThan(20)
}, 180_000)
