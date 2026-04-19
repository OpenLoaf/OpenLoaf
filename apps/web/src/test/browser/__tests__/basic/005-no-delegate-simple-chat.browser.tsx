/**
 * 基础 smoke：单步知识问答，master 不应委派子代理。
 * 验证 agent-orchestration-skill 的"别把简单任务委派出去"护栏。
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

it('basic-005-no-delegate-simple-chat — 简单问答不委派子代理', async () => {
  const prompt = '一句话告诉我：光合作用是什么？'

  render(
    <ChatProbeHarness serverUrl={SERVER_URL} prompt={prompt} approvalStrategy="approve-all" />,
  )

  await waitForMessageCount(2, 30_000)
  await waitForChatComplete(60_000)

  const result = await waitForProbeResult()

  await takeProbeScreenshot('basic-005-no-delegate-simple-chat')
  const meta = {
    testCase: 'basic-005-no-delegate-simple-chat',
    prompt,
    result,
    description: '单步知识问答，Agent 工具不应被调用',
    tags: ['basic', 'agent-orchestration', 'no-delegate'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.status).toBe('ok')
  // 关键：单步知识问答不应触发子代理委派
  expect(result.toolCalls).not.toContain('Agent')
  expect(result.toolCalls).not.toContain('SendMessage')
  // 回复必须言之有物，不能是空或只有 reasoning
  expect(result.textPreview.length).toBeGreaterThan(10)
})
