/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * 验证 jsonExtract 对各 provider 自由文本输出形态的鲁棒性。
 * 这是根因修复的核心：放弃 response_format=json_schema 后，
 * 各家 LLM 输出形态各异，必须能稳定从中抽出 JSON。
 *
 * 用法：
 *   pnpm --filter server test:ai:json-extract
 */
import assert from 'node:assert/strict'
import { z } from 'zod'
import { extractJsonBlock, parseJsonByZod, describeSchemaForPrompt } from '@/ai/services/jsonExtract'

let passed = 0
let failed = 0
function test(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✅ ${name}`)
    passed += 1
  } catch (e) {
    console.log(`  ❌ ${name}`)
    console.log(`     ${(e as Error).message}`)
    failed += 1
  }
}

const schema = z.object({ summary: z.string() })

console.log('extractJsonBlock — 跨 provider 输出形态')

test('plain JSON object (Qwen / OpenAI typical)', () => {
  const out = extractJsonBlock('{"summary":"Hello"}')
  assert.equal(out, '{"summary":"Hello"}')
})

test('markdown ```json fence (Kimi / Claude commonly emit)', () => {
  const out = extractJsonBlock('```json\n{"summary":"Hello"}\n```')
  assert.equal(out, '{"summary":"Hello"}')
})

test('plain ``` fence without json tag (Gemini sometimes)', () => {
  const out = extractJsonBlock('```\n{"summary":"Hello"}\n```')
  assert.equal(out, '{"summary":"Hello"}')
})

test('preface text + JSON (DeepSeek when not strict)', () => {
  const out = extractJsonBlock('Here is the JSON you requested:\n{"summary":"Hello"}\nLet me know if you need more.')
  assert.equal(out, '{"summary":"Hello"}')
})

test('JSON with thinking-tag preface', () => {
  const out = extractJsonBlock('<think>analyzing...</think>\n\n{"summary":"Hello"}')
  assert.equal(out, '{"summary":"Hello"}')
})

test('multi-line nested JSON inside fence', () => {
  const input = '```json\n{\n  "summary": "Multi-line\\nValue"\n}\n```'
  const out = extractJsonBlock(input)
  assert.equal(out, '{\n  "summary": "Multi-line\\nValue"\n}')
})

test('array form', () => {
  const out = extractJsonBlock('Some text [1,2,3] more text')
  assert.equal(out, '[1,2,3]')
})

test('returns trimmed input when no JSON found', () => {
  const out = extractJsonBlock('   no json here   ')
  assert.equal(out, 'no json here')
})

console.log('\nparseJsonByZod — 解析 + schema 校验')

test('parses plain JSON to typed value', () => {
  const v = parseJsonByZod('{"summary":"hello"}', schema)
  assert.equal(v.summary, 'hello')
})

test('parses fenced JSON', () => {
  const v = parseJsonByZod('```json\n{"summary":"hello"}\n```', schema)
  assert.equal(v.summary, 'hello')
})

test('parses JSON with surrounding noise', () => {
  const v = parseJsonByZod('OK here it is: {"summary":"hello"} done.', schema)
  assert.equal(v.summary, 'hello')
})

test('throws on malformed JSON', () => {
  assert.throws(
    () => parseJsonByZod('{summary: hello}', schema),
    /JSON\.parse failed/,
  )
})

test('throws when schema validation fails', () => {
  assert.throws(
    () => parseJsonByZod('{"wrongField":"x"}', schema),
    /schema validation failed/,
  )
})

test('preserves nested structure', () => {
  const nested = z.object({
    type: z.enum(['code', 'document']),
    icon: z.string(),
    confidence: z.number().min(0).max(1),
  })
  const v = parseJsonByZod(
    '```json\n{"type":"code","icon":"💻","confidence":0.92}\n```',
    nested,
  )
  assert.equal(v.type, 'code')
  assert.equal(v.icon, '💻')
  assert.equal(v.confidence, 0.92)
})

console.log('\ndescribeSchemaForPrompt — schema 渲染为 prompt')

test('renders zod schema as compact JSON Schema', () => {
  const out = describeSchemaForPrompt(schema)
  assert.ok(out.includes('"summary"'), `expected summary in: ${out}`)
  assert.ok(out.includes('"string"'), `expected string type`)
  assert.ok(!out.includes('"$schema"'), 'should strip $schema')
  assert.ok(!out.includes('"additionalProperties"'), 'should strip additionalProperties')
})

test('handles enum schema', () => {
  const enumSchema = z.object({ kind: z.enum(['a', 'b', 'c']) })
  const out = describeSchemaForPrompt(enumSchema)
  assert.ok(out.includes('"a"') && out.includes('"b"'), `expected enum values: ${out}`)
})

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
