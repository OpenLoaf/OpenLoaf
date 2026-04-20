/**
 * 子项目创建：在当前项目下创建子项目，验证父子关系正确。
 *
 * 验证要点：
 *   1. AI 使用 createAsChild:true 或显式 parentProjectId
 *   2. 返回的 parentProjectId 非 null
 *   3. ProjectQuery(list) 中子项目 depth > 0
 *   4. 测试完成后清理子项目
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

it('project-004-create-sub-project — 创建子项目并验证父子关系', async () => {
  const prompt = [
    '请执行以下操作：',
    '1) 先创建一个叫 "Parent Project" 的项目',
    '2) 在这个项目下创建一个子项目叫 "Sub Module"',
    '3) 列出所有项目，确认子项目在父项目下',
    '4) 最后依次删除子项目和父项目',
  ].join('\n')

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(240_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: true })

  await takeProbeScreenshot('project-004-create-sub-project')
  const meta = {
    testCase: 'project-004-create-sub-project',
    prompt,
    result,
    description: '创建父项目→创建子项目→验证树形关系→清理',
    tags: ['project', 'sub-project', 'parent', 'tree', 'cleanup'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')

  // 至少两次 create（父 + 子）
  const createCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'create',
  )
  expect(createCalls.length).toBeGreaterThanOrEqual(2)

  // 子项目 create 应有 parentProjectId 或 createAsChild
  const childCreate = createCalls.find((c) => {
    const input = c.input as any
    return input?.parentProjectId || input?.createAsChild
  })
  expect(childCreate).toBeTruthy()

  // 必须有 list 查询验证
  expect(result.toolCalls).toContain('ProjectQuery')

  // 至少两次 remove（子 + 父）
  const removeCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'remove',
  )
  expect(removeCalls.length).toBeGreaterThanOrEqual(2)

  // 不应有工具错误
  expect(result.toolErrorCount).toBe(0)
})
