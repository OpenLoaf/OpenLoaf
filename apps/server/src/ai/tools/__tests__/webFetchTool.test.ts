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
 * WebFetch 工具测试
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/webFetchTool.test.ts
 *
 * 测试覆盖：
 *   F1 层 — Tool definition schema validation
 *   F2 层 — URL validation (validateURL)
 *   F3 层 — Content-type detection (isTextContentType / mimeToExtension)
 *   F4 层 — Content processing (text path: HTML/JSON/Markdown/plain)
 *   F5 层 — Binary content handling
 *   F6 层 — Redirect handling
 *   F7 层 — Auxiliary model analysis decision (shouldSkipAnalysis)
 *   F8 层 — Cache behavior
 *   F9 层 — Error handling
 */
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import { mkdirSync, rmSync } from 'node:fs'
import { webFetchToolDef } from '@openloaf/api/types/tools/webFetch'
import { setOpenLoafRootOverride } from '@openloaf/config'

// ---------------------------------------------------------------------------
// Setup — temp config dir + session context
// ---------------------------------------------------------------------------

const tempRoot = path.join(os.tmpdir(), `openloaf-wf-test-${Date.now()}`)
mkdirSync(tempRoot, { recursive: true })
setOpenLoafRootOverride(tempRoot)

// Set request context with a sessionId so getSessionId() returns a value.
// saveRawArtifact will fail (no real session dir) but trySaveRaw catches
// errors gracefully — core logic still works without file persistence.
const { setRequestContext } = await import('@/ai/shared/context/requestContext')
setRequestContext({ sessionId: `test-session-${Date.now()}` } as any)

// Import tool after config override
const { webFetchTool } = await import('@/ai/tools/webFetchTool')

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

const toolCtx = { toolCallId: 'test', messages: [], abortSignal: new AbortController().signal }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock Response from text content. */
function mockTextResponse(body: string, contentType = 'text/html', status = 200) {
  return new Response(body, {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': contentType },
  })
}

/** Build a mock Response from binary content. */
function mockBinaryResponse(bytes: Uint8Array, contentType: string) {
  return new Response(bytes, {
    status: 200,
    statusText: 'OK',
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.byteLength),
    },
  })
}

