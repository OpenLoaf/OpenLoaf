/**
 * 验证 DeepSeek 思考模式（OL-TX-012）多轮对话 + 工具调用是否会被
 * "The reasoning_content in the thinking mode must be passed back to the API" 400 拒绝。
 *
 * 复现条件：
 * - 模型 reasoning='optional' 且无 wrapDeepSeekWithReasoning
 * - 第一轮 prompt 触发工具调用 → assistant 消息内含 reasoning + tool-call
 * - 第二轮 followUp 发起 → @ai-sdk/deepseek 把历史 reasoning 剥光 → DeepSeek 400
 *
 * 期望：两轮都 ok。
 * 当前 bug：第二轮 result.status === 'error'。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import {
  waitForChatComplete,
  waitForProbeResult,
  takeProbeScreenshot,
} from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'
const MODEL_ID = 'deepseek:OL-TX-012'

it('basic-023-deepseek-thinking-multiturn-reasoning — 思考模式多轮 + 工具调用不应被 400 拒绝', async () => {
  const prompt = '用 Glob 工具列出 /tmp 目录里的内容（pattern: "*"），然后告诉我大概有几个条目。'
  const followUp = '刚才那些条目里，有以 chat 开头的吗？'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      followUpPrompts={[followUp]}
      chatModelId={MODEL_ID}
      approvalStrategy="approve-all"
      title="basic-023 — DeepSeek 思考模式多轮 reasoning_content 回传"
    />,
  )

  await waitForChatComplete(180_000)
  const result = await waitForProbeResult(60_000, { allowToolErrors: true })

  await takeProbeScreenshot('basic-023-deepseek-thinking-multiturn-reasoning')

  const meta = {
    testCase: 'basic-023-deepseek-thinking-multiturn-reasoning',
    prompt: `${prompt} → ${followUp}`,
    result,
    model: MODEL_ID,
    description: 'DeepSeek 思考模式 + 多轮 + 工具调用：第二轮请求不应被 reasoning_content 缺失 400',
    tags: ['basic', 'deepseek', 'thinking-mode', 'multi-turn', 'reasoning-content', 'bug-repro'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  // 主断言：两轮都成功 — 失败即复现 bug
  expect(result.status).toBe('ok')
  expect(result.totalTurns).toBe(2)
  // 第一轮必须真的发了工具调用（让 assistant 历史里带上 reasoning + tool-call）
  expect(result.toolCalls).toContain('Glob')
})
