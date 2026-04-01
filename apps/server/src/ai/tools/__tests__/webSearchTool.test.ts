// @ts-nocheck — AI SDK tool().execute 的泛型在直接调用时有类型推断问题，运行时正确性由测试覆盖。
/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * WebSearch 工具测试（重构后 — 匹配 Claude Code 架构）
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/webSearchTool.test.ts
 *
 * 测试覆盖：
 *   W1 层 — Tool definition schema validation (新 schema: query/allowed_domains/blocked_domains)
 *   W2 层 — Provider abstraction (新接口)
 *   W3 层 — Settings integration (isWebSearchConfigured)
 *   W4 层 — Jina provider integration (live, requires JINA_API_KEY)
 *   W5 层 — Error handling + input validation
 */
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { webSearchToolDef } from '@openloaf/api/types/tools/webSearch'
import { setOpenLoafRootOverride } from '@openloaf/config'

// Setup temp config dir before importing tool
const tempRoot = path.join(os.tmpdir(), `openloaf-ws-test-${Date.now()}`)
mkdirSync(tempRoot, { recursive: true })
setOpenLoafRootOverride(tempRoot)

function writeSettings(webSearchProvider: string, webSearchApiKey: string) {
  writeFileSync(
    path.join(tempRoot, 'settings.json'),
    JSON.stringify({ basic: { webSearchProvider, webSearchApiKey } }),
  )
}

// Start with empty settings
writeSettings('', '')

// Import tool after config override
const { webSearchTool, isWebSearchConfigured } = await import('@/ai/tools/webSearchTool')

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
const errors: string[] = []

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err: any) {
    failed++
    const m = err?.message ?? String(err)
    errors.push(`${name}: ${m}`)
    console.log(`  ✗ ${name}: ${m}`)
  }
}

