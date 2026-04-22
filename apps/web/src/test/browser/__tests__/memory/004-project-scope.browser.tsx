/**
 * Project-scope MemorySave 测试（真实浏览器 + 真实后端 + 真实项目上下文）。
 *
 * 场景：chat session 在 TestProject 项目上下文下运行，用户陈述项目级代码规约
 * （TS 缩进/类型/导出风格）—— AI 应识别为 *项目级* 长期约定，调
 * `MemorySave({ scope: "project" })` 写入 `<projectRoot>/.openloaf/memory/`，
 * 而不是 user 全局记忆。
 *
 * 前置：TestProject 已存在于 ~/OpenLoafData/TestProject/，project.json
 * 含 projectId = proj_650a1584-48f3-485a-8942-1b08a5887dee。
 *
 * 副作用隔离：snapshotProjectMemory + restoreProjectMemory 覆盖
 * <projectRoot>/.openloaf/memory/，不影响 USER_MEMORY_DIR。
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

// TestProject 是用户预置的测试项目（~/OpenLoafData/TestProject/.openloaf/project.json）
const TEST_PROJECT_ID = 'proj_650a1584-48f3-485a-8942-1b08a5887dee'
const TEST_PROJECT_ROOT = `${process.env.HOME}/OpenLoafData/TestProject`

let memorySnapshot: unknown = null

describe('Memory — project scope code conventions', () => {
  beforeAll(async () => {
    memorySnapshot = await (commands as any).snapshotProjectMemory({
      projectRoot: TEST_PROJECT_ROOT,
    })
  })

  afterAll(async () => {
    if (memorySnapshot) {
      const res = await (commands as any).restoreProjectMemory(memorySnapshot)
      console.log('[project-memory-restore]', JSON.stringify(res))
    }
  })

  it('memory-004 — project code conventions saved with scope=project', async () => {
    const prompt =
      '这个项目的代码风格规约：所有 TypeScript 文件用 2 空格缩进，禁用 any 类型，' +
      '导出用 named export 不用 default。以后帮我写代码记住这些规则。'

    render(
      <ChatProbeHarness
        serverUrl={SERVER_URL}
        prompt={prompt}
        chatModelId={MODEL_ID}
        chatModelSource={MODEL_SOURCE}
        projectId={TEST_PROJECT_ID}
        approvalStrategy="approve-all"
        title="memory-004 — 项目级代码规约"
      />,
    )

    await waitForMessageCount(2, 60_000)
    await waitForChatComplete(120_000)
    const result = await waitForProbeResult(60_000, { allowToolErrors: true })

    await takeProbeScreenshot('memory-004-project-scope')
    const meta = {
      testCase: 'memory-004-project-scope',
      prompt,
      result,
      model: MODEL_ID,
      description: '项目级代码规约应保存为 scope=project，写入 TestProject 内',
      tags: ['memory', 'chat', 'project-scope'],
    }
    await (commands as any).saveTestData(meta)
    await (commands as any).recordProbeRun(meta)

    expect(result.status).toBe('ok')
    const details = (result as any).toolCallDetails ?? []
    const memorySaveCalls = details.filter((d: any) => d.name === 'MemorySave')
    expect(memorySaveCalls.length).toBeGreaterThan(0)

    const successCall = memorySaveCalls.find((d: any) => !d.hasError)
    expect(successCall).toBeDefined()
    const rawInput = successCall?.input
    const inputStr = typeof rawInput === 'string' ? rawInput : JSON.stringify(rawInput ?? {})
    // 内容应命中代码规约关键词
    expect(inputStr).toMatch(/typescript|ts|缩进|indent|2.?space|2.?空格|any|named.?export|export/i)
    // 核心断言：scope 必须是 project，不能是 user 或 agent
    expect(rawInput).toBeDefined()
    if (typeof rawInput === 'object' && rawInput !== null) {
      expect((rawInput as any).scope).toBe('project')
    }
  })
})
