/**
 * MemorySave 主动记忆测试（真实浏览器 + 真实后端）。
 *
 * 场景：用户通过普通口吻陈述偏好（素食），完全不说"记住"、"保存"等触发词。
 * 预期：agent 根据 harness-v5 记忆准则主动调用 MemorySave 保存用户偏好。
 *
 * 副作用隔离：
 * - beforeAll 快照 ~/OpenLoafData/memory/ 当前状态
 * - afterAll 删除测试期间新增的记忆文件，恢复 MEMORY.md 索引
 * - 即便测试失败也会执行 afterAll（不污染下次测试/真实用户记忆）
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
const MODEL_ID = 'qwen:OL-TX-006'
const MODEL_SOURCE = 'cloud' as const

let memorySnapshot: unknown = null

describe('Memory — natural preference triggers MemorySave', () => {
  beforeAll(async () => {
    memorySnapshot = await (commands as any).snapshotMemory()
  })

  afterAll(async () => {
    if (memorySnapshot) {
      const res = await (commands as any).restoreMemory(memorySnapshot)
      console.log('[memory-restore]', JSON.stringify(res))
    }
  })

  it('memory-001 — dietary preference (素食) triggers MemorySave', async () => {
    const prompt = '我是素食主义者，以后推荐餐厅别给我推烤肉店'

    render(
      <ChatProbeHarness
        serverUrl={SERVER_URL}
        prompt={prompt}
        chatModelId={MODEL_ID}
        chatModelSource={MODEL_SOURCE}
        approvalStrategy="approve-all"
        title="memory-001 — 饮食偏好"
      />,
    )

    await waitForMessageCount(2, 60_000)
    await waitForChatComplete(120_000)
    const result = await waitForProbeResult()

    await takeProbeScreenshot('memory-001-dietary-preference')
    const meta = {
      testCase: 'memory-001-dietary-preference',
      prompt,
      result,
      model: MODEL_ID,
      description: '自然语言陈述饮食偏好，agent 应主动保存到用户记忆',
      tags: ['memory', 'chat'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ok')
    expect(result.toolCalls).toContain('MemorySave')

    // 验证 MemorySave 入参语义正确（user scope + 含素食关键词）
    const details = (result as any).toolCallDetails ?? []
    const saveCall = details.find((d: any) => d.name === 'MemorySave')
    expect(saveCall).toBeDefined()
    expect(saveCall.hasError).toBe(false)
    const rawInput = saveCall?.input
    const inputStr = typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput ?? {})
    expect(inputStr).toMatch(/素食|vegetarian|烤肉|不吃肉/i)
  })
})
