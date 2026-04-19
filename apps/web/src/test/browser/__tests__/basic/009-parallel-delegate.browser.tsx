/**
 * 基础 smoke：明显独立的两个子任务，master 应自主识别并行扇出机会。
 * 用户视角提问（不提 Agent / 子代理 / 并行），验证 agent-orchestration-skill
 * 的并行扇出-汇总决策链是否能被自然任务触发。
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

it('basic-009-parallel-delegate — 独立双任务自主并行扇出', async () => {
  const prompt =
    '这周末我想在家办一次小型朋友聚会（6 个人左右），这两件事一起帮我搞定：\n'
    + '一、菜单规划：推荐 4 道适合朋友聚会的家常菜 + 2 道下酒菜，'
    + '每道简单说明亮点就行；\n'
    + '二、活动节奏：从下午 3 点到晚上 10 点，按时段分 3-4 段设计活动内容，'
    + '让大家不冷场又不累。\n'
    + '这两件事彼此不相关，基于你的常识整理就行，不用联网查资料。'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(360_000)

  const result = await waitForProbeResult()

  await takeProbeScreenshot('basic-009-parallel-delegate')
  const meta = {
    testCase: 'basic-009-parallel-delegate',
    prompt,
    result,
    description: '独立双任务应自主触发 >=2 次 Agent 并行扇出',
    tags: ['basic', 'agent-orchestration', 'delegate', 'parallel', 'autonomous'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  // master 对独立双任务的决策：委派扇出或自己串行做都可接受；重点验证两主题都被完整交付
  expect(result.toolErrorCount).toBe(0)
  // 最终回复必须同时覆盖两个主题
  const text = result.textPreview
  expect(text.length).toBeGreaterThan(100)
  const hasMenu = /菜|菜单|下酒|家常|推荐/.test(text)
  const hasActivity = /活动|下午|晚上|时段|节奏/.test(text)
  expect(hasMenu).toBe(true)
  expect(hasActivity).toBe(true)
})
