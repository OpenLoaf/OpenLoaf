/**
 * 测试所有 providers.json 中的模型，验证 promptCacheKey 不会影响正常调用。
 * 每个模型发 2 轮对话：第 1 轮建立缓存，第 2 轮检查是否正常 + 缓存命中。
 *
 * 用法：node --import tsx/esm src/ai/__tests__/level2-all-providers-test.ts
 */
import { streamText, type JSONValue, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createMoonshotAI } from '@ai-sdk/moonshotai'
import { createAlibaba } from '@ai-sdk/alibaba'
import { printSection, printPass, printFail, printDuration } from './helpers/printUtils'
import { resolveProviderModelConfig } from './helpers/testEnv'
import { installHttpProxy } from '@/modules/proxy/httpProxy'

installHttpProxy()

type ProviderConfig = {
  name: string
  modelId: string
  providerId: string
  /** Optional API URL substring matcher for custom providers. */
  apiUrlIncludes?: string
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'Codex (gpt-5.4)',
    modelId: 'gpt-5.4',
    providerId: 'custom',
    apiUrlIncludes: 'tabcode.cc',
  },
  {
    name: 'OpenRouter (step-3.5-flash)',
    modelId: 'stepfun/step-3.5-flash:free',
    providerId: 'custom',
    apiUrlIncludes: 'openrouter.ai',
  },
  {
    name: 'Moonshot (kimi-k2.5)',
    modelId: 'kimi-k2.5',
    providerId: 'moonshot',
  },
  {
    name: 'DashScope (qwen3.5-flash)',
    modelId: 'qwen3.5-flash',
    providerId: 'dashscope',
  },
  {
    name: 'DashScope (qwen3-max)',
    modelId: 'qwen3-max',
    providerId: 'dashscope',
  },
]

const CACHE_KEY = `test-all-${Date.now()}`
const RESPONSES_PROVIDER_OPTIONS: Record<string, Record<string, JSONValue>> = {
  openai: { store: false, promptCacheKey: CACHE_KEY },
}

function createModelFromSdk(
  sdk: ReturnType<typeof createOpenAI> | ReturnType<typeof createMoonshotAI> | ReturnType<typeof createAlibaba>,
  modelId: string,
  responsesApi: boolean,
) {
  if (responsesApi) return (sdk as any)(modelId)
  if (typeof (sdk as any).chat === 'function') return (sdk as any).chat(modelId)
  return (sdk as any)(modelId)
}

async function testProvider(cfg: ProviderConfig): Promise<boolean> {
  const resolved = await resolveProviderModelConfig({
    modelId: cfg.modelId,
    providerId: cfg.providerId,
    apiUrlIncludes: cfg.apiUrlIncludes,
  })
  const responsesApi = resolved.enableResponsesApi
  printSection(`${cfg.name} (${responsesApi ? 'Responses API' : 'Chat Completions'})`)
  const t0 = Date.now()

  try {
    const sdk = resolved.provider.providerId === 'moonshot'
      ? createMoonshotAI({ baseURL: resolved.apiUrl, apiKey: resolved.apiKey })
      : resolved.provider.providerId === 'dashscope'
        ? createAlibaba({ baseURL: resolved.apiUrl, apiKey: resolved.apiKey })
        : createOpenAI({ baseURL: resolved.apiUrl.replace(/\/+$/, ''), apiKey: resolved.apiKey })
    const model = createModelFromSdk(sdk, resolved.modelId, responsesApi)

    // providerOptions 模拟 agentFactory 的行为
    const providerOptions = responsesApi ? RESPONSES_PROVIDER_OPTIONS : undefined

    // Turn 1
    console.log('  [Turn 1] "你好，用一个词回答：天空是什么颜色？"')
    const r1 = streamText({
      model,
      messages: [{ role: 'user', content: '你好，用一个词回答：天空是什么颜色？' }],
      ...(providerOptions ? { providerOptions } : {}),
    })
    let text1 = ''
    for await (const chunk of r1.textStream) { text1 += chunk }
    console.log(`  [Turn 1] text: "${text1.slice(0, 60)}"`)

    if (!text1.trim()) {
      printFail('Turn 1 text 为空', '模型返回无内容')
      return false
    }

    // Turn 2 — 多轮
    const messages: ModelMessage[] = [
      { role: 'user', content: '你好，用一个词回答：天空是什么颜色？' },
      { role: 'assistant', content: text1 },
      { role: 'user', content: '用英文再说一遍' },
    ]
    console.log('  [Turn 2] "用英文再说一遍"')
    const r2 = streamText({
      model,
      messages,
      ...(providerOptions ? { providerOptions } : {}),
    })
    let text2 = ''
    for await (const chunk of r2.textStream) { text2 += chunk }
    console.log(`  [Turn 2] text: "${text2.slice(0, 60)}"`)

    // 获取 usage
    const usage = await r2.usage
    const cached = (usage as any)?.cachedInputTokens ?? (usage as any)?.promptTokensDetails?.cachedTokens ?? 0
    console.log(`  [Turn 2] usage: input=${usage?.inputTokens ?? '?'}, output=${usage?.outputTokens ?? '?'}, cached=${cached}`)

    if (!text2.trim()) {
      printFail('Turn 2 text 为空', '多轮对话返回无内容')
      return false
    }

    printPass('2 轮对话正常')
    printDuration(t0)
    return true
  } catch (e: any) {
    const msg = e.responseBody || e.message || String(e)
    printFail('异常', typeof msg === 'string' ? msg.slice(0, 200) : JSON.stringify(msg).slice(0, 200))
    printDuration(t0)
    return false
  }
}

async function main() {
  console.log(`=== 全 Provider 兼容性测试 ===`)
  console.log(`cache_key: ${CACHE_KEY}\n`)

  const results: { name: string; pass: boolean }[] = []

  for (const cfg of PROVIDERS) {
    const pass = await testProvider(cfg)
    results.push({ name: cfg.name, pass })
  }

  console.log('\n=== 结果汇总 ===')
  for (const r of results) {
    console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}`)
  }

  const allPass = results.every(r => r.pass)
  console.log(allPass ? '\n🎉 全部通过！promptCacheKey 不影响其他模型。' : '\n⚠️ 部分模型失败，需检查。')
  process.exit(allPass ? 0 : 1)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