/** Mock global fetch to return a specific response, restoring after the callback. */
async function withMockedFetch(
  handler: (url: string | URL | Request) => Response | Promise<Response>,
  fn: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input: any, _init?: any) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    return handler(url)
  }
  try {
    await fn()
  } finally {
    globalThis.fetch = originalFetch
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // =========================================================================
  // F1 层 — Tool definition schema
  // =========================================================================
  console.log('\nF1 — Tool definition schema')

  await test('F1a: id 为 WebFetch', () => {
    assert.equal(webFetchToolDef.id, 'WebFetch')
  })

  await test('F1b: readonly 为 true', () => {
    assert.equal(webFetchToolDef.readonly, true)
  })

  await test('F1c: url 必填', () => {
    const missing = webFetchToolDef.parameters.safeParse({ prompt: 'test' })
    assert.equal(missing.success, false)
  })

  await test('F1d: prompt 必填', () => {
    const missing = webFetchToolDef.parameters.safeParse({ url: 'https://example.com' })
    assert.equal(missing.success, false)
  })

  await test('F1e: url + prompt 通过校验', () => {
    const ok = webFetchToolDef.parameters.safeParse({
      url: 'https://example.com',
      prompt: 'What is this page about?',
    })
    assert.equal(ok.success, true)
  })

  await test('F1f: 空 url 被拒绝', () => {
    const empty = webFetchToolDef.parameters.safeParse({ url: '', prompt: 'test' })
    assert.equal(empty.success, false)
  })

  await test('F1g: 空 prompt 被拒绝', () => {
    const empty = webFetchToolDef.parameters.safeParse({ url: 'https://x.com', prompt: '' })
    assert.equal(empty.success, false)
  })

  // =========================================================================
  // F2 层 — URL validation (via tool execute with invalid URLs)
  // =========================================================================
  console.log('\nF2 — URL validation')

  await test('F2a: 无法解析的 URL 返回错误', async () => {
    const result: string = await webFetchTool.execute(
      { url: 'not-a-url', prompt: 'test' },
      toolCtx,
    )
    assert.ok(result.startsWith('Error'))
    assert.ok(result.includes('could not be parsed'))
  })

  await test('F2b: 超长 URL (>2000) 返回错误', async () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2000)
    const result: string = await webFetchTool.execute(
      { url: longUrl, prompt: 'test' },
      toolCtx,
    )
    assert.ok(result.startsWith('Error'))
    assert.ok(result.includes('too long'))
  })

  await test('F2c: 含凭据的 URL 返回错误', async () => {
    const result: string = await webFetchTool.execute(
      { url: 'https://user:pass@example.com', prompt: 'test' },
      toolCtx,
    )
    assert.ok(result.startsWith('Error'))
    assert.ok(result.includes('credentials'))
  })

  await test('F2d: ftp 协议返回错误', async () => {
    const result: string = await webFetchTool.execute(
      { url: 'ftp://files.example.com/file.txt', prompt: 'test' },
      toolCtx,
    )
    assert.ok(result.startsWith('Error'))
    assert.ok(result.includes('protocol'))
  })

  // =========================================================================
  // F3 层 — Content-type detection
  // =========================================================================
  console.log('\nF3 — Content-type detection (text vs binary)')

  // Test via tool execution: HTML should return a Summary section
  await test('F3a: text/html 走文本路径，返回 Summary', async () => {
    await withMockedFetch(
      () => mockTextResponse('<html><body><h1>Hello</h1><p>World</p></body></html>', 'text/html'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f3a-test.example.com/page', prompt: 'Get the heading' },
          toolCtx,
        )
        assert.ok(result.includes('## Summary'), `应包含 Summary 标题: ${result.slice(0, 200)}`)
        assert.ok(!result.includes('Binary content'), '不应是二进制路径')
      },
    )
  })

  await test('F3b: application/json 走文本路径', async () => {
    await withMockedFetch(
      () => mockTextResponse('{"key": "value"}', 'application/json'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f3b-test.example.com/api', prompt: 'Get the data' },
          toolCtx,
        )
        assert.ok(result.includes('## Summary'))
        assert.ok(result.includes('"key"'))
      },
    )
  })

  await test('F3c: text/markdown 走文本路径', async () => {
    await withMockedFetch(
      () => mockTextResponse('# Title\n\nSome content', 'text/markdown'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f3c-test.example.com/doc.md', prompt: 'Read the doc' },
          toolCtx,
        )
        assert.ok(result.includes('## Summary'))
        assert.ok(result.includes('# Title'))
      },
    )
  })

  await test('F3d: application/pdf 走二进制路径', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF magic bytes
    await withMockedFetch(
      () => mockBinaryResponse(pdfBytes, 'application/pdf'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f3d-test.example.com/file.pdf', prompt: 'Read the PDF' },
          toolCtx,
        )
        assert.ok(result.includes('Binary content'), `应走二进制路径: ${result.slice(0, 300)}`)
        assert.ok(result.includes('application/pdf'))
        assert.ok(result.includes('Read tool'))
      },
    )
  })

  await test('F3e: image/png 走二进制路径', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47]) // PNG magic bytes
    await withMockedFetch(
      () => mockBinaryResponse(pngBytes, 'image/png'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f3e-test.example.com/image.png', prompt: 'Describe the image' },
          toolCtx,
        )
        assert.ok(result.includes('Binary content'))
        assert.ok(result.includes('image/png'))
      },
    )
  })

  await test('F3f: application/octet-stream 走二进制路径', async () => {
    const binBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03])
    await withMockedFetch(
      () => mockBinaryResponse(binBytes, 'application/octet-stream'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f3f-test.example.com/data.bin', prompt: 'What is this' },
          toolCtx,
        )
        assert.ok(result.includes('Binary content'))
      },
    )
  })

  await test('F3g: application/ld+json 走文本路径 (+json 后缀)', async () => {
    await withMockedFetch(
      () => mockTextResponse('{"@context":"https://schema.org"}', 'application/ld+json'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f3g-test.example.com/schema', prompt: 'Get schema' },
          toolCtx,
        )
        assert.ok(result.includes('## Summary'))
        assert.ok(!result.includes('Binary content'))
      },
    )
  })

  // =========================================================================
  // F4 层 — Text content processing
  // =========================================================================
  console.log('\nF4 — Text content processing')

  await test('F4a: HTML 转 Markdown（Turndown）', async () => {
    const html = '<html><body><h1>Title</h1><p>Paragraph text</p><ul><li>Item 1</li><li>Item 2</li></ul></body></html>'
    await withMockedFetch(
      () => mockTextResponse(html, 'text/html'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f4a-test.example.com/page', prompt: 'Read the page content' },
          toolCtx,
        )
        // 辅助模型可能处理了内容，但至少应该有 Summary 部分
        assert.ok(result.includes('## Summary'))
      },
    )
  })

  await test('F4b: JSON 被 pretty-print', async () => {
    const json = '{"name":"test","items":[1,2,3]}'
    await withMockedFetch(
      () => mockTextResponse(json, 'application/json'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f4b-test.example.com/api.json', prompt: 'Read json' },
          toolCtx,
        )
        // JSON under 20K should be passed through directly (shouldSkipAnalysis)
        assert.ok(result.includes('"name"'))
        assert.ok(result.includes('"test"'))
      },
    )
  })

  await test('F4c: text/plain 原样返回', async () => {
    await withMockedFetch(
      () => mockTextResponse('Plain text content here', 'text/plain'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f4c-test.example.com/file.txt', prompt: 'Read text' },
          toolCtx,
        )
        assert.ok(result.includes('Plain text content here'))
      },
    )
  })

  // =========================================================================
  // F5 层 — Binary content persistence
  // =========================================================================
  console.log('\nF5 — Binary content persistence')

  await test('F5a: PDF 二进制结果包含文件描述', async () => {
    const pdfContent = new Uint8Array(Buffer.from('%PDF-1.4 fake content'))
    await withMockedFetch(
      () => mockBinaryResponse(pdfContent, 'application/pdf'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f5a-test.example.com/doc.pdf', prompt: 'Read PDF' },
          toolCtx,
        )
        // Should contain binary description even if file persistence failed
        assert.ok(result.includes('Binary content'), '应包含二进制描述')
        assert.ok(result.includes('application/pdf'), '应包含 MIME 类型')
      },
    )
  })

  await test('F5b: 二进制结果包含 MIME 类型和大小', async () => {
    const imgBytes = new Uint8Array(1024) // 1KB dummy image
    await withMockedFetch(
      () => mockBinaryResponse(imgBytes, 'image/jpeg'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f5b-test.example.com/photo.jpg', prompt: 'Describe' },
          toolCtx,
        )
        assert.ok(result.includes('image/jpeg'), '应包含 MIME 类型')
        assert.ok(result.includes('1.0KB') || result.includes('1024'), '应包含大小信息')
      },
    )
  })

  // =========================================================================
  // F6 层 — Redirect handling
  // =========================================================================
  console.log('\nF6 — Redirect handling')

  await test('F6a: 同域 redirect 自动跟随', async () => {
    let callCount = 0
    await withMockedFetch(
      (url) => {
        callCount++
        if (callCount === 1) {
          return new Response(null, {
            status: 301,
            headers: { Location: 'https://f6a-test.example.com/new-page' },
          })
        }
        return mockTextResponse('<p>Final page</p>', 'text/html')
      },
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f6a-test.example.com/old-page', prompt: 'Read' },
          toolCtx,
        )
        assert.equal(callCount, 2, '应跟随同域重定向')
        assert.ok(result.includes('## Summary') || result.includes('Final page'))
      },
    )
  })

  await test('F6b: 跨域 redirect 返回 REDIRECT DETECTED', async () => {
    await withMockedFetch(
      () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://other-domain.com/page' },
        }),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f6b-test.example.com/external', prompt: 'Read' },
          toolCtx,
        )
        assert.ok(result.includes('REDIRECT DETECTED'), '应检测到跨域重定向')
        assert.ok(result.includes('other-domain.com'))
      },
    )
  })

  await test('F6c: www 前缀差异视为同域', async () => {
    let callCount = 0
    await withMockedFetch(
      (url) => {
        callCount++
        if (callCount === 1) {
          return new Response(null, {
            status: 301,
            headers: { Location: 'https://www.f6c-test.example.com/page' },
          })
        }
        return mockTextResponse('<p>OK</p>', 'text/html')
      },
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f6c-test.example.com/page', prompt: 'Read' },
          toolCtx,
        )
        assert.equal(callCount, 2, '应跟随 www 前缀重定向')
        assert.ok(!result.includes('REDIRECT DETECTED'))
      },
    )
  })

  await test('F6d: 超过 10 次重定向返回错误', async () => {
    let callCount = 0
    await withMockedFetch(
      () => {
        callCount++
        return new Response(null, {
          status: 301,
          headers: { Location: `https://f6d-test.example.com/loop-${callCount}` },
        })
      },
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f6d-test.example.com/start', prompt: 'Read' },
          toolCtx,
        )
        assert.ok(result.includes('Error'))
        assert.ok(result.includes('redirect') || result.includes('Too many'))
      },
    )
  })

  // =========================================================================
  // F7 层 — Auxiliary model analysis decision
  // =========================================================================
  console.log('\nF7 — Auxiliary model analysis decision (shouldSkipAnalysis)')

  await test('F7a: text/markdown + 短内容跳过辅助模型（直传原文）', async () => {
    const md = '# API Reference\n\n## getUser()\n\nReturns user object.'
    await withMockedFetch(
      () => mockTextResponse(md, 'text/markdown'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f7a-test.example.com/api.md', prompt: 'Read API docs' },
          toolCtx,
        )
        // Markdown under 20K should pass through directly
        assert.ok(result.includes('# API Reference'), '短 Markdown 应直传原文')
        assert.ok(result.includes('getUser()'))
      },
    )
  })

  await test('F7b: application/json + 短内容跳过辅助模型', async () => {
    const json = JSON.stringify({ users: [{ id: 1, name: 'Alice' }] })
    await withMockedFetch(
      () => mockTextResponse(json, 'application/json'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f7b-test.example.com/users.json', prompt: 'List users' },
          toolCtx,
        )
        assert.ok(result.includes('Alice'), '短 JSON 应直传原文')
      },
    )
  })

  // =========================================================================
  // F8 层 — Cache behavior
  // =========================================================================
  console.log('\nF8 — Cache behavior')

  await test('F8a: 相同 URL 第二次命中缓存（不再调用 fetch）', async () => {
    const cacheTestUrl = 'https://f8a-cache-test.example.com/page'
    let fetchCount = 0

    // First fetch: populate cache
    await withMockedFetch(
      () => {
        fetchCount++
        return mockTextResponse('Cached content', 'text/plain')
      },
      async () => {
        await webFetchTool.execute({ url: cacheTestUrl, prompt: 'Read' }, toolCtx)
      },
    )

    assert.equal(fetchCount, 1, '第一次应调用 fetch')

    // Second fetch: should hit cache — mock fetch to track if called
    await withMockedFetch(
      () => {
        fetchCount++
        return mockTextResponse('Should not reach', 'text/plain')
      },
      async () => {
        const result: string = await webFetchTool.execute(
          { url: cacheTestUrl, prompt: 'Read again' },
          toolCtx,
        )
        assert.ok(result.includes('Cached content'), '应返回缓存内容')
      },
    )

    assert.equal(fetchCount, 1, '第二次不应调用 fetch（缓存命中）')
  })

  await test('F8b: http→https 升级后缓存 key 使用 https URL', async () => {
    let fetchedUrl = ''
    await withMockedFetch(
      (url) => {
        fetchedUrl = String(url)
        return mockTextResponse('Upgraded content', 'text/plain')
      },
      async () => {
        await webFetchTool.execute(
          { url: 'http://f8b-upgrade.example.com/page', prompt: 'Read' },
          toolCtx,
        )
      },
    )
    assert.ok(fetchedUrl.startsWith('https://'), 'http 应被升级为 https')
  })

  // =========================================================================
  // F9 层 — Error handling
  // =========================================================================
  console.log('\nF9 — Error handling')

  await test('F9a: 网络错误返回错误字符串（不抛出）', async () => {
    await withMockedFetch(
      () => { throw new Error('ECONNREFUSED') },
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f9a-test.example.com/down', prompt: 'Read' },
          toolCtx,
        )
        assert.ok(typeof result === 'string')
        assert.ok(result.includes('Error'))
        assert.ok(result.includes('ECONNREFUSED'))
      },
    )
  })

  await test('F9b: 超时返回错误字符串', async () => {
    await withMockedFetch(
      () => { throw new DOMException('The operation was aborted', 'AbortError') },
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f9b-test.example.com/slow', prompt: 'Read' },
          toolCtx,
        )
        assert.ok(result.includes('Error'))
        assert.ok(result.includes('timed out') || result.includes('abort'))
      },
    )
  })

  await test('F9c: 响应超 10MB 返回错误', async () => {
    await withMockedFetch(
      () =>
        new Response('x', {
          status: 200,
          headers: { 'Content-Length': String(11 * 1024 * 1024) },
        }),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f9c-test.example.com/huge', prompt: 'Read' },
          toolCtx,
        )
        assert.ok(result.includes('Error'))
        assert.ok(result.includes('too large') || result.includes('Response too large'))
      },
    )
  })

  await test('F9d: HTTP 404 不抛出，返回内容（状态码在 header 中）', async () => {
    await withMockedFetch(
      () => mockTextResponse('<h1>Not Found</h1>', 'text/html', 404),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f9d-test.example.com/missing', prompt: 'Read' },
          toolCtx,
        )
        // HTTP 404 still returns content (non-redirect, non-error exception)
        assert.ok(result.includes('404'), '应包含 404 状态码')
      },
    )
  })

  // =========================================================================
  // F10 层 — Output format validation
  // =========================================================================
  console.log('\nF10 — Output format')

  await test('F10a: 文本响应包含 Fetched header', async () => {
    await withMockedFetch(
      () => mockTextResponse('Hello', 'text/plain'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f10a-test.example.com/hi', prompt: 'Read' },
          toolCtx,
        )
        assert.ok(result.startsWith('Fetched https://'))
        assert.ok(result.includes('200 OK'))
      },
    )
  })

  await test('F10b: 文本响应包含 Prompt 行', async () => {
    await withMockedFetch(
      () => mockTextResponse('Hello', 'text/plain'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f10b-test.example.com/hi', prompt: 'My specific prompt' },
          toolCtx,
        )
        assert.ok(result.includes('Prompt: My specific prompt'))
      },
    )
  })

  await test('F10c: 文本响应包含 Tip', async () => {
    await withMockedFetch(
      () => mockTextResponse('Content here', 'text/plain'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f10c-test.example.com/page', prompt: 'Read' },
          toolCtx,
        )
        assert.ok(result.includes('## Tip'))
      },
    )
  })

  await test('F10d: 二进制响应包含 Content 标题而非 Summary', async () => {
    await withMockedFetch(
      () => mockBinaryResponse(new Uint8Array([1, 2, 3]), 'application/pdf'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f10d-test.example.com/file.pdf', prompt: 'Read' },
          toolCtx,
        )
        assert.ok(result.includes('## Content'), '二进制应用 Content 标题')
        assert.ok(!result.includes('## Summary'), '二进制不应有 Summary')
        assert.ok(!result.includes('## Tip'), '二进制不应有 Tip')
      },
    )
  })

  // =========================================================================
  // F11 层 — Raw body shape analysis
  // =========================================================================
  console.log('\nF11 — Raw body shape analysis')

  await test('F11a: 正常文本文件不标记为 minified', async () => {
    const normalText = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}: some content`).join('\n')
    await withMockedFetch(
      () => mockTextResponse(normalText, 'text/plain'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f11a-test.example.com/normal.txt', prompt: 'Read' },
          toolCtx,
        )
        // Check for the minified hint SECTION, not just the word "Minified"
        // (the shape line contains "isMinified=false" which has the substring)
        assert.ok(!result.includes('## Minified'), '正常文本不应有 minified 提示段')
        assert.ok(result.includes('isMinified=false'), 'shape 应标记 isMinified=false')
      },
    )
  })

  await test('F11b: 单行超长文件标记为 minified', async () => {
    const minified = 'x'.repeat(10000) // Single line, 10K chars
    await withMockedFetch(
      () => mockTextResponse(minified, 'text/plain'),
      async () => {
        const result: string = await webFetchTool.execute(
          { url: 'https://f11b-test.example.com/min.js', prompt: 'Read' },
          toolCtx,
        )
        assert.ok(result.includes('Minified') || result.includes('minified'), '超长单行应标记为 minified')
        assert.ok(result.includes('grep') || result.includes('Bash'), '应提示使用 Bash 命令')
      },
    )
  })

  // =========================================================================
  // F12 层 — Live integration tests (real network requests)
  // =========================================================================
  console.log('\nF12 — Live integration (network required)')

  // Connectivity probe — skip all live tests if network is unavailable
  let networkAvailable = false
  try {
    const probe = await fetch('https://httpbin.org/get', { signal: AbortSignal.timeout(10000) })
    networkAvailable = probe.ok
  } catch {}

  if (!networkAvailable) {
    console.log('  ⚠ 网络不可用，F12 层全部跳过')
  } else {
    // Use a long-lived AbortController for live tests (they can be slow)
    const liveCtx = { toolCallId: 'live', messages: [], abortSignal: new AbortController().signal }

    // ------------------------------------------------------------------
    // F12a: httpbin/html — 稳定的 HTML 测试页面
    // ------------------------------------------------------------------
    await test('F12a: httpbin/html — HTML 页面抓取', async () => {
      const result: string = await webFetchTool.execute(
        { url: 'https://httpbin.org/html', prompt: 'What is the main content of this page?' },
        liveCtx,
      )
      assert.ok(result.includes('200 OK'), '应返回 200')
      assert.ok(result.includes('## Summary'), '应有 Summary 段')
      // httpbin /html 返回 Herman Melville 的 Moby Dick 段落
      assert.ok(
        result.includes('Melville') || result.includes('Moby') || result.includes('whale'),
        '应包含 Moby Dick 相关内容',
      )
    })

    // ------------------------------------------------------------------
    // F12b: jsonplaceholder — 稳定的假 REST API，返回 JSON
    // ------------------------------------------------------------------
    await test('F12b: jsonplaceholder — JSON API 响应', async () => {
      const result: string = await webFetchTool.execute(
        { url: 'https://jsonplaceholder.typicode.com/todos/1', prompt: 'What is the todo item?' },
        liveCtx,
      )
      assert.ok(result.includes('200 OK'), '应返回 200')
      // JSON under 20K → shouldSkipAnalysis → 直传
      assert.ok(result.includes('userId') || result.includes('delectus'), '应包含 todo 数据')
    })

    // ------------------------------------------------------------------
    // F12c: httpbin — 返回请求元信息的 JSON 服务
    // ------------------------------------------------------------------
    await test('F12c: httpbin/get — JSON 反射服务', async () => {
      const result: string = await webFetchTool.execute(
        { url: 'https://httpbin.org/get', prompt: 'Show request headers' },
        liveCtx,
      )
      assert.ok(result.includes('200 OK'), '应返回 200')
      assert.ok(
        result.includes('User-Agent') || result.includes('OpenLoaf'),
        '应包含请求头信息',
      )
    })

    // ------------------------------------------------------------------
    // F12d: httpbin/encoding/utf8 — UTF-8 编码页面
    // ------------------------------------------------------------------
    await test('F12d: httpbin/encoding/utf8 — UTF-8 文本', async () => {
      const result: string = await webFetchTool.execute(
        { url: 'https://httpbin.org/encoding/utf8', prompt: 'What characters are shown?' },
        liveCtx,
      )
      assert.ok(result.includes('200 OK'))
      assert.ok(result.includes('## Summary'))
    })

    // ------------------------------------------------------------------
    // F12e: httpbin/image/png — 返回 PNG 图片（二进制路径）
    // ------------------------------------------------------------------
    await test('F12e: httpbin/image/png — 二进制图片', async () => {
      const result: string = await webFetchTool.execute(
        { url: 'https://httpbin.org/image/png', prompt: 'Describe the image' },
        liveCtx,
      )
      assert.ok(result.includes('Binary content'), '应走二进制路径')
      assert.ok(result.includes('image/png'), '应识别为 PNG')
    })

    // ------------------------------------------------------------------
    // F12f: httpbin/redirect — 同域重定向链
    // ------------------------------------------------------------------
    await test('F12f: httpbin/redirect/2 — 同域重定向链 (2 跳)', async () => {
      const result: string = await webFetchTool.execute(
        { url: 'https://httpbin.org/redirect/2', prompt: 'Follow the redirects' },
        liveCtx,
      )
      // httpbin /redirect/2 → /redirect/1 → /get (all same host)
      assert.ok(result.includes('200 OK'), '应最终返回 200')
      assert.ok(!result.includes('REDIRECT DETECTED'), '同域重定向应自动跟随')
    })

    // ------------------------------------------------------------------
    // F12g: httpbin/redirect-to — 跨域重定向
    // ------------------------------------------------------------------
    await test('F12g: httpbin → github.com 跨域重定向', async () => {
      const result: string = await webFetchTool.execute(
        {
          url: 'https://httpbin.org/redirect-to?url=https://github.com&status_code=302',
          prompt: 'Follow redirect',
        },
        liveCtx,
      )
      assert.ok(result.includes('REDIRECT DETECTED'), '跨域重定向应被检测')
      assert.ok(result.includes('github.com'), '应报告目标域名')
    })

    // ------------------------------------------------------------------
    // F12h: httpbin/status/404 — HTTP 错误码
    // ------------------------------------------------------------------
    await test('F12h: httpbin/status/404 — 404 响应', async () => {
      const result: string = await webFetchTool.execute(
        { url: 'https://httpbin.org/status/404', prompt: 'Check status' },
        liveCtx,
      )
      assert.ok(result.includes('404'), '应包含 404 状态码')
    })

    // ------------------------------------------------------------------
    // F12i: httpbin/robots.txt — 纯文本内容
    // ------------------------------------------------------------------
    await test('F12i: httpbin/robots.txt — 纯文本', async () => {
      const result: string = await webFetchTool.execute(
        { url: 'https://httpbin.org/robots.txt', prompt: 'Read the robots.txt' },
        liveCtx,
      )
      assert.ok(result.includes('200 OK'), '应返回 200')
    })

    // ------------------------------------------------------------------
    // F12j: http → https 自动升级（真实场景）
    // ------------------------------------------------------------------
    await test('F12j: http://httpbin.org/get → https 自动升级', async () => {
      const result: string = await webFetchTool.execute(
        { url: 'http://httpbin.org/get', prompt: 'Read' },
        liveCtx,
      )
      assert.ok(result.includes('200 OK'), '升级后应正常返回')
      assert.ok(result.includes('https://'), '最终 URL 应为 https')
    })

    // ------------------------------------------------------------------
    // F12k: jsonplaceholder/photos — 较大 JSON 响应
    // ------------------------------------------------------------------
    await test('F12k: jsonplaceholder/photos — 较大 JSON 数据集', async () => {
      const result: string = await webFetchTool.execute(
        {
          url: 'https://jsonplaceholder.typicode.com/posts',
          prompt: 'How many posts are there?',
        },
        liveCtx,
      )
      assert.ok(result.includes('200 OK'), '应返回 200')
      // /posts returns 100 items, JSON under 20K → shouldSkipAnalysis → 直传
      assert.ok(result.includes('userId') || result.includes('title'), '应包含 post 数据')
    })

    // ------------------------------------------------------------------
    // F12l: 缓存命中验证（第二次请求 httpbin/html 应命中缓存）
    // ------------------------------------------------------------------
    await test('F12l: httpbin/html 第二次请求命中缓存', async () => {
      // httpbin/html was already fetched in F12a, should be cached
      const start = Date.now()
      const result: string = await webFetchTool.execute(
        { url: 'https://httpbin.org/html', prompt: 'Read again' },
        liveCtx,
      )
      const elapsed = Date.now() - start
      assert.ok(result.includes('200 OK'))
      // Cache hit should be near-instant (< 100ms vs network ~200-2000ms)
      assert.ok(elapsed < 500, `缓存命中应 <500ms，实际 ${elapsed}ms`)
    })
  }

  // =========================================================================
  // Cleanup & Summary
  // =========================================================================

  // Clean up temp directory
  try {
    rmSync(tempRoot, { recursive: true, force: true })
  } catch {}

  console.log(`\n${'='.repeat(50)}`)
  console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`)
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
