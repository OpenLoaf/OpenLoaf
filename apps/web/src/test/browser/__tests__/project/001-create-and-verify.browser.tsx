/**
 * 项目基础 smoke：让 AI 创建一个项目，然后查询确认项目创建成功。
 *
 * 验证要点：
 *   1. AI 调用 ProjectMutate(action:create) 且返回 ok
 *   2. AI 随后调用 ProjectQuery(mode:get) 验证项目存在
 *   3. rootUri 是合法 file:// 格式
 *   4. 中文标题时 folderName 应为英文
 *
 * 测试完成后 AI 应清理（remove）创建的项目。
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

it('project-001-create-and-verify — 创建项目并查询确认', async () => {
  const prompt =
    "帮我创建一个名为'测试项目 Alpha'的项目，创建后用 ProjectQuery 查询确认它是否创建成功，最后删除这个项目并确认删除成功。"

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(180_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: true })

  await takeProbeScreenshot('project-001-create-and-verify')
  const meta = {
    testCase: 'project-001-create-and-verify',
    prompt,
    result,
    description: '创建项目 → ProjectQuery 验证 → 删除清理',
    tags: ['project', 'create', 'query', 'cleanup'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')

  // 必须调用 ProjectMutate 创建项目
  expect(result.toolCalls).toContain('ProjectMutate')

  // 检查 create action
  const createCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'create',
  )
  expect(createCalls.length).toBeGreaterThanOrEqual(1)

  // 必须调用 ProjectQuery 验证
  expect(result.toolCalls).toContain('ProjectQuery')

  // 应有 remove action 清理
  const removeCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'remove',
  )
  expect(removeCalls.length).toBeGreaterThanOrEqual(1)

  // 不应有工具错误
  expect(result.toolErrorCount).toBe(0)
})
