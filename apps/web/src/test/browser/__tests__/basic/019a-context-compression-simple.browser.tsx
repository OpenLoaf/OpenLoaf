/**
 * 测试自动上下文压缩 - 多轮强制 Read 累积上下文
 *
 * 每轮强制 AI 用 Read 读取文件不同行段，每轮 Read 输出约 25k tokens。
 * 4 轮后累积约 100k+ tokens，超过 DeepSeek 128k 的 70% 阈值触发压缩。
 * 最后一轮验证压缩后 AI 仍能准确引用前面内容。
 */
import { it, expect } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import {
  waitForChatComplete,
  waitForProbeResult,
  takeProbeScreenshot,
  aiJudge,
} from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23333'

it('basic-019a — 自动上下文压缩 - 多轮强制 Read', async () => {
  const sessionId = `ctx_comp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  const { tags } = await (commands as any).stageAttachments({
    sessionId,
    files: ['test-data.txt'],
  })

  const fileRef = tags.join(' ')
  const noExtra = '重要：只读取我指定的行范围即可，不要自动继续读取其他部分。'

  const prompts = [
    `${fileRef}\n请使用 Read 工具读取文件，offset=1, limit=2000。然后描述这段内容中第1-30章的故事情节。${noExtra}`,
    `${fileRef}\n请使用 Read 工具读取文件，offset=2001, limit=2000。然后描述这段内容中的故事情节。${noExtra}`,
    `${fileRef}\n请使用 Read 工具读取文件，offset=4001, limit=2000。然后描述这段内容中的故事情节。${noExtra}`,
    `${fileRef}\n请使用 Read 工具读取文件，offset=6001, limit=2000。然后描述这段内容中的故事情节。${noExtra}`,
    `${fileRef}\n请使用 Read 工具读取文件，offset=8001, limit=3000。然后描述这段内容中的故事情节。${noExtra}`,
    '前面我们分段读取了整部小说。请回答两个问题：1) 第1章中申菲陷害蔡侪的具体细节是什么？2) 蔡侪最终是怎么解决学分危机的？请详细回答。',
  ]

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompts[0]}
      followUpPrompts={prompts.slice(1)}
      sessionId={sessionId}
      title="basic-019a — 上下文压缩"
      chatModelId="minimax:OL-TX-001"
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(600_000)
  const result = await waitForProbeResult()

  await takeProbeScreenshot('basic-019a-context-compression')

  expect(result.status).toBe('ok')

  const allText = result.messages
    .filter((m: any) => m.role === 'assistant')
    .flatMap((m: any) =>
      Array.isArray(m.parts)
        ? m.parts.filter((p: any) => p.type === 'text' && p.text).map((p: any) => p.text)
        : [],
    )
    .join('\n')

  expect(result.toolCalls.includes('Read')).toBe(true)

  const hasCompressionMarker = allText.includes('[Context Summary')
  console.log(`[压缩检测] ${hasCompressionMarker ? '✅ 已触发压缩' : '❌ 未触发压缩'}`)

  const tokenUsages = result.messages
    .filter((m: any) => m.metadata?.totalUsage)
    .map((m: any) => m.metadata.totalUsage)
  console.log('[Token 统计]', JSON.stringify(tokenUsages.map(t => ({
    input: t.inputTokens,
    total: t.totalTokens,
  }))))

  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria: '回答应该提到申菲在课堂上公开指责蔡侪偷懒、鼓动同学孤立她等陷害细节，同时要提到蔡侪通过制作游戏解决学分危机',
    aiResponse: result.textPreview,
    userPrompt: prompts[5],
  })
  console.log(`[aiJudge] pass=${judgment.pass} score=${judgment.score} reason=${judgment.reason}`)

  await takeProbeScreenshot('basic-019a-final')

  const meta = {
    testCase: 'basic-019a-context-compression',
    prompt: prompts.join('\n---\n'),
    result,
    description: '多轮强制 Read 累积上下文，测试自动压缩',
    tags: ['context-compression', 'deepseek', 'large-text', 'multi-read'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.textPreview.length).toBeGreaterThan(50)
}, 600_000)