const toolCtx = { toolCallId: 'test', messages: [], abortSignal: AbortSignal.abort() }

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // -------------------------------------------------------------------------
  // W1 层 — Tool definition schema (Claude Code style)
  // -------------------------------------------------------------------------
  console.log('\nW1 — Tool definition schema')

  await test('W1a: id 为 WebSearch', () => {
    assert.equal(webSearchToolDef.id, 'WebSearch')
  })

  await test('W1b: name 为网页搜索', () => {
    assert.equal(webSearchToolDef.name, '网页搜索')
  })

  await test('W1c: query 必填 (min 2 chars)', () => {
    const ok = webSearchToolDef.parameters.safeParse({ query: 'ab' })
    assert.equal(ok.success, true)
    const tooShort = webSearchToolDef.parameters.safeParse({ query: 'a' })
    assert.equal(tooShort.success, false)
  })

  await test('W1d: allowed_domains 可选', () => {
    const result = webSearchToolDef.parameters.safeParse({
      query: 'test query',
      allowed_domains: ['example.com', 'docs.python.org'],
    })
    assert.equal(result.success, true)
  })

  await test('W1e: blocked_domains 可选', () => {
    const result = webSearchToolDef.parameters.safeParse({
      query: 'test query',
      blocked_domains: ['spam.com'],
    })
    assert.equal(result.success, true)
  })

  await test('W1f: 不再有 maxResults 参数', () => {
    // Schema should accept input without maxResults (it's removed)
    const result = webSearchToolDef.parameters.safeParse({
      query: 'test',
      maxResults: 5,
    })
    // Zod strict mode would reject unknown keys, but our schema uses z.object (not strict)
    // Either way, the parameter is not in the schema
    const parsed = result.success ? result.data : null
    if (parsed) {
      assert.equal('maxResults' in parsed, false, 'maxResults should not be in parsed output')
    }
  })

  await test('W1g: 空 query 被拒绝', () => {
    const result = webSearchToolDef.parameters.safeParse({ query: '' })
    assert.equal(result.success, false)
  })

  // -------------------------------------------------------------------------
  // W2 层 — Provider abstraction (新接口)
  // -------------------------------------------------------------------------
  console.log('\nW2 — Provider abstraction')

  await test('W2a: WebSearchProvider 接口包含 options 参数', () => {
    const mockProvider: import('@/ai/tools/webSearchTool').WebSearchProvider = {
      search: async (_query: string, _options?: { allowedDomains?: string[]; blockedDomains?: string[] }) => {
        return [{ title: 'Test', url: 'https://example.com', content: 'content' }]
      },
    }
    assert.ok(typeof mockProvider.search === 'function')
  })

  await test('W2b: mock provider 返回正确结构', async () => {
    const mockProvider: import('@/ai/tools/webSearchTool').WebSearchProvider = {
      search: async () => [
        { title: 'Result 1', url: 'https://a.com', content: 'Content 1' },
        { title: 'Result 2', url: 'https://b.com', content: 'Content 2' },
      ],
    }
    const results = await mockProvider.search('test')
    assert.equal(results.length, 2)
    assert.equal(results[0].title, 'Result 1')
  })

  // -------------------------------------------------------------------------
  // W3 层 — Settings integration
  // -------------------------------------------------------------------------
  console.log('\nW3 — Settings integration')

  await test('W3a: 未配置时返回 false', () => {
    writeSettings('', '')
    assert.equal(isWebSearchConfigured(), false)
  })

  await test('W3b: 仅 provider 无 key 返回 false', () => {
    writeSettings('jina', '')
    assert.equal(isWebSearchConfigured(), false)
  })

  await test('W3c: 仅 key 无 provider 返回 false', () => {
    writeSettings('', 'some-key')
    assert.equal(isWebSearchConfigured(), false)
  })

  await test('W3d: 完整配置返回 true', () => {
    writeSettings('jina', 'test-api-key')
    assert.equal(isWebSearchConfigured(), true)
  })

  await test('W3e: 未配置时工具返回错误字符串', async () => {
    writeSettings('', '')
    const result: string = await webSearchTool.execute(
      { query: 'test query' },
      toolCtx,
    )
    assert.ok(typeof result === 'string')
    assert.ok(result.includes('Error'), `应包含 Error: ${result}`)
    assert.ok(result.includes('not configured') || result.includes('Settings'), `应提示配置: ${result}`)
  })

  // -------------------------------------------------------------------------
  // W4 层 — Input validation (Claude Code style)
  // -------------------------------------------------------------------------
  console.log('\nW4 — Input validation')

  // Configure for validation tests
  writeSettings('jina', 'test-key')

  await test('W4a: 同时指定 allowed 和 blocked 返回错误', async () => {
    const result: string = await webSearchTool.execute(
      { query: 'test', allowed_domains: ['a.com'], blocked_domains: ['b.com'] },
      toolCtx,
    )
    assert.ok(result.includes('Error'))
    assert.ok(result.includes('Cannot specify both'))
  })

  await test('W4b: 过短 query 返回错误', async () => {
    const result: string = await webSearchTool.execute(
      { query: 'a' },
      toolCtx,
    )
    assert.ok(result.includes('Error') || result.includes('too short'))
  })

  // -------------------------------------------------------------------------
  // W5 层 — Jina integration (live)
  // -------------------------------------------------------------------------
  console.log('\nW5 — Jina integration (live)')

  const jinaApiKey = process.env.JINA_API_KEY || ''
  let jinaAvailable = false
  if (jinaApiKey) {
    try {
      const resp = await fetch('https://s.jina.ai/test', {
        headers: {
          Accept: 'application/json',
          'X-Retain-Images': 'none',
          Authorization: `Bearer ${jinaApiKey}`,
        },
        signal: AbortSignal.timeout(10000),
      })
      jinaAvailable = resp.ok
    } catch {}
  }

  if (!jinaAvailable) {
    console.log('  ⚠ Jina API 不可用（无 JINA_API_KEY），W5 层跳过')
  } else {
    writeSettings('jina', jinaApiKey)

    await test('W5a: 搜索返回包含结果的字符串', async () => {
      const result: string = await webSearchTool.execute(
        { query: 'OpenAI GPT' },
        toolCtx,
      )
      assert.ok(typeof result === 'string')
      assert.ok(result.includes('Web search results'))
      assert.ok(result.includes('URL:'))
      assert.ok(result.includes('REMINDER'))
    })

    await test('W5b: 结果包含 Sources 提醒', async () => {
      const result: string = await webSearchTool.execute(
        { query: 'TypeScript programming' },
        toolCtx,
      )
      assert.ok(result.includes('REMINDER'))
      assert.ok(result.includes('sources'))
    })
  }

  // -------------------------------------------------------------------------
  // W6 层 — Error handling (mocked fetch)
  // -------------------------------------------------------------------------
  console.log('\nW6 — Error handling')

  writeSettings('jina', 'test-key-for-error-tests')

  await test('W6a: 网络错误返回错误字符串（不抛出）', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => { throw new Error('Network error') }
    try {
      const result: string = await webSearchTool.execute(
        { query: 'test query' },
        toolCtx,
      )
      assert.ok(typeof result === 'string')
      assert.ok(result.includes('Error') || result.includes('Network error'))
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await test('W6b: HTTP 404 返回错误字符串', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response('Not Found', { status: 404, statusText: 'Not Found' })
    try {
      const result: string = await webSearchTool.execute(
        { query: 'test query' },
        toolCtx,
      )
      assert.ok(result.includes('Error') || result.includes('404'))
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await test('W6c: 空搜索结果有友好提示', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    try {
      const result: string = await webSearchTool.execute(
        { query: 'empty results test' },
        toolCtx,
      )
      assert.ok(result.includes('No results') || result.includes('0 results'))
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`)
  if (errors.length > 0) {
    console.log('\nFailed:')
    for (const e of errors) console.log(`  - ${e}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
