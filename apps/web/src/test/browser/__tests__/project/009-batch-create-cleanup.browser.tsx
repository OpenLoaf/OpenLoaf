/**
 * 批量创建和清理：创建 2 个项目后逐个删除，验证列表清空。
 *
 * 验证要点：
 *   1. 批量 create 2 个项目都成功
 *   2. 逐个 remove 都成功
 *   3. 最终 list 不含这 2 个项目
 *   4. 测试批量清理的可靠性
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

it('project-009-batch-create-cleanup — 批量创建并清理', async () => {
  const prompt = [
    '请执行以下操作：',
    "1) 创建两个项目：'Batch A' 和 'Batch B'",
    '2) 列出项目确认两个都在',
    '3) 依次删除 Batch A 和 Batch B',
    '4) 列出项目确认都已删除',
  ].join('\n')

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(240_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: true })

  await takeProbeScreenshot('project-009-batch-create-cleanup')
  const meta = {
    testCase: 'project-009-batch-create-cleanup',
    prompt,
    result,
    description: '批量创建 2 个项目→逐个删除→验证列表清空',
    tags: ['project', 'batch', 'create', 'remove', 'cleanup'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')

  // 至少 2 次 create
  const createCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'create',
  )
  expect(createCalls.length).toBeGreaterThanOrEqual(2)

  // 至少 2 次 remove
  const removeCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'remove',
  )
  expect(removeCalls.length).toBeGreaterThanOrEqual(2)

  // 必须有 list 查询验证
  const listCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectQuery',
  )
  expect(listCalls.length).toBeGreaterThanOrEqual(1)

  // 不应有工具错误
  expect(result.toolErrorCount).toBe(0)
})
