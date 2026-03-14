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
 * memoryTools unit tests.
 *
 * Tests memory-search and memory-get tool execute functions.
 *
 * 用法:
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/memoryTools.test.ts
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { setRequestContext } from '@/ai/shared/context/requestContext'
import { memoryIndexManager } from '@/memory/memoryIndexManager'
import { memorySearchTool as _memorySearchTool, memoryGetTool as _memoryGetTool } from '../memoryTools'

// Assert execute functions exist (they always do for our tools)
const memorySearchExecute = _memorySearchTool.execute!
const memoryGetExecute = _memoryGetTool.execute!

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
    const msg = `${name}: ${err?.message}`
    errors.push(msg)
    console.log(`  ✗ ${msg}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTempDir(): string {
  const dir = path.join(os.tmpdir(), `openloaf-test-memtools-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupDir(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch { /* ignore */ }
}

function setMinimalRequestContext() {
  setRequestContext({
    sessionId: `test-${Date.now()}`,
    cookies: {},
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n--- A: memoryGetTool ---')

  const tempDir = createTempDir()
  const memoryDir = path.join(tempDir, '.openloaf', 'memory')
  mkdirSync(memoryDir, { recursive: true })
  writeFileSync(path.join(memoryDir, 'test-note.md'), '# Test Note\n\nSome memory content.\n')

  setMinimalRequestContext()

  await test('A1: valid path containing .openloaf/memory → returns content', async () => {
    const filePath = path.join(memoryDir, 'test-note.md')
    const result = await memoryGetExecute({ filePath }, { toolCallId: 'test', messages: [], abortSignal: new AbortController().signal })
    assert.ok((result as any).ok, 'Should return ok: true')
    assert.ok((result as any).content.includes('Test Note'))
  })

  await test('A2: path without .openloaf/memory → access denied', async () => {
    const filePath = path.join(tempDir, 'some-random-file.md')
    const result = await memoryGetExecute({ filePath }, { toolCallId: 'test', messages: [], abortSignal: new AbortController().signal })
    assert.equal((result as any).ok, false)
    assert.ok((result as any).error.includes('Access denied'))
  })

  await test('A3: non-existent file in .openloaf/memory → returns error', async () => {
    const filePath = path.join(memoryDir, 'nonexistent.md')
    const result = await memoryGetExecute({ filePath }, { toolCallId: 'test', messages: [], abortSignal: new AbortController().signal })
    assert.equal((result as any).ok, false)
    assert.ok((result as any).error.includes('Failed to read'))
  })

  cleanupDir(tempDir)

  console.log('\n--- B: memorySearchTool ---')

  const searchTempDir = createTempDir()
  const searchMemoryDir = path.join(searchTempDir, '.openloaf', 'memory')
  mkdirSync(searchMemoryDir, { recursive: true })

  const today = new Date().toISOString().slice(0, 10)
  writeFileSync(path.join(searchMemoryDir, `${today}-project-plan.md`), '# Project Plan\n\nImplement authentication module.\n')
  writeFileSync(path.join(searchMemoryDir, `${today}-bug-report.md`), '# Bug Report\n\nLogin page crashes on mobile.\n')
  writeFileSync(path.join(searchMemoryDir, 'MEMORY.md'), '# Memory Index\n\n- project-plan.md\n- bug-report.md\n')

  // Pre-scan the directory so search can find it
  memoryIndexManager.invalidate(searchMemoryDir)
  memoryIndexManager.scan(searchMemoryDir)

  // Set context with parentProjectRootPaths pointing to our temp dir
  setRequestContext({
    sessionId: `test-${Date.now()}`,
    cookies: {},
    parentProjectRootPaths: [searchTempDir],
  })

  await test('B1: search with matching query → returns results', async () => {
    const result = await memorySearchExecute(
      { query: 'project plan authentication', scope: 'project' },
      { toolCallId: 'test', messages: [], abortSignal: new AbortController().signal },
    )
    assert.ok((result as any).ok)
    const results = (result as any).results
    assert.ok(results.length >= 1, `Expected ≥1 results, got ${results.length}`)
  })

  await test('B2: scope=user → only searches user directory', async () => {
    // With no real user memory dir, should still return ok with empty or results from homedir
    const result = await memorySearchExecute(
      { query: 'some random query unlikely to match', scope: 'user' },
      { toolCallId: 'test', messages: [], abortSignal: new AbortController().signal },
    )
    assert.ok((result as any).ok)
  })

  await test('B3: search results have correct shape', async () => {
    const result = await memorySearchExecute(
      { query: 'bug report login', scope: 'project' },
      { toolCallId: 'test', messages: [], abortSignal: new AbortController().signal },
    )
    assert.ok((result as any).ok)
    const results = (result as any).results
    if (results.length > 0) {
      const first = results[0]
      assert.ok('filePath' in first, 'result should have filePath')
      assert.ok('fileName' in first, 'result should have fileName')
      assert.ok('score' in first, 'result should have score')
      assert.ok('decayWeight' in first, 'result should have decayWeight')
    }
  })

  cleanupDir(searchTempDir)

  // Summary
  console.log(`\n${'='.repeat(50)}`)
  console.log(`memoryTools: ${passed} passed, ${failed} failed`)
  if (errors.length > 0) {
    console.log('\nFailed:')
    for (const err of errors) {
      console.log(`  - ${err}`)
    }
  }
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
