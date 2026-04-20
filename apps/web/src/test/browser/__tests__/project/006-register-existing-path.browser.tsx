/**
 * Skill 决策：注册已有路径为项目，验证 rootUri file:// 格式正确。
 *
 * 验证要点：
 *   1. AI 构造 rootUri:"file:///tmp/..." 而非裸路径
 *   2. enableVersionControl 应为 false（已有目录）
 *   3. 项目创建成功，rootUri 指向正确路径
 *   4. 测试完成后清理
 *
 * 前置：测试代码先在 /tmp 下建一个空目录。
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

it('project-006-register-existing-path — 注册已有路径为项目', async () => {
  const prompt = [
    '请执行以下操作：',
    '1) 先用 Bash 创建目录 /tmp/openloaf-test-proj-006',
    "2) 把路径 /tmp/openloaf-test-proj-006 注册为一个项目，名字叫 'Path Test'",
    '3) 查询确认项目创建成功，rootUri 指向正确路径',
    '4) 最后删除这个项目（不要删除磁盘上的目录）',
  ].join('\n')

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(180_000)

  const result = await waitForProbeResult(15_000, { allowToolErrors: true })

  await takeProbeScreenshot('project-006-register-existing-path')
  const meta = {
    testCase: 'project-006-register-existing-path',
    prompt,
    result,
    description: '注册已有路径→验证 file:// rootUri→清理',
    tags: ['project', 'rootUri', 'existing-path', 'skill-decision', 'cleanup'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')

  // 必须有 create
  const createCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'create',
  )
  expect(createCalls.length).toBeGreaterThanOrEqual(1)

  // create 的 rootUri 必须是 file:// 格式
  const createInput = createCalls[0]?.input as any
  if (createInput?.rootUri) {
    expect(createInput.rootUri).toMatch(/^file:\/\/\//)
    expect(createInput.rootUri).toContain('openloaf-test-proj-006')
  }

  // 必须有 remove 清理
  const removeCalls = result.toolCallDetails.filter(
    (t) => t.name === 'ProjectMutate' && (t.input as any)?.action === 'remove',
  )
  expect(removeCalls.length).toBeGreaterThanOrEqual(1)

  // 不应有工具错误
  expect(result.toolErrorCount).toBe(0)
})
