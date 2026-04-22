/**
 * MemorySave 负向测试（真实浏览器 + 真实后端）。
 *
 * 场景：用户发起单次任务型请求（看一段报错），完全没有"长期偏好"信号。
 * 预期：AI 帮助分析报错，但 *不应* 调用 MemorySave —— 临时任务细节不属于
 * 跨会话记忆（harness-v5 §"不保存：临时状态、单次任务细节"）。
 *
 * 这是记忆系统最高频的误触发场景：任何 debug 请求被误存都会污染用户画像。
 *
 * 副作用隔离：beforeAll 快照 + afterAll 恢复（即便误存也能清理）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import {
  waitForChatComplete,
  waitForMessageCount,
  waitForProbeResult,
  takeProbeScreenshot,
} from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'
const MODEL_ID = 'qwen:OL-TX-008'
const MODEL_SOURCE = 'cloud' as const

let memorySnapshot: unknown = null

describe('Memory — ephemeral debug request must NOT trigger MemorySave', () => {
  beforeAll(async () => {
    memorySnapshot = await (commands as any).snapshotMemory()
  })

  afterAll(async () => {
    if (memorySnapshot) {
      const res = await (commands as any).restoreMemory(memorySnapshot)
      console.log('[memory-restore]', JSON.stringify(res))
    }
  })

  it('memory-003 — TypeError debug request does not save memory', async () => {
    const prompt =
      '今天帮我看一下这段报错是什么意思：TypeError: Cannot read properties of undefined (reading \'map\')'

    render(
      <ChatProbeHarness
        serverUrl={SERVER_URL}
        prompt={prompt}
        chatModelId={MODEL_ID}
        chatModelSource={MODEL_SOURCE}
        approvalStrategy="approve-all"
        title="memory-003 — 负向：临时报错不存"
      />,
    )

    await waitForMessageCount(2, 60_000)
    await waitForChatComplete(120_000)
    const result = await waitForProbeResult()

    await takeProbeScreenshot('memory-003-negative-ephemeral')
    const meta = {
      testCase: 'memory-003-negative-ephemeral',
      prompt,
      result,
      model: MODEL_ID,
      description: '单次报错求助，AI 不应保存记忆（防误存）',
      tags: ['memory', 'chat', 'negative'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ok')
    // 核心断言：不应触发 MemorySave
    expect(result.toolCalls).not.toContain('MemorySave')
    // 回复应有实质内容（确认 AI 真的回答了，而不是空回复跳过）
    expect(typeof result.textPreview === 'string' && result.textPreview.length).toBeGreaterThan(20)
  })
})
