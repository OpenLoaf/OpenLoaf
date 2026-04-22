/**
 * MemorySave 多轮问答记忆测试（真实浏览器 + 真实后端）。
 *
 * 场景：用户提出含糊的排程请求（"帮我安排明天的工作计划"），AI 通常需要问时区/工作时间，
 * 用户在 followUp 中回答（"我在上海，UTC+8，早上 9 点到晚上 9 点工作"）。
 * 预期：AI 识别出"时区/工作时间"是跨会话长期偏好 → 主动调 MemorySave。
 *
 * 退化保护：若 AI 第一轮没问时区直接给计划，followUp 会变成"用户主动补充信息"，
 * 仍应触发 MemorySave；测试断言对两种路径都成立。
 *
 * 副作用隔离：beforeAll 快照 + afterAll 恢复 ~/OpenLoafData/memory/。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { render } from 'vitest-browser-react'
import { commands } from '@vitest/browser/context'
import ChatProbeHarness from '../../ChatProbeHarness'
import {
  waitForChatComplete,
  waitForProbeResult,
  takeProbeScreenshot,
} from '../../probe-helpers'

const SERVER_URL = process.env.PROBE_SERVER_URL ?? 'http://127.0.0.1:23334'
const MODEL_ID = 'qwen:OL-TX-008'
const MODEL_SOURCE = 'cloud' as const

let memorySnapshot: unknown = null

describe('Memory — followup timezone triggers MemorySave', () => {
  beforeAll(async () => {
    memorySnapshot = await (commands as any).snapshotMemory()
  })

  afterAll(async () => {
    if (memorySnapshot) {
      const res = await (commands as any).restoreMemory(memorySnapshot)
      console.log('[memory-restore]', JSON.stringify(res))
    }
  })

  it('memory-002 — multi-turn timezone Q&A triggers MemorySave', async () => {
    // 第一轮是元对话（不给具体任务，避免触发 AgentRun / Bash 类工具链），
    // 第二轮用户在 followUp 披露稳定的时区/工作时段属性 → AI 应主动 MemorySave。
    const prompt = '以后帮我规划日程之前，我想让你先了解我的一些固定情况，可以吗？'
    const followUp = '我在上海，UTC+8，平时早上 9 点到晚上 9 点工作'

    render(
      <ChatProbeHarness
        serverUrl={SERVER_URL}
        prompt={prompt}
        followUpPrompts={[followUp]}
        chatModelId={MODEL_ID}
        chatModelSource={MODEL_SOURCE}
        approvalStrategy="approve-all"
        title="memory-002 — 多轮时区问答"
      />,
    )

    await waitForChatComplete(180_000)
    // 允许 tool error：模型偶尔在首次调用时拼错参数名（如 keys vs key），
    // agent 会收到 schema 错误反馈并自动重试。测试关注"最终是否保存成功"，
    // 而非单次调用是否完美。下面断言至少有一次成功的 MemorySave 即可。
    const result = await waitForProbeResult(60_000, { allowToolErrors: true })

    await takeProbeScreenshot('memory-002-followup-timezone')
    const meta = {
      testCase: 'memory-002-followup-timezone',
      prompt: `${prompt} → ${followUp}`,
      result,
      model: MODEL_ID,
      description: 'AI 主动问时区或用户在 followUp 补充时区，AI 应主动 MemorySave',
      tags: ['memory', 'chat', 'multi-turn'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ok')
    expect(result.totalTurns).toBe(2)
    expect(result.toolCalls).toContain('MemorySave')

    // 验证至少有一次成功的 MemorySave（允许首次拼错参数后自动重试的真实行为）
    const details = (result as any).toolCallDetails ?? []
    const memorySaveCalls = details.filter((d: any) => d.name === 'MemorySave')
    expect(memorySaveCalls.length).toBeGreaterThan(0)
    const successCall = memorySaveCalls.find((d: any) => !d.hasError)
    expect(successCall).toBeDefined()
    const rawInput = successCall?.input
    const inputStr = typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput ?? {})
    // 时区或工作时间任一关键词命中即可
    expect(inputStr).toMatch(/上海|shanghai|UTC\+8|时区|timezone|工作时间|9.*点/i)
    // scope 应为 user（跨会话长期偏好），不接受 agent
    if (typeof rawInput === 'object' && rawInput !== null && 'scope' in rawInput) {
      expect((rawInput as any).scope).not.toBe('agent')
    }
  })
})
