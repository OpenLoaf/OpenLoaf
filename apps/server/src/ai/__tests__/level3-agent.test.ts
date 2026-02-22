/**
 * Level 3 — Agent + 工具执行（核心调试场景）。
 *
 * 用法：
 *   TENAS_TEST_CHAT_MODEL_ID="profileId:modelId" pnpm run test:ai:agent
 */
import {
  resolveTestModel,
  setMinimalRequestContext,
  setChatModel,
  setAbortSignal,
} from './helpers/testEnv'
import { createMasterAgentRunner } from '@/ai/services/masterAgentRunner'
import {
  printSection,
  printModelInfo,
  printResponse,
  printTokenUsage,
  printPass,
  printFail,
  printDuration,
} from './helpers/printUtils'

const TEST_PROMPT = '现在几点了？'
const ALLOWED_TOOL_IDS = ['time-now'] as const

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
  const ac = new AbortController()
  setAbortSignal(ac.signal)

  // ── Test: Agent stream with time-now tool ──
  printSection('Test: Agent stream (time-now)')
  console.log(`  prompt: "${TEST_PROMPT}"`)
  console.log(`  tools:  [${ALLOWED_TOOL_IDS.join(', ')}]`)

  try {
    const callStart = Date.now()
    const runner = createMasterAgentRunner({
      model: resolved.model,
      modelInfo: resolved.modelInfo,
      toolIds: ALLOWED_TOOL_IDS,
    })

    const agentStream = await runner.agent.stream({
      messages: [{ role: 'user' as const, content: TEST_PROMPT }],
      abortSignal: ac.signal,
    })

    // 消费 UIMessageStream 收集事件
    const uiStream = agentStream.toUIMessageStream({
      originalMessages: [],
    })

    let outputText = ''
    let toolCallCount = 0
    let toolResultCount = 0
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
        console.log(`  [tool-call] ${name} input=${JSON.stringify((value as any)?.input)}`)
      } else if (type === 'tool-output-available') {
        toolResultCount++
        const output = (value as any)?.output
        console.log(`  [tool-result] ${JSON.stringify(output)?.slice(0, 200)}`)
      }
    }

    printDuration(callStart)
    printResponse(outputText)
    console.log(`  tool calls: ${toolCallCount}, tool results: ${toolResultCount}`)

    // 断言
    if (toolCallCount === 0) {
      throw new Error('Agent 未调用任何工具')
    }
    if (!toolNames.some((n) => n.includes('time'))) {
      throw new Error(`期望调用 time-now 工具，实际调用: ${toolNames.join(', ')}`)
    }
    if (!outputText || outputText.trim().length === 0) {
      throw new Error('Agent 输出文本为空')
    }
    printPass('Agent stream (time-now)')
    passed++
  } catch (err) {
    printFail('Agent stream (time-now)', err)
    failed++
  }

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
