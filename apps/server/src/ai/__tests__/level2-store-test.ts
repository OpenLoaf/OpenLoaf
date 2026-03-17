/**
 * 测试 api.tabcode.cc 是否支持 store 参数（streaming 模式）
 *
 * 用法：node --env-file=.env --import tsx/esm src/ai/__tests__/level2-store-test.ts
 */
import { buildResponsesApiUrl, resolveProviderModelConfig } from './helpers/testEnv'

const MODEL = 'gpt-5.4'

async function readSSE(resp: Response): Promise<{ text: string; responseId: string; outputItemId: string }> {
  let text = ''
  let responseId = ''
  let outputItemId = ''
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
        if (evt.type === 'response.created' || evt.type === 'response.completed') {
          responseId = evt.response?.id || responseId
        }
        if (evt.type === 'response.output_item.added') {
          outputItemId = evt.item?.id || outputItemId
        }
        if (evt.type === 'response.output_text.delta') {
          text += evt.delta || ''
        }
      } catch {}
    }
  }
  return { text, responseId, outputItemId }
}

async function testStore() {
  const provider = await resolveProviderModelConfig({
    modelId: MODEL,
    providerId: 'custom',
    apiUrlIncludes: 'tabcode.cc',
  })
  if (!provider.enableResponsesApi) {
    throw new Error(`模型 ${MODEL} 当前未启用 Responses API`)
  }
  const apiUrl = buildResponsesApiUrl(provider.apiUrl)

  console.log('=== Test: store support on api.tabcode.cc ===\n')

  // Step 1: Send with store=true
  console.log('[1] store=true, stream=true ...')
  const r1 = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      store: true,
      input: [{ role: 'user', content: '你好，用一个词回答：天空是什么颜色？' }],
    }),
  })

  if (!r1.ok) {
    const err = await r1.text()
    console.log(`  ❌ store=true 请求失败: ${r1.status} ${err.slice(0, 200)}`)
    return
  }

  const s1 = await readSSE(r1)
  console.log(`  ✅ text: "${s1.text.slice(0, 60)}"`)
  console.log(`  responseId: ${s1.responseId}`)
  console.log(`  outputItemId: ${s1.outputItemId}`)

  if (!s1.outputItemId) {
    console.log('\n  ⚠️ 没有 outputItemId，无法测试 item_reference')
    return
  }

  // Step 2: Use item_reference (what SDK does when store=true)
  console.log('\n[2] 使用 item_reference 引用上轮回复 ...')
  const r2 = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      store: true,
      input: [
        { type: 'item_reference', id: s1.outputItemId },
        { role: 'user', content: '用英文再说一遍' },
      ],
    }),
  })

  if (!r2.ok) {
    const err = await r2.text()
    console.log(`  ❌ item_reference 失败: ${r2.status} ${err.slice(0, 300)}`)
    console.log('  💡 说明 API 不支持 store/item_reference，应使用 store=false')
  } else {
    const s2 = await readSSE(r2)
    console.log(`  ✅ item_reference 成功! text: "${s2.text.slice(0, 60)}"`)
    console.log('  💡 API 支持 store，store=false 修复非必要')
  }

  // Step 3: Also test store=false for comparison
  console.log('\n[3] store=false（完整历史）...')
  const r3 = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      stream: true,
      store: false,
      input: [
        { role: 'user', content: '你好，用一个词回答：天空是什么颜色？' },
        { role: 'assistant', content: s1.text },
        { role: 'user', content: '用英文再说一遍' },
      ],
    }),
  })

  if (!r3.ok) {
    const err = await r3.text()
    console.log(`  ❌ store=false 失败: ${r3.status} ${err.slice(0, 200)}`)
  } else {
    const s3 = await readSSE(r3)
    console.log(`  ✅ store=false 成功! text: "${s3.text.slice(0, 60)}"`)
  }

  console.log('\n=== 测试完成 ===')
}

testStore().catch(e => { console.error('Fatal:', e); process.exit(1) })
