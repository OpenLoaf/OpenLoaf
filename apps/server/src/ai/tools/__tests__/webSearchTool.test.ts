// @ts-nocheck — AI SDK tool().execute 的泛型在直接调用时有类型推断问题，运行时正确性由测试覆盖。
/**
 * Web Search 工具层测试
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/webSearchTool.test.ts
 *
 * 测试覆盖：
 *   W1 层 — Tool definition schema validation
 *   W2 层 — Provider abstraction
 *   W3 层 — Settings integration (isWebSearchConfigured)
 *   W4 层 — Jina provider integration (live, requires network + configured key)
 *   W5 层 — Error handling (mocked fetch)
 */
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { webSearchToolDef } from '@openloaf/api/types/tools/webSearch'
import { setOpenLoafRootOverride } from '@openloaf/config'

// Setup temp config dir before importing tool (readBasicConf reads from config dir)
const tempRoot = path.join(os.tmpdir(), `openloaf-ws-test-${Date.now()}`)
mkdirSync(tempRoot, { recursive: true })
setOpenLoafRootOverride(tempRoot)

function writeSettings(webSearchProvider: string, webSearchApiKey: string) {
  writeFileSync(
    path.join(tempRoot, 'settings.json'),
    JSON.stringify({ basic: { webSearchProvider, webSearchApiKey } }),
  )
}

// Start with empty settings (not configured)
writeSettings('', '')

