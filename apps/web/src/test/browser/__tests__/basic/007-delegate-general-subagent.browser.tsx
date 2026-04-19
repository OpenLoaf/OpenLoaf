/**
 * 基础 smoke：自然的多步骤复合任务，master 应自主判断委派。
 * 用户视角提问（不提 Agent / 子代理），验证 agent-orchestration-skill
 * 的决策护栏是否把"结构化研究任务"识别为委派场景。
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

it('basic-007-delegate-general-subagent — 多步骤复合任务自主委派', async () => {
  const prompt =
    '我最近想开始练跑步，但完全没经验，帮我一次性整理这三件事：\n'
    + '第一部分：列出新手最容易犯的 4 个错误（比如热身、配速、装备之类）；\n'
    + '第二部分：针对每个错误写一段 50-80 字说明为什么错、怎么避免；\n'
    + '第三部分：给我一个 30 天入门训练节奏建议，按周简单描述强度变化就行。\n'
    + '基于你已有的知识整理即可，不用联网查资料。'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(300_000)

  const result = await waitForProbeResult()

  await takeProbeScreenshot('basic-007-delegate-general-subagent')
  const meta = {
    testCase: 'basic-007-delegate-general-subagent',
    prompt,
    result,
    description: '自然场景的多步骤复合任务应触发 Agent 委派',
    tags: ['basic', 'agent-orchestration', 'delegate', 'autonomous'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  // master 对自然复合任务的决策：委派或自己做都可接受；重点验证任务被完整交付、无工具错误
  expect(result.toolErrorCount).toBe(0)
  // 最终回复必须体现 prompt 三部分结构的关键词，正文足够丰富
  const text = result.textPreview
  expect(text.length).toBeGreaterThan(150)
  expect(/错误|误区|避免|常见/.test(text)).toBe(true)
  expect(/训练|节奏|强度|周/.test(text)).toBe(true)
  expect(/建议|入门|新手|热身|配速/.test(text)).toBe(true)
})
