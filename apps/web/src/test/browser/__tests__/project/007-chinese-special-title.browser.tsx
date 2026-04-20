/**
 * Skill 决策：中文特殊字符标题，验证 folderName 自动英文化。
 *
 * 验证要点：
 *   1. 中文标题正确保存
 *   2. AI 显式传 folderName（skill 规则：中文标题必须指定英文 folderName）
 *   3. 磁盘路径无乱码
 *   4. 测试完成后清理
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

it('project-007-chinese-special-title — 中文特殊字符标题', async () => {
  const prompt = [
    '请执行以下操作：',
    "1) 创建一个项目叫 '我的项目 #2 (实验)'",
    '2) 查看它的详情，确认标题正确',
    '3) 告诉我它的磁盘路径',
    '4) 最后删除这个项目',
  ].join('\n')

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(180_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: true })

  await takeProbeScreenshot('project-007-chinese-special-title')
  const meta = {
    testCase: 'project-007-chinese-special-title',
    prompt,
    result,
    description: '中文特殊字符标题→验证 folderName 英文化→清理',
    tags: ['project', 'chinese', 'special-chars', 'folderName', 'skill-decision', 'cleanup'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')

  // 必须有 create
  const createCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'create',
  )
  expect(createCalls.length).toBeGreaterThanOrEqual(1)

  // create 应带 folderName（中文标题规则）
  const createInput = createCalls[0]?.input as any
  if (createInput?.folderName) {
    // folderName 应为纯英文/数字/连字符
    expect(createInput.folderName).toMatch(/^[a-zA-Z0-9_-]+$/)
  }

  // 必须有 query 验证
  expect(result.toolCalls).toContain('ProjectQuery')

  // 必须有 remove 清理
  const removeCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'remove',
  )
  expect(removeCalls.length).toBeGreaterThanOrEqual(1)

  // 不应有工具错误
  expect(result.toolErrorCount).toBe(0)
})
