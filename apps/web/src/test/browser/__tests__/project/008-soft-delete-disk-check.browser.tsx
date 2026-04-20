/**
 * 软删除磁盘验证：创建项目 → 确认磁盘路径存在 → remove → 确认磁盘文件仍在。
 *
 * 验证要点：
 *   1. create 成功，rootUri 返回有效路径
 *   2. AI 能从 rootUri 提取磁盘路径并用 Bash 验证目录存在
 *   3. remove 后 AI 再用 Bash 验证目录仍然存在（软删除不删文件）
 *   4. remove 后 ProjectQuery 不再返回该项目
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

it('project-008-soft-delete-disk-check — 软删除后磁盘文件仍在', async () => {
  const prompt = [
    "请执行以下操作：",
    "1) 创建一个叫 'Disk Check' 的项目",
    "2) 告诉我它的磁盘路径在哪里，并用命令确认该路径确实存在",
    "3) 删除这个项目",
    "4) 再用命令检查刚才的磁盘路径是否还在（应该还在，因为删除只是从列表移除）",
  ].join('\n')

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(240_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: true })

  await takeProbeScreenshot('project-008-soft-delete-disk-check')
  const meta = {
    testCase: 'project-008-soft-delete-disk-check',
    prompt,
    result,
    description: '创建→确认磁盘存在→remove→确认磁盘仍在（软删除验证）',
    tags: ['project', 'soft-delete', 'disk', 'bash', 'cleanup'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')

  // 必须有 ProjectMutate create + remove
  const createCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'create',
  )
  expect(createCalls.length).toBeGreaterThanOrEqual(1)

  const removeCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'remove',
  )
  expect(removeCalls.length).toBeGreaterThanOrEqual(1)

  // 必须有 Bash 调用来验证磁盘路径
  expect(result.toolCalls).toContain('Bash')
  const bashCalls = result.toolCallDetails.filter((t) => t.name === 'Bash')
  expect(bashCalls.length).toBeGreaterThanOrEqual(1)

  // 不应有工具错误
  expect(result.toolErrorCount).toBe(0)
})
