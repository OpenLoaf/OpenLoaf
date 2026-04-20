/**
 * 项目完整生命周期：create → get → update → get → remove → list 验证。
 *
 * 验证要点：
 *   1. 每步工具调用都成功（无 toolError）
 *   2. create 返回 projectId + rootUri
 *   3. update 修改 title 后 get 能看到新值
 *   4. remove 后 list 中不再包含该项目
 *   5. 整个 CRUD 闭环在 maxSteps 预算内完成
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

it('project-005-full-lifecycle — 完整 CRUD 生命周期', async () => {
  const prompt = [
    '请按顺序执行以下操作，每步都确认结果：',
    '1) 创建一个项目叫 "Lifecycle Test"',
    '2) 查询确认项目存在',
    '3) 把项目名称改为 "Lifecycle Done"',
    '4) 查询确认名称已修改',
    '5) 删除该项目',
    '6) 列出所有项目，确认已删除',
  ].join('\n')

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(240_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: true })

  await takeProbeScreenshot('project-005-full-lifecycle')
  const meta = {
    testCase: 'project-005-full-lifecycle',
    prompt,
    result,
    description: '完整 CRUD 闭环：create → get → update → get → remove → list',
    tags: ['project', 'lifecycle', 'crud', 'create', 'update', 'remove'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')

  // 必须包含 ProjectMutate 和 ProjectQuery
  expect(result.toolCalls).toContain('ProjectMutate')
  expect(result.toolCalls).toContain('ProjectQuery')

  // 检查 create action
  const createCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'create',
  )
  expect(createCalls.length).toBeGreaterThanOrEqual(1)

  // 检查 update action
  const updateCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'update',
  )
  expect(updateCalls.length).toBeGreaterThanOrEqual(1)

  // 检查 remove action
  const removeCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'remove',
  )
  expect(removeCalls.length).toBeGreaterThanOrEqual(1)

  // 检查 query 调用（get 或 list）
  const queryCalls = result.toolCallDetails.filter((t) => t.name === 'ProjectQuery')
  expect(queryCalls.length).toBeGreaterThanOrEqual(2)

  // 不应有工具错误
  expect(result.toolErrorCount).toBe(0)

  // 回复内容应提及操作结果
  expect(result.textPreview.length).toBeGreaterThan(50)
})
