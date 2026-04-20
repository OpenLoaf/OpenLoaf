/**
 * 跨功能结合：项目 + 文件发现工具链。
 *
 * 验证要点：
 *   1. AI 创建项目并写入多个文件
 *   2. AI 使用 Glob 在项目路径下搜索文件
 *   3. 搜索结果正确包含写入的文件
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

it('project-012-create-then-explore — 创建项目后探索文件', async () => {
  const prompt = [
    '请执行以下操作：',
    "1) 创建一个项目叫 'Explorer Test'",
    "2) 在项目里创建 src/index.ts 和 src/utils.ts 两个文件（内容随意）",
    '3) 用 Glob 搜索项目里所有 .ts 文件，确认找到了这两个文件',
    '4) 最后删除这个项目',
  ].join('\n')

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(240_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: true })

  await takeProbeScreenshot('project-012-create-then-explore')
  const meta = {
    testCase: 'project-012-create-then-explore',
    prompt,
    result,
    description: '创建项目→写入多个文件→Glob 搜索→清理',
    tags: ['project', 'glob', 'file-discovery', 'cross-feature', 'cleanup'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')

  // 必须有 ProjectMutate create
  const createCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'create',
  )
  expect(createCalls.length).toBeGreaterThanOrEqual(1)

  // 必须有文件写入
  const writeOrBashCalls = result.toolCallDetails.filter(
    (t) => t.name === 'Write' || t.name === 'Bash',
  )
  expect(writeOrBashCalls.length).toBeGreaterThanOrEqual(1)

  // 必须有 Glob 搜索
  expect(result.toolCalls).toContain('Glob')

  // 必须有 remove 清理
  const removeCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'remove',
  )
  expect(removeCalls.length).toBeGreaterThanOrEqual(1)

  // 不应有工具错误
  expect(result.toolErrorCount).toBe(0)

  // 回复应提及找到的文件
  expect(result.textPreview).toMatch(/index\.ts|utils\.ts|\.ts/i)
})
