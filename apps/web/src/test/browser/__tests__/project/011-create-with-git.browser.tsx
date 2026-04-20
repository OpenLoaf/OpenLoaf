/**
 * 跨功能结合：项目 + Git 集成。
 *
 * 验证要点：
 *   1. AI 创建项目并开启 enableVersionControl
 *   2. 项目目录有 .git
 *   3. AI 能查看 git 状态
 *   4. 测试完成后清理项目
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import {
  waitForChatComplete,
  waitForMessageCount,
  waitForProbeResult,
  takeProbeScreenshot,
} from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('project-011-create-with-git — 创建带版本控制的项目', async () => {
  const prompt = [
    '请执行以下操作：',
    "1) 创建一个叫 'Git Project' 的项目，开启版本控制",
    '2) 用命令检查项目目录下是否有 .git 文件夹',
    '3) 查看这个项目的 git 状态',
    '4) 最后删除这个项目',
  ].join('\n')

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(180_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: true })

  await takeProbeScreenshot('project-011-create-with-git')
  const meta = {
    testCase: 'project-011-create-with-git',
    prompt,
    result,
    description: '创建项目(enableVersionControl)→验证 .git→查 git status→清理',
    tags: ['project', 'git', 'version-control', 'cross-feature', 'cleanup'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')

  // 必须有 ProjectMutate create
  const createCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'create',
  )
  expect(createCalls.length).toBeGreaterThanOrEqual(1)

  // create 应带 enableVersionControl: true
  const createInput = createCalls[0]?.input as any
  expect(createInput?.enableVersionControl).toBe(true)

  // 必须用 Bash 验证 .git 和 git status
  expect(result.toolCalls).toContain('Bash')

  // 必须有 remove 清理
  const removeCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'remove',
  )
  expect(removeCalls.length).toBeGreaterThanOrEqual(1)

  // 不应有工具错误
  expect(result.toolErrorCount).toBe(0)
})
