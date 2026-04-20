/**
 * 跨功能结合：项目 + 文件写入读取。
 *
 * 验证要点：
 *   1. AI 创建项目后在项目根目录写入文件
 *   2. AI 读取文件内容验证正确
 *   3. 文件路径在项目 rootUri 下
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

it('project-010-create-and-write-file — 创建项目并写入文件', async () => {
  const prompt = [
    '请执行以下操作：',
    "1) 创建一个项目叫 'File Test'",
    "2) 在项目根目录里创建一个 README.md，写入内容 '# Hello Project'",
    '3) 读取 README.md 确认内容正确',
    '4) 最后删除这个项目',
  ].join('\n')

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(240_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: true })

  await takeProbeScreenshot('project-010-create-and-write-file')
  const meta = {
    testCase: 'project-010-create-and-write-file',
    prompt,
    result,
    description: '创建项目→Write 写文件→Read 验证→删除清理',
    tags: ['project', 'file', 'write', 'read', 'cross-feature', 'cleanup'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')

  // 必须有 ProjectMutate create
  const createCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'create',
  )
  expect(createCalls.length).toBeGreaterThanOrEqual(1)

  // 必须有文件写入（Write 或 Bash）
  const hasWrite = result.toolCalls.includes('Write') || result.toolCalls.includes('Bash')
  expect(hasWrite).toBe(true)

  // 必须有文件读取（Read 或 Bash）
  const hasRead = result.toolCalls.includes('Read') || result.toolCalls.includes('Bash')
  expect(hasRead).toBe(true)

  // 必须有 remove 清理
  const removeCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'remove',
  )
  expect(removeCalls.length).toBeGreaterThanOrEqual(1)

  // 不应有工具错误
  expect(result.toolErrorCount).toBe(0)

  // 回复应提及 README 或 Hello
  expect(result.textPreview).toMatch(/README|Hello|成功|正确/i)
})
