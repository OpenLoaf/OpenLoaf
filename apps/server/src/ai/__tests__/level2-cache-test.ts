/**
 * 测试 prompt_cache_key 是否激活缓存（streaming 模式）
 * 对照组：5 轮带 key vs 5 轮不带 key
 *
 * 用法：node --import tsx/esm src/ai/__tests__/level2-cache-test.ts
 */
import { buildResponsesApiUrl, resolveProviderModelConfig } from './helpers/testEnv'

const MODEL = 'gpt-5.4'
const CACHE_KEY = `test-session-${Date.now()}`

type UsageInfo = {
  input_tokens?: number
  output_tokens?: number
  input_tokens_details?: { cached_tokens?: number }
}

type SSEResult = { text: string; usage: UsageInfo | null }

async function readSSE(resp: Response): Promise<SSEResult> {
  let text = ''
  let usage: UsageInfo | null = null
  const reader = resp.body!.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()!
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue
      try {
        const evt = JSON.parse(data)
        if (evt.type === 'response.completed' && evt.response) {
          usage = evt.response.usage || null
        }
        if (evt.type === 'response.output_text.delta') {
          text += evt.delta || ''
        }
      } catch {}
    }
  }
  return { text, usage }
}

async function sendTurn(
  apiUrl: string,
  apiKey: string,
  input: unknown[],
  label: string,
  cacheKey?: string,
): Promise<SSEResult> {
  const body: Record<string, unknown> = {
    model: MODEL,
    stream: true,
    store: false,
    input,
  }
  if (cacheKey) body.prompt_cache_key = cacheKey

  const t0 = Date.now()
  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  if (!resp.ok) throw new Error(`${label} 失败: ${resp.status} ${(await resp.text()).slice(0, 200)}`)

  const result = await readSSE(resp)
  const elapsed = Date.now() - t0
  const u = result.usage
  const cached = u?.input_tokens_details?.cached_tokens ?? 0
  const total = u?.input_tokens ?? 0
  const rate = total > 0 ? ((cached / total) * 100).toFixed(1) : '?'
  console.log(`  ${label} (${elapsed}ms) | input: ${total}, cached: ${cached} (${rate}%) | "${result.text.slice(0, 30)}"`)
  return result
}

const SYSTEM_PROMPT = `你是一个百科全书助手。你的回答必须简洁，每次只用一两个词。
请注意以下规则：
1. 回答尽量简短
2. 使用中文
3. 不要解释
4. 直接给出答案
这段文字用于填充 prompt 以测试缓存效果。`.repeat(5)

const QUESTIONS = [
  '天空是什么颜色？',
  '太阳是什么形状？',
  '水的化学式是什么？',
  '地球的卫星叫什么？',
  '一年有几个月？',
]

async function runGroup(label: string, apiUrl: string, apiKey: string, cacheKey?: string) {
  console.log(`\n── ${label} ──`)
  const history: { role: string; content: string }[] = [
    { role: 'developer', content: SYSTEM_PROMPT },
  ]
  let totalInput = 0
  let totalCached = 0

  for (const [index, question] of QUESTIONS.entries()) {
    history.push({ role: 'user', content: question })
    const r = await sendTurn(apiUrl, apiKey, [...history], `Turn ${index + 1}`, cacheKey)
    history.push({ role: 'assistant', content: r.text })
    totalInput += r.usage?.input_tokens ?? 0
    totalCached += r.usage?.input_tokens_details?.cached_tokens ?? 0
  }

  const overallRate = totalInput > 0 ? ((totalCached / totalInput) * 100).toFixed(1) : '?'
  console.log(`  总计: input ${totalInput}, cached ${totalCached} (${overallRate}%)`)
}

async function main() {
  const provider = await resolveProviderModelConfig({
    modelId: MODEL,
    providerId: 'custom',
    apiUrlIncludes: 'tabcode.cc',
  })
  if (!provider.enableResponsesApi) {
    throw new Error(`模型 ${MODEL} 当前未启用 Responses API`)
  }
  const apiUrl = buildResponsesApiUrl(provider.apiUrl)

  console.log(`=== Prompt Cache 对照测试 ===`)
  console.log(`cache_key: ${CACHE_KEY}`)

  await runGroup('Part A: 带 prompt_cache_key', apiUrl, provider.apiKey, CACHE_KEY)
  await runGroup('Part B: 不带 prompt_cache_key', apiUrl, provider.apiKey)

  console.log('\n=== 完成 ===')
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
