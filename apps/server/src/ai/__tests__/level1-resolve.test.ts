/**
 * Level 1 — 验证 providers.json 加载 + 模型解析。
 *
 * 用法：
 *   TENAS_TEST_CHAT_MODEL_ID="profileId:modelId" pnpm run test:ai:resolve
 */
import {
  getTestChatModelId,
  resolveTestModel,
  getProviderSettings,
} from './helpers/testEnv'
import {
  printSection,
  printModelInfo,
  printPass,
  printFail,
  printDuration,
} from './helpers/printUtils'

async function main() {
  const start = Date.now()
  let passed = 0
  let failed = 0

  // ── Test 1: 加载 provider 配置 ──
  printSection('Test 1: getProviderSettings()')
  try {
    const providers = await getProviderSettings()
    console.log(`  已配置 provider 数量: ${providers.length}`)
    for (const p of providers) {
      const modelCount = Object.keys(p.models ?? {}).length
      console.log(`    [${p.id}] ${p.providerId} — ${modelCount} 个模型`)
    }
    if (providers.length === 0) throw new Error('未找到任何 provider 配置')
    printPass('getProviderSettings')
    passed++
  } catch (err) {
    printFail('getProviderSettings', err)
    failed++
  }

  // ── Test 2: 解析指定模型 ──
  printSection('Test 2: resolveChatModel()')
  try {
    const chatModelId = getTestChatModelId()
    console.log(`  chatModelId: ${chatModelId}`)
    const resolved = await resolveTestModel()
    printModelInfo({
      provider: resolved.modelInfo.provider,
      modelId: resolved.modelInfo.modelId,
      chatModelId: resolved.chatModelId,
      tags: resolved.modelDefinition?.tags,
    })
    if (!resolved.model) throw new Error('model 为空')
    printPass('resolveChatModel')
    passed++
  } catch (err) {
    printFail('resolveChatModel', err)
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
