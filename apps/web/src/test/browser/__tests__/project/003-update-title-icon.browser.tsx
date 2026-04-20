/**
 * 项目更新：修改当前项目的标题和图标，然后查询确认修改成功。
 *
 * 验证要点：
 *   1. AI 调用 ProjectMutate(action:update) 修改 title 和 icon
 *   2. AI 调用 ProjectQuery(mode:get) 确认修改生效
 *   3. 无工具错误
 *
 * 注意：此测试在当前项目上下文操作，不创建新项目。
 * 测试完成后应恢复原标题（或测试自行清理）。
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

it('project-003-update-title-icon — 修改项目名称和图标', async () => {
  const prompt = [
    '请执行以下操作：',
    '1) 先创建一个叫 "Update Test" 的项目',
    '2) 把它的名字改成 "Updated Project"，图标改成 🚀',
    '3) 查询确认名称和图标已修改',
    '4) 最后删除这个项目',
  ].join('\n')

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(180_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: true })

  await takeProbeScreenshot('project-003-update-title-icon')
  const meta = {
    testCase: 'project-003-update-title-icon',
    prompt,
    result,
    description: '创建→更新 title/icon→查询确认→删除清理',
    tags: ['project', 'update', 'title', 'icon', 'cleanup'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')

  // 必须有 create + update + remove
  const createCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'create',
  )
  expect(createCalls.length).toBeGreaterThanOrEqual(1)

  const updateCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'update',
  )
  expect(updateCalls.length).toBeGreaterThanOrEqual(1)

  const removeCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'remove',
  )
  expect(removeCalls.length).toBeGreaterThanOrEqual(1)

  // 必须有 ProjectQuery 验证
  expect(result.toolCalls).toContain('ProjectQuery')

  // 不应有工具错误
  expect(result.toolErrorCount).toBe(0)
})
