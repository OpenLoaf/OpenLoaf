/**
 * 测试自动上下文压缩 — warm start 版
 *
 * 预热 5 轮 Read 累积的上下文（~128k tokens）到 session 目录，
 * 然后发一条 follow-up 问题，server 看到巨大上下文 → 触发压缩。
 * 验证压缩后 AI 仍能准确引用前面内容。
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

const FIXTURE_ORIGINAL_SESSION_ID = 'ctx_comp_1776914452416_pv0xjp'
const FIXTURE_DIR = 'warm-start-context-compression'

it('basic-019a — 自动上下文压缩 - warm start', async () => {
  const sessionId = `ctx_comp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  await (commands as any).warmStartSession({
    sessionId,
    fixture: FIXTURE_DIR,
    originalSessionId: FIXTURE_ORIGINAL_SESSION_ID,
  })

  const prompt = '前面我们分段读取了整部小说。请回答两个问题：1) 第1章中申菲陷害蔡侪的具体细节是什么？2) 蔡侪最终是怎么解决学分危机的？请详细回答。'

  render(
    <ChatProbeHarness
      serverUrl={SERVER_URL}
      prompt={prompt}
      sessionId={sessionId}
      title="basic-019a — 上下文压缩"
      chatModelId="kimi:OL-TX-005"
      approvalStrategy="approve-all"
    />,
  )

  await waitForChatComplete(600_000)
  const result = await waitForProbeResult(600_000, { allowToolErrors: true })

  await takeProbeScreenshot('basic-019a-context-compression')

  expect(result.status).toBe('ok')

  const tokenUsages = result.messages
    .filter((m: any) => m.metadata?.totalUsage)
    .map((m: any) => m.metadata.totalUsage)
  console.log('[Token 统计]', JSON.stringify(tokenUsages.map(t => ({
    input: t.inputTokens,
    output: t.outputTokens,
    total: t.totalTokens,
  }))))

  const compressLogs = result.messages
    .filter((m: any) => m.metadata?.compressLog)
    .map((m: any) => m.metadata.compressLog)
  if (compressLogs.length > 0) {
    console.log('[压缩日志]', JSON.stringify(compressLogs))
  }

  const judgment = await aiJudge({
    serverUrl: SERVER_URL,
    criteria: '回答应该提到申菲在课堂上公开指责蔡侪偷懒、鼓动同学孤立她等陷害细节，同时要提到蔡侪通过制作游戏解决学分危机',
    aiResponse: result.textPreview,
    userPrompt: prompt,
  })
  console.log(`[aiJudge] pass=${judgment.pass} score=${judgment.score} reason=${judgment.reason}`)

  await takeProbeScreenshot('basic-019a-final')

  const meta = {
    testCase: 'basic-019a-context-compression',
    prompt,
    result,
    description: 'warm start 5轮 Read 上下文，单轮触发压缩',
    tags: ['context-compression', 'kimi', 'warm-start'],
  }
  await (commands as any).saveTestData(meta)
  await (commands as any).recordProbeRun(meta)

  expect(result.textPreview.length).toBeGreaterThan(50)
}, 600_000)
