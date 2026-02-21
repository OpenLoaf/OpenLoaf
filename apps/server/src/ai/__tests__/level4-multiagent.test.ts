/**
 * Level 4 — Multi-agent spawn/wait/abort 集成测试。
 *
 * 用法：
 *   TENAS_TEST_CHAT_MODEL_ID="profileId:modelId" pnpm run test:ai:multiagent
 */
import {
  resolveTestModel,
  setMinimalRequestContext,
  setChatModel,
  setAbortSignal,
} from './helpers/testEnv'
import { createMasterAgentRunner } from '@/ai/agents/masterAgent/masterAgentRunner'
import {
  printSection,
  printModelInfo,
  printResponse,
  printPass,
  printFail,
  printDuration,
} from './helpers/printUtils'

async function runAgentTest(input: {
  name: string
  prompt: string
  toolIds: readonly string[]
  model: any
  modelInfo: any
  assertions: (ctx: {
    outputText: string
    toolNames: string[]
    toolCallCount: number
  }) => void
}): Promise<boolean> {
  printSection(`Test: ${input.name}`)
  console.log(`  prompt: "${input.prompt}"`)
  console.log(`  tools:  [${input.toolIds.join(', ')}]`)

  try {
    const callStart = Date.now()
    const ac = new AbortController()
    setAbortSignal(ac.signal)

    const runner = createMasterAgentRunner({
      model: input.model,
      modelInfo: input.modelInfo,
      toolIds: input.toolIds,
    })

    const agentStream = await runner.agent.stream({
      messages: [{ role: 'user' as const, content: input.prompt }],
      abortSignal: ac.signal,
    })

    const uiStream = agentStream.toUIMessageStream({
      originalMessages: [],
    })

    let outputText = ''
    let toolCallCount = 0
    const toolNames: string[] = []

    const reader = uiStream.getReader()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (!value) continue
      const type = (value as any)?.type
      if (type === 'text-delta') {
        const delta = (value as any)?.delta ?? (value as any)?.textDelta ?? ''
        outputText += String(delta)
      } else if (type === 'tool-input-available') {
        toolCallCount++
        const name = (value as any)?.toolName ?? '?'
        toolNames.push(name)
        console.log(`  [tool-call] ${name} input=${JSON.stringify((value as any)?.input)?.slice(0, 200)}`)
      } else if (type === 'tool-output-available') {
        const output = (value as any)?.output
        console.log(`  [tool-result] ${JSON.stringify(output)?.slice(0, 200)}`)
      }
    }

    printDuration(callStart)
    printResponse(outputText)
    console.log(`  tool calls: ${toolCallCount}, tools: [${toolNames.join(', ')}]`)

    input.assertions({ outputText, toolNames, toolCallCount })
    printPass(input.name)
    return true
  } catch (err) {
    printFail(input.name, err)
    return false
  }
}

const AGENT_TOOL_IDS = [
  'spawn-agent',
  'wait-agent',
  'abort-agent',
  'send-input',
] as const

async function main() {
  const start = Date.now()
  let passed = 0
  let failed = 0

  // ── 解析模型 ──
  printSection('Resolve model')
  const resolved = await resolveTestModel()
  printModelInfo({
    provider: resolved.modelInfo.provider,
    modelId: resolved.modelInfo.modelId,
    chatModelId: resolved.chatModelId,
  })

  // ── 设置上下文 ──
  setMinimalRequestContext()
  setChatModel(resolved.model)

  // ── Test 1: 单个 spawn + wait ──
  const t1 = await runAgentTest({
    name: 'Single spawn + wait',
    prompt: '请启动一个子代理来查询当前时间，等待它完成后告诉我结果。',
    toolIds: AGENT_TOOL_IDS,
    model: resolved.model,
    modelInfo: resolved.modelInfo,
    assertions: ({ outputText, toolNames, toolCallCount }) => {
      if (!toolNames.includes('spawn-agent')) {
        throw new Error(`期望调用 spawn-agent，实际: ${toolNames.join(', ')}`)
      }
      if (!toolNames.includes('wait-agent')) {
        throw new Error(`期望调用 wait-agent，实际: ${toolNames.join(', ')}`)
      }
      if (!outputText || outputText.trim().length === 0) {
        throw new Error('输出文本为空')
      }
    },
  })
  if (t1) passed++
  else failed++

  // ── Test 2: 并行 spawn ──
  const t2 = await runAgentTest({
    name: 'Parallel spawn',
    prompt:
      '请同时启动两个子代理，一个查询当前时间，一个也查询当前时间，等待它们都完成后汇总结果。',
    toolIds: AGENT_TOOL_IDS,
    model: resolved.model,
    modelInfo: resolved.modelInfo,
    assertions: ({ outputText, toolNames }) => {
      const spawnCount = toolNames.filter((n) => n === 'spawn-agent').length
      if (spawnCount < 2) {
        throw new Error(`期望 spawn-agent >= 2 次，实际: ${spawnCount}`)
      }
      if (!toolNames.includes('wait-agent')) {
        throw new Error(`期望调用 wait-agent，实际: ${toolNames.join(', ')}`)
      }
      if (!outputText || outputText.trim().length === 0) {
        throw new Error('输出文本为空')
      }
    },
  })
  if (t2) passed++
  else failed++

  // ── Test 3: abort 生命周期 ──
  const t3 = await runAgentTest({
    name: 'Spawn + wait + abort lifecycle',
    prompt: '启动一个子代理查询时间，等待完成后中止它，告诉我结果。',
    toolIds: AGENT_TOOL_IDS,
    model: resolved.model,
    modelInfo: resolved.modelInfo,
    assertions: ({ outputText, toolNames }) => {
      if (!toolNames.includes('spawn-agent')) {
        throw new Error(`期望调用 spawn-agent，实际: ${toolNames.join(', ')}`)
      }
      if (!toolNames.includes('wait-agent')) {
        throw new Error(`期望调用 wait-agent，实际: ${toolNames.join(', ')}`)
      }
      if (!toolNames.includes('abort-agent')) {
        throw new Error(`期望调用 abort-agent，实际: ${toolNames.join(', ')}`)
      }
      if (!outputText || outputText.trim().length === 0) {
        throw new Error('输出文本为空')
      }
    },
  })
  if (t3) passed++
  else failed++

  // ── 汇总 ──
  printSection('Summary')
  printDuration(start)
  console.log(`  ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
