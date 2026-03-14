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
 * MemoryIndexManager unit tests.
 *
 * 用法:
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm \
 *     src/memory/__tests__/memoryIndexManager.test.ts
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { calculateDecayWeight, memoryIndexManager } from '../memoryIndexManager'

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
  const dir = path.join(os.tmpdir(), `openloaf-test-memidx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupDir(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n--- A: calculateDecayWeight() ---')

  await test('A1: null date → returns 1.0 (evergreen)', () => {
    assert.equal(calculateDecayWeight(null), 1.0)
  })

  await test('A2: today → returns ≈1.0', () => {
    const today = new Date().toISOString().slice(0, 10)
    const weight = calculateDecayWeight(today)
    assert.ok(weight > 0.95, `Expected >0.95, got ${weight}`)
  })

  await test('A3: 30 days ago → returns ≈0.5 (half-life)', () => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const dateStr = thirtyDaysAgo.toISOString().slice(0, 10)
    const weight = calculateDecayWeight(dateStr, now)
    assert.ok(weight > 0.45 && weight < 0.55, `Expected ≈0.5, got ${weight}`)
  })

  await test('A4: 60 days ago → returns ≈0.25', () => {
    const now = new Date()
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)
    const dateStr = sixtyDaysAgo.toISOString().slice(0, 10)
    const weight = calculateDecayWeight(dateStr, now)
    assert.ok(weight > 0.20 && weight < 0.30, `Expected ≈0.25, got ${weight}`)
  })

  await test('A5: invalid date string → returns 1.0', () => {
    assert.equal(calculateDecayWeight('not-a-date'), 1.0)
  })

  await test('A6: future date → returns 1.0', () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    const dateStr = futureDate.toISOString().slice(0, 10)
    const weight = calculateDecayWeight(dateStr)
    assert.equal(weight, 1.0)
  })

  console.log('\n--- B: scan() ---')

  const tempDir = createTempDir()

  await test('B1: scan directory with .md files → correct entry count', () => {
    writeFileSync(path.join(tempDir, 'MEMORY.md'), '# Memory Index\n\n- notes.md\n')
    writeFileSync(path.join(tempDir, '2026-01-15-meeting-notes.md'), '# Meeting Notes\n\nDiscussed project roadmap.\n')
    writeFileSync(path.join(tempDir, '2026-02-20-bug-fix.md'), '# Bug Fix\n\nFixed critical bug.\n')
    writeFileSync(path.join(tempDir, 'readme.txt'), 'Not a markdown file')

    memoryIndexManager.invalidate(tempDir)
    const index = memoryIndexManager.scan(tempDir)
    assert.equal(index.size, 3) // 3 .md files, .txt excluded
  })

  await test('B2: MEMORY.md → date is null, decayWeight is 1.0', () => {
    const index = memoryIndexManager.scan(tempDir)
    const memoryEntry = index.get(path.join(tempDir, 'MEMORY.md'))
    assert.ok(memoryEntry, 'MEMORY.md entry should exist')
    assert.equal(memoryEntry.date, null)
    assert.equal(memoryEntry.decayWeight, 1.0)
  })

  await test('B3: dated file → date parsed correctly', () => {
    const index = memoryIndexManager.scan(tempDir)
    const entry = index.get(path.join(tempDir, '2026-01-15-meeting-notes.md'))
    assert.ok(entry, 'dated file entry should exist')
    assert.equal(entry.date, '2026-01-15')
    assert.equal(entry.fileName, '2026-01-15-meeting-notes.md')
  })

  await test('B4: non-.md files are ignored', () => {
    const index = memoryIndexManager.scan(tempDir)
    const txtEntry = index.get(path.join(tempDir, 'readme.txt'))
    assert.equal(txtEntry, undefined)
  })

  await test('B5: non-existent directory → returns empty index, no error', () => {
    const nonExistent = path.join(os.tmpdir(), `openloaf-nonexist-${Date.now()}`)
    memoryIndexManager.invalidate(nonExistent)
    const index = memoryIndexManager.scan(nonExistent)
    assert.equal(index.size, 0)
  })

  await test('B6: repeated scan within 5 min → returns cached index (same reference)', () => {
    memoryIndexManager.invalidate(tempDir)
    const first = memoryIndexManager.scan(tempDir)
    const second = memoryIndexManager.scan(tempDir) // should hit cache
    assert.equal(first, second) // Same Map reference
  })

  await test('B7: forced scan → rebuilds index', () => {
    const first = memoryIndexManager.scan(tempDir)
    const forced = memoryIndexManager.scan(tempDir, true)
    assert.notEqual(first, forced) // Different Map reference
  })

  await test('B8: keywords extracted from content', () => {
    const index = memoryIndexManager.scan(tempDir, true)
    const entry = index.get(path.join(tempDir, '2026-02-20-bug-fix.md'))
    assert.ok(entry, 'bug-fix entry should exist')
    assert.ok(entry.keywords.includes('bug'), `keywords should include "bug", got: ${entry.keywords}`)
    assert.ok(entry.keywords.includes('fix'), `keywords should include "fix", got: ${entry.keywords}`)
  })

  await test('B9: firstLine extracted correctly', () => {
    const index = memoryIndexManager.scan(tempDir, true)
    const entry = index.get(path.join(tempDir, '2026-02-20-bug-fix.md'))
    assert.ok(entry)
    assert.ok(entry.firstLine.includes('Bug Fix'), `firstLine should contain "Bug Fix", got: "${entry.firstLine}"`)
  })

  cleanupDir(tempDir)

  console.log('\n--- C: search() ---')

  const searchDir1 = createTempDir()
  const searchDir2 = createTempDir()

  // Setup search test files
  const now = new Date()
  const recentDate = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const oldDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  writeFileSync(path.join(searchDir1, `${recentDate}-api-design.md`), '# API Design\n\nREST API endpoint structure for user management.\n')
  writeFileSync(path.join(searchDir1, `${oldDate}-old-api-notes.md`), '# Old API Notes\n\nLegacy API documentation for reference.\n')
  writeFileSync(path.join(searchDir2, `${recentDate}-database-schema.md`), '# Database Schema\n\nUser table design and migrations.\n')

  await test('C1: basic keyword match → returns matching results', () => {
    memoryIndexManager.invalidate(searchDir1)
    const results = memoryIndexManager.search([searchDir1], 'api')
    assert.ok(results.length >= 1, `Expected at least 1 result, got ${results.length}`)
    assert.ok(results[0]!.entry.keywords.some((k: string) => k.includes('api')))
  })

  await test('C2: multi-directory search → merged results', () => {
    memoryIndexManager.invalidate(searchDir1)
    memoryIndexManager.invalidate(searchDir2)
    const results = memoryIndexManager.search([searchDir1, searchDir2], 'design')
    assert.ok(results.length >= 2, `Expected ≥2 results from 2 dirs, got ${results.length}`)
  })

  await test('C3: empty query → returns empty array', () => {
    const results = memoryIndexManager.search([searchDir1], '')
    assert.equal(results.length, 0)
  })

  await test('C4: topK limits results', () => {
    const results = memoryIndexManager.search([searchDir1, searchDir2], 'design', 1)
    assert.ok(results.length <= 1, `Expected ≤1 results with topK=1, got ${results.length}`)
  })

  await test('C5: decay weight affects ranking → newer files rank higher', () => {
    memoryIndexManager.invalidate(searchDir1)
    const results = memoryIndexManager.search([searchDir1], 'api')
    if (results.length >= 2) {
      // Recent file should score higher than old file (both match "api")
      const recentResult = results.find((r) => r.entry.fileName.includes(recentDate))
      const oldResult = results.find((r) => r.entry.fileName.includes(oldDate))
      if (recentResult != null && oldResult != null) {
        assert.ok(recentResult.score >= oldResult.score,
          `Recent (${recentResult.score}) should score ≥ old (${oldResult.score})`)
      }
    }
  })

  await test('C6: no match → returns empty array', () => {
    const results = memoryIndexManager.search([searchDir1], 'zzzzzznonexistent')
    assert.equal(results.length, 0)
  })

  cleanupDir(searchDir1)
  cleanupDir(searchDir2)

  // Summary
  console.log(`\n${'='.repeat(50)}`)
  console.log(`memoryIndexManager: ${passed} passed, ${failed} failed`)
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