// Now import tool (after config override is set)
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
  // W1 层 — Tool definition schema
  // -------------------------------------------------------------------------
  console.log('\nW1 层 — Tool definition schema')

  await test('W1a: webSearchToolDef has correct id', () => {
    assert.equal(webSearchToolDef.id, 'web-search')
  })

  await test('W1b: webSearchToolDef has name', () => {
    assert.equal(webSearchToolDef.name, '网页搜索')
  })

  await test('W1c: schema validates valid input', () => {
    const result = webSearchToolDef.parameters.safeParse({
      actionName: 'test search',
      query: 'TypeScript 5.0 features',
    })
    assert.equal(result.success, true)
  })

  await test('W1d: schema validates with maxResults', () => {
    const result = webSearchToolDef.parameters.safeParse({
      actionName: 'test',
      query: 'test query',
      maxResults: 3,
    })
    assert.equal(result.success, true)
  })

  await test('W1e: schema rejects empty query', () => {
    const result = webSearchToolDef.parameters.safeParse({
      actionName: 'test',
      query: '',
    })
    assert.equal(result.success, false)
  })

  await test('W1f: schema rejects missing actionName', () => {
    const result = webSearchToolDef.parameters.safeParse({
      query: 'test',
    })
    assert.equal(result.success, false)
  })

  await test('W1g: schema rejects maxResults > 10', () => {
    const result = webSearchToolDef.parameters.safeParse({
      actionName: 'test',
      query: 'test',
      maxResults: 20,
    })
    assert.equal(result.success, false)
  })

  await test('W1h: schema rejects maxResults < 1', () => {
    const result = webSearchToolDef.parameters.safeParse({
      actionName: 'test',
      query: 'test',
      maxResults: 0,
    })
    assert.equal(result.success, false)
  })

  await test('W1i: schema rejects non-integer maxResults', () => {
    const result = webSearchToolDef.parameters.safeParse({
      actionName: 'test',
      query: 'test',
      maxResults: 2.5,
    })
    assert.equal(result.success, false)
  })

  // -------------------------------------------------------------------------
  // W2 层 — Provider abstraction
  // -------------------------------------------------------------------------
  console.log('\nW2 层 — Provider abstraction')

  await test('W2a: WebSearchProvider interface contract', () => {
    const mockProvider: import('@/ai/tools/webSearchTool').WebSearchProvider = {
      search: async (query: string, maxResults: number) => {
        return [{ title: 'Test', url: 'https://example.com', content: 'Test content' }]
      },
    }
    assert.ok(typeof mockProvider.search === 'function')
  })

  await test('W2b: mock provider returns correct structure', async () => {
    const mockProvider: import('@/ai/tools/webSearchTool').WebSearchProvider = {
      search: async () => [
        { title: 'Result 1', url: 'https://a.com', content: 'Content 1' },
        { title: 'Result 2', url: 'https://b.com', content: 'Content 2' },
      ],
    }
    const results = await mockProvider.search('test', 5)
    assert.equal(results.length, 2)
    assert.equal(results[0].title, 'Result 1')
    assert.equal(results[1].url, 'https://b.com')
  })

  // -------------------------------------------------------------------------
  // W3 层 — Settings integration
  // -------------------------------------------------------------------------
  console.log('\nW3 层 — Settings integration')

  await test('W3a: isWebSearchConfigured returns false when not configured', () => {
    writeSettings('', '')
    assert.equal(isWebSearchConfigured(), false)
  })

  await test('W3b: isWebSearchConfigured returns false with provider but no key', () => {
    writeSettings('jina', '')
    assert.equal(isWebSearchConfigured(), false)
  })

  await test('W3c: isWebSearchConfigured returns false with key but no provider', () => {
    writeSettings('', 'some-key')
    assert.equal(isWebSearchConfigured(), false)
  })

  await test('W3d: isWebSearchConfigured returns true when fully configured', () => {
    writeSettings('jina', 'test-api-key')
    assert.equal(isWebSearchConfigured(), true)
  })

  await test('W3e: tool returns error when not configured', async () => {
    writeSettings('', '')
    const result: any = await webSearchTool.execute(
      { actionName: 'test', query: 'test' },
      toolCtx,
    )
    assert.equal(result.ok, false)
    assert.ok(result.error.includes('未配置'))
  })

  // -------------------------------------------------------------------------
  // W4 层 — Jina provider integration (live)
  // -------------------------------------------------------------------------
  console.log('\nW4 层 — Jina provider integration (live)')

  // Read JINA_API_KEY from env for live tests
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
    console.log('  ⚠ Jina API unavailable (no JINA_API_KEY or unreachable), W4-layer tests skipped')
  } else {
    // Configure settings with the real key for live tests
    writeSettings('jina', jinaApiKey)

    await test('W4a: live search returns results', async () => {
      const result: any = await webSearchTool.execute(
        { actionName: 'test live search', query: 'OpenAI GPT', maxResults: 3 },
        toolCtx,
      )
      assert.equal(result.ok, true)
      assert.ok(result.results.length > 0, 'should return at least 1 result')
      assert.ok(result.resultCount > 0)
    })

    await test('W4b: live results have expected fields', async () => {
      const result: any = await webSearchTool.execute(
        { actionName: 'test fields', query: 'TypeScript programming language', maxResults: 2 },
        toolCtx,
      )
      assert.equal(result.ok, true)
      for (const r of result.results) {
        assert.equal(typeof r.title, 'string')
        assert.equal(typeof r.url, 'string')
        assert.equal(typeof r.content, 'string')
      }
    })

    await test('W4c: maxResults is respected', async () => {
      const result: any = await webSearchTool.execute(
        { actionName: 'test limit', query: 'JavaScript', maxResults: 2 },
        toolCtx,
      )
      assert.equal(result.ok, true)
      assert.ok(result.results.length <= 2, `expected <= 2 results, got ${result.results.length}`)
    })
  }

  // -------------------------------------------------------------------------
  // W5 层 — Error handling (mocked fetch)
  // -------------------------------------------------------------------------
  console.log('\nW5 层 — Error handling')

  // Configure as "configured" so the tool doesn't short-circuit
  writeSettings('jina', 'test-key-for-error-tests')

  await test('W5a: tool returns ok=false on fetch error (not throw)', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
      throw new Error('Network error')
    }
    try {
      const result: any = await webSearchTool.execute(
        { actionName: 'test error', query: 'test' },
        toolCtx,
      )
      assert.equal(result.ok, false)
      assert.ok(result.error.includes('Network error'))
      assert.deepEqual(result.results, [])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await test('W5b: tool returns ok=false on non-200 response', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response('Not Found', { status: 404, statusText: 'Not Found' })
    try {
      const result: any = await webSearchTool.execute(
        { actionName: 'test 404', query: 'test' },
        toolCtx,
      )
      assert.equal(result.ok, false)
      assert.ok(result.error.includes('404'))
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await test('W5c: tool handles empty response data', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    try {
      const result: any = await webSearchTool.execute(
        { actionName: 'test empty', query: 'empty' },
        toolCtx,
      )
      assert.equal(result.ok, true)
      assert.equal(result.results.length, 0)
      assert.equal(result.resultCount, 0)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  await test('W5d: tool handles malformed JSON response', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response('not json', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    try {
      const result: any = await webSearchTool.execute(
        { actionName: 'test malformed', query: 'test' },
        toolCtx,
      )
      assert.equal(result.ok, false)
      assert.ok(result.error.length > 0)
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
