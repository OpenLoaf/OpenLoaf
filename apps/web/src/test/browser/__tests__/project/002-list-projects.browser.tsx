/**
 * 项目列表查询：让 AI 列出所有项目。
 *
 * 验证要点：
 *   1. AI 调用 ProjectQuery(mode:list)
 *   2. 返回包含 projects 数组
 *   3. AI 能以可读格式展示项目列表
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

it('project-002-list-projects — 列出所有项目', async () => {
  const prompt = '列出我现在所有的项目，用表格或列表展示每个项目的名称和路径。'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(120_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: true })

  await takeProbeScreenshot('project-002-list-projects')
  const meta = {
    testCase: 'project-002-list-projects',
    prompt,
    result,
    description: 'ProjectQuery(list) 查询所有项目并格式化展示',
    tags: ['project', 'list', 'query'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')

  // 必须调用 ProjectQuery
  expect(result.toolCalls).toContain('ProjectQuery')

  // 检查 list mode
  const listCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectQuery' && ((t.input as any)?.mode === 'list' || !(t.input as any)?.mode),
  )
  expect(listCalls.length).toBeGreaterThanOrEqual(1)

  // 不应有工具错误
  expect(result.toolErrorCount).toBe(0)

  // 回复应有内容
  expect(result.textPreview.length).toBeGreaterThan(20)
})
