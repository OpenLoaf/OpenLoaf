/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * Level 2 — Codex / Responses API 调试测试。
 *
 * 用法：
 *   pnpm run test:ai:codex-debug
 *
 * 可选：
 *   CODEX_MODEL_ID="gpt-5.4" CODEX_PROVIDER_ENTRY_ID="..." pnpm run test:ai:codex-debug
 */
import { streamText, wrapLanguageModel, extractReasoningMiddleware, type JSONValue, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import {
  printSection,
  printPass,
  printFail,
  printDuration,
} from './helpers/printUtils'
import { resolveProviderModelConfig } from './helpers/testEnv'
import { installHttpProxy } from '@/modules/proxy/httpProxy'

installHttpProxy()

type StreamResult = { text: string; reasoning: string; rawParts: string[] }
type ProviderOptions = Record<string, Record<string, JSONValue>>

async function collectStream(
  model: Parameters<typeof streamText>[0]['model'],
  opts?: {
    prompt?: string
    messages?: ModelMessage[]
    providerOptions?: ProviderOptions
  },
): Promise<StreamResult> {
  const result = streamText({
    model,
    ...(opts?.messages ? { messages: opts.messages } : { prompt: opts?.prompt ?? '你好，用一句话介绍你自己。' }),
    ...(opts?.providerOptions ? { providerOptions: opts.providerOptions } : {}),
  })
  let text = ''
  let reasoning = ''
  const rawParts: string[] = []

  for await (const part of result.fullStream) {
    rawParts.push(part.type)
    if (part.type === 'text-delta') {
      // 打印第一个 text-delta 的完整结构用于调试
      if (!text) console.log(`  [debug] text-delta part keys: ${Object.keys(part).join(', ')}`, JSON.stringify(part).slice(0, 200))
      text += (part as any).textDelta ?? (part as any).delta ?? (part as any).text ?? ''
    }
    if (part.type === 'reasoning-delta') {
      if (!reasoning) console.log(`  [debug] reasoning-delta part keys: ${Object.keys(part).join(', ')}`, JSON.stringify(part).slice(0, 200))
      reasoning += (part as any).textDelta ?? (part as any).delta ?? (part as any).text ?? ''
    }
  }
  return { text, reasoning, rawParts }
}

async function main() {
  const start = Date.now()
  const modelId = process.env.CODEX_MODEL_ID?.trim() || 'gpt-5.4'
  const providerEntryId = process.env.CODEX_PROVIDER_ENTRY_ID?.trim()
  const resolved = await resolveProviderModelConfig({
    modelId,
    providerId: 'custom',
    providerEntryId,
  })
  if (!resolved.enableResponsesApi) {
    throw new Error(`模型 ${modelId} 当前未启用 Responses API`)
  }

  const results: { label: string; pass: boolean }[] = []
  const provider = createOpenAI({
    baseURL: resolved.apiUrl.replace(/\/+$/, ''),
    apiKey: resolved.apiKey,
  })

  // ── Test 1: 直接调用 ──
  printSection('Test 1: Responses API (无 middleware)')
  {
    const cs = Date.now()
    try {
      const r = await collectStream(provider(modelId))
      printDuration(cs)
      console.log(`  text(${r.text.length}): "${r.text.slice(0, 80)}"`)
      console.log(`  reasoning(${r.reasoning.length}): "${r.reasoning.slice(0, 80)}"`)
      console.log(`  part types: ${[...new Set(r.rawParts)].join(', ')}`)
      const pass = r.text.length > 0
      pass ? printPass('有 text') : printFail('text 为空', r.reasoning ? '内容在 reasoning 中' : '无内容')
      results.push({ label: '无 middleware', pass })
    } catch (e: any) { printFail('异常', e.message); results.push({ label: '无 middleware', pass: false }) }
  }

  // ── Test 2: startWithReasoning=true ──
  printSection('Test 2: + extractReasoningMiddleware(startWithReasoning=true)')
  {
    const model = wrapLanguageModel({
      model: provider(modelId) as any,
      middleware: [extractReasoningMiddleware({ tagName: 'think', startWithReasoning: true })],
    })
    const cs = Date.now()
    try {
      const r = await collectStream(model)
      printDuration(cs)
      console.log(`  text(${r.text.length}): "${r.text.slice(0, 80)}"`)
      console.log(`  reasoning(${r.reasoning.length}): "${r.reasoning.slice(0, 80)}"`)
      const textEmpty = r.text.trim().length === 0
      textEmpty
        ? printFail('text 被吞进 reasoning — BUG', 'startWithReasoning=true')
        : printPass('text 有内容')
      results.push({ label: 'startWithReasoning=true', pass: !textEmpty })
    } catch (e: any) { printFail('异常', e.message); results.push({ label: 'startWithReasoning=true', pass: false }) }
  }

  // ── Test 3: startWithReasoning=false ──
  printSection('Test 3: + extractReasoningMiddleware(startWithReasoning=false)')
  {
    const model = wrapLanguageModel({
      model: provider(modelId) as any,
      middleware: [extractReasoningMiddleware({ tagName: 'think', startWithReasoning: false })],
    })
    const cs = Date.now()
    try {
      const r = await collectStream(model)
      printDuration(cs)
      console.log(`  text(${r.text.length}): "${r.text.slice(0, 80)}"`)
      const pass = r.text.length > 0
      pass ? printPass('text 正常') : printFail('text 为空', 'unexpected')
      results.push({ label: 'startWithReasoning=false', pass })
    } catch (e: any) { printFail('异常', e.message); results.push({ label: 'startWithReasoning=false', pass: false }) }
  }

  // ── Test 4: 多轮 store 不设（SDK 默认 true）→ 预期 item not found ──
  printSection('Test 4: 多轮对话 — 不设 store（SDK 默认 true）')
  {
    const model = provider(modelId)
    const cs = Date.now()
    try {
      console.log('  [第1轮] "你好"')
      const r1 = await collectStream(model, { prompt: '你好' })
      const firstText = r1.text || '你好。'
      console.log(`  [第1轮] text: "${firstText.slice(0, 60)}"`)

      const messages: ModelMessage[] = [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: firstText },
        { role: 'user', content: '再用英文说一遍。' },
      ]
      console.log('  [第2轮] "再用英文说一遍。" (store=默认)')
      const r2 = await collectStream(model, { messages })
      console.log(`  [第2轮] text: "${r2.text.slice(0, 60)}"`)
      const pass = r2.text.length > 0
      pass ? printPass('多轮成功') : printFail('text 为空', '')
      results.push({ label: '多轮 store=默认', pass })
    } catch (e: any) {
      const msg = e.responseBody || e.message || ''
      const isItemErr = msg.includes('not found') || msg.includes('Item')
      if (isItemErr) {
        printFail('item not found — 第三方 API 不支持 store', msg.slice(0, 150))
      } else {
        printFail('异常', msg.slice(0, 150))
      }
      results.push({ label: '多轮 store=默认', pass: false })
    }
    printDuration(cs)
  }

  // ── Test 5: 多轮 store=false → 预期成功 ──
  printSection('Test 5: 多轮对话 — store=false（修复方案）')
  {
    const model = provider(modelId)
    const storeOpts = { openai: { store: false } }
    const cs = Date.now()
    try {
      console.log('  [第1轮] "你好"')
      const r1 = await collectStream(model, { prompt: '你好', providerOptions: storeOpts })
      const firstText = r1.text || '你好。'
      console.log(`  [第1轮] text: "${firstText.slice(0, 60)}"`)

      const messages: ModelMessage[] = [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: firstText },
        { role: 'user', content: '再用英文说一遍。' },
      ]
      console.log('  [第2轮] "再用英文说一遍。" (store=false)')
      const r2 = await collectStream(model, { messages, providerOptions: storeOpts })
      console.log(`  [第2轮] text: "${r2.text.slice(0, 60)}"`)
      const pass = r2.text.length > 0
      pass ? printPass('多轮 store=false 成功') : printFail('text 为空', '')
      results.push({ label: '多轮 store=false', pass })
    } catch (e: any) {
      printFail('异常', (e.responseBody || e.message || '').slice(0, 150))
      results.push({ label: '多轮 store=false', pass: false })
    }
    printDuration(cs)
  }

  // ── 汇总 ──
  printDuration(start)
  console.log('\n=== 结果汇总 ===')
  for (const r of results) console.log(`  ${r.pass ? '✅' : '❌'} ${r.label}`)

  if (results[0]?.pass && !results[1]?.pass && results[2]?.pass) {
    console.log('\n💡 extractReasoningMiddleware(startWithReasoning=true) 吞掉了 text')
  }
  if (!results[3]?.pass && results[4]?.pass) {
    console.log('\n💡 store=true 导致多轮失败，store=false 修复成功')
  }

  process.exit(results.every(r => r.pass) ? 0 : 1)
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1) })
