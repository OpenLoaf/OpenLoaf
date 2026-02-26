/**
 * Level 2 — 直接调用模型（generateText，无 Agent）。
 *
 * 用法：
 *   OPENLOAF_TEST_CHAT_MODEL_ID="profileId:modelId" pnpm run test:ai:call
 */
import { generateText } from 'ai'
import { resolveTestModel } from './helpers/testEnv'
import {
  printSection,
  printModelInfo,
  printResponse,
  printTokenUsage,
  printPass,
  printFail,
  printDuration,
} from './helpers/printUtils'

const TEST_PROMPT = '用一句话解释什么是递归。'

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

  // ── Test: generateText ──
  printSection('Test: generateText()')
  console.log(`  prompt: "${TEST_PROMPT}"`)
  try {
    const callStart = Date.now()
    const result = await generateText({
      model: resolved.model,
      prompt: TEST_PROMPT,
    })
    printDuration(callStart)
    printResponse(result.text)
    printTokenUsage(result.usage)
    console.log(`  finishReason: ${result.finishReason}`)

    // 断言
    if (!result.text || result.text.trim().length === 0) {
      throw new Error('返回文本为空')
    }
    if (result.finishReason !== 'stop') {
      throw new Error(`finishReason 不是 stop，而是 ${result.finishReason}`)
    }
    printPass('generateText')
    passed++
  } catch (err) {
    printFail('generateText', err)
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
