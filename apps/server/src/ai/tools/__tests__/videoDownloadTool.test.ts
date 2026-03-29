// @ts-nocheck — AI SDK tool().execute 的泛型在直接调用时有类型推断问题，运行时正确性由测试覆盖。
/**
 * Video Download 工具层测试
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/videoDownloadTool.test.ts
 *
 * 测试覆盖：
 *   P 层 — 当前会话聊天资产下载
 *   Q 层 — 当前画布资产下载
 */
import assert from 'node:assert/strict'
import http from 'node:http'
import { promises as fs } from 'node:fs'
import { once } from 'node:events'
import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
import { videoDownloadTool } from '@/ai/tools/videoDownloadTool'

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function withCtx<T>(
  ctx: {
    sessionId: string
    boardId?: string
    projectId?: string
  },
  fn: () => T | Promise<T>,
): Promise<T> {
  return runWithContext(
    {
      sessionId: ctx.sessionId,
      boardId: ctx.boardId,
      projectId: ctx.projectId,
      cookies: {},
    },
    fn as () => Promise<T>,
  )
}

/** Start a tiny local HTTP server that exposes a direct MP4 download URL. */
async function createVideoServer(payload: Buffer): Promise<{
  close: () => Promise<void>
  url: string
}> {
  const server = http.createServer((req, res) => {
    if (!req.url?.startsWith('/sample.mp4')) {
      res.statusCode = 404
      res.end('not found')
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Length', String(payload.length))
    res.setHeader('Accept-Ranges', 'bytes')
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    res.end(payload)
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve test server address.')
  }

  return {
    url: `http://127.0.0.1:${address.port}/sample.mp4`,
    close: async () => {
      server.close()
      await once(server, 'close')
    },
  }
}

const toolCtx = { toolCallId: 'test', messages: [] }

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  setupE2eTestEnv()

  const payload = Buffer.from('openloaf-video-download-test-payload')
  const server = await createVideoServer(payload)

  try {
    console.log('\nP 层 — 聊天资产下载')

    await test('P1: 普通聊天上下文下载到 chat-history asset', async () => {
      const result: any = await withCtx(
        { sessionId: 'video-download-test' },
        () => videoDownloadTool.execute({ url: server.url }, toolCtx),
      )

      assert.equal(result.ok, true)
      assert.equal(result.data.destination, 'chat')
      assert.match(
        result.data.filePath,
        /^\[video-download-test\]\/asset\//,
      )

      const stat = await fs.stat(result.data.absolutePath)
      assert.equal(stat.size, payload.length)
      const actual = await fs.readFile(result.data.absolutePath)
      assert.deepEqual(actual, payload)
    })

    console.log('\nQ 层 — 画布资产下载')

    await test('Q1: 画布上下文下载到 board asset', async () => {
      const result: any = await withCtx(
        { sessionId: 'video-download-board-test', boardId: 'board_test_001' },
        () => videoDownloadTool.execute({ url: server.url }, toolCtx),
      )

      assert.equal(result.ok, true)
      assert.equal(result.data.destination, 'board')
      assert.equal(result.data.boardId, 'board_test_001')
      assert.match(
        result.data.filePath,
        /^\.openloaf\/boards\/board_test_001\/asset\//,
      )

      const stat = await fs.stat(result.data.absolutePath)
      assert.equal(stat.size, payload.length)
    })
  } finally {
    await server.close()
  }

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
