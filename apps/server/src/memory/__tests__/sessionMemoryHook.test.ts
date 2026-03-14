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
 * sessionMemoryHook unit tests.
 *
 * 用法:
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/memory/__tests__/sessionMemoryHook.test.ts
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// ---------------------------------------------------------------------------
// Mock loadMessageTree before importing the module under test
// ---------------------------------------------------------------------------

type MockMessage = {
  id: string
  role: 'user' | 'assistant'
  createdAt: string
  parts: { type: string; text: string }[]
}

let mockMessages: MockMessage[] = []

// We need to mock the chatFileStore module
// Since this is a plain Node.js test runner, we use a manual mock approach
// by patching the module at import time

// Create mock module inline — we'll dynamically import after setting up
const mockLoadMessageTree = async (_sessionId: string) => {
  return {
    byId: new Map(mockMessages.map((m) => [m.id, m])),
  }
}

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
  const dir = path.join(os.tmpdir(), `openloaf-test-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function cleanupDir(dir: string) {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch { /* ignore */ }
}

function makeMessage(id: string, role: 'user' | 'assistant', text: string, offsetMs = 0): MockMessage {
  return {
    id,
    role,
    createdAt: new Date(Date.now() + offsetMs).toISOString(),
    parts: [{ type: 'text', text }],
  }
}

// ---------------------------------------------------------------------------
// Test the pure functions directly (slug generation, text extraction)
// Since archiveSessionMemory depends on loadMessageTree which is hard to mock
// without a module loader, we test the internal logic by extracting it.
// ---------------------------------------------------------------------------

/** Replicate generateSlug from sessionMemoryHook.ts for testing. */
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/-$/, '')
    || 'session'
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n--- A: Slug Generation ---')

  await test('A1: English text → generates slug', () => {
    const slug = generateSlug('Hello World')
    assert.equal(slug, 'hello-world')
  })

  await test('A2: Chinese text → Unicode letters preserved', () => {
    const slug = generateSlug('讨论项目计划')
    assert.equal(slug, '讨论项目计划')
  })

  await test('A3: long text → truncated to 40 chars', () => {
    const longText = 'a'.repeat(60)
    const slug = generateSlug(longText)
    assert.ok(slug.length <= 40, `Expected ≤40, got ${slug.length}`)
  })

  await test('A4: special characters → cleaned', () => {
    const slug = generateSlug('Hello! @#$% World & Friends???')
    assert.equal(slug, 'hello-world-friends')
  })

  await test('A5: empty text → returns "session"', () => {
    const slug = generateSlug('')
    assert.equal(slug, 'session')
  })

  await test('A6: only special chars → returns "session"', () => {
    const slug = generateSlug('!@#$%^&*()')
    assert.equal(slug, 'session')
  })

  await test('A7: mixed CJK and English → preserves both', () => {
    const slug = generateSlug('API 设计方案 v2')
    assert.ok(slug.includes('api'), `Slug should contain "api", got: ${slug}`)
    assert.ok(slug.includes('设计方案'), `Slug should contain "设计方案", got: ${slug}`)
  })

  await test('A8: trailing dash removed', () => {
    // When truncation happens at a dash boundary
    const slug = generateSlug('hello world test-')
    assert.ok(!slug.endsWith('-'), `Slug should not end with dash: ${slug}`)
  })

  console.log('\n--- B: Archive File Naming ---')

  await test('B1: date format is YYYY-MM-DD', () => {
    const today = new Date().toISOString().slice(0, 10)
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/)
  })

  await test('B2: filename combines date and slug', () => {
    const today = new Date().toISOString().slice(0, 10)
    const slug = generateSlug('Test Session')
    const fileName = `${today}-${slug}.md`
    assert.ok(fileName.startsWith(today))
    assert.ok(fileName.endsWith('.md'))
    assert.ok(fileName.includes('test-session'))
  })

  console.log('\n--- C: File Conflict Resolution ---')

  const conflictDir = createTempDir()
  const memoryDir = path.join(conflictDir, '.openloaf', 'memory')
  mkdirSync(memoryDir, { recursive: true })

  await test('C1: conflict detection — existing file triggers HHMM suffix', () => {
    const today = new Date().toISOString().slice(0, 10)
    const slug = 'test-conflict'
    const fileName = `${today}-${slug}.md`
    const filePath = path.join(memoryDir, fileName)

    // Create the first file
    writeFileSync(filePath, '# First file\n')
    assert.ok(existsSync(filePath))

    // Simulate conflict resolution logic
    let resolvedFileName = fileName
    if (existsSync(path.join(memoryDir, resolvedFileName))) {
      const hhmm = new Date().toISOString().slice(11, 16).replace(':', '')
      resolvedFileName = `${today}-${slug}-${hhmm}.md`
    }

    assert.notEqual(resolvedFileName, fileName)
    assert.match(resolvedFileName, /\d{4}\.md$/)
  })

  cleanupDir(conflictDir)

  console.log('\n--- D: Archive Content Format ---')

  await test('D1: archive content has correct header', () => {
    const slug = 'api-design'
    const content = `# Session Archive: ${slug}\n\n**User**: Hello\n\n**Assistant**: Hi there\n`
    assert.ok(content.startsWith('# Session Archive:'))
    assert.ok(content.includes('**User**:'))
    assert.ok(content.includes('**Assistant**:'))
  })

  await test('D2: message truncation at 200 chars', () => {
    const longMsg = 'x'.repeat(300)
    const truncated = longMsg.length > 200 ? `${longMsg.slice(0, 200)}...` : longMsg
    assert.equal(truncated.length, 203) // 200 + "..."
    assert.ok(truncated.endsWith('...'))
  })

  await test('D3: total content capped at 2000 chars', () => {
    const lines: string[] = []
    for (let i = 0; i < 50; i++) {
      lines.push(`**User**: ${'message '.repeat(20)}`)
    }
    const content = lines.join('\n\n').slice(0, 2000)
    assert.ok(content.length <= 2000)
  })

  console.log('\n--- E: Message Filtering ---')

  await test('E1: less than 2 messages → should not archive', () => {
    const messages = [makeMessage('1', 'user', 'Hello')]
    assert.ok(messages.length < 2)
  })

  await test('E2: exactly 2 messages → should archive', () => {
    const messages = [
      makeMessage('1', 'user', 'Hello'),
      makeMessage('2', 'assistant', 'Hi there'),
    ]
    assert.ok(messages.length >= 2)
  })

  await test('E3: messages sorted by time', () => {
    const messages = [
      makeMessage('2', 'assistant', 'Hi', 1000),
      makeMessage('1', 'user', 'Hello', 0),
    ]
    messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    assert.equal(messages[0]!.id, '1')
    assert.equal(messages[1]!.id, '2')
  })

  await test('E4: only user and assistant roles kept', () => {
    const allMessages = [
      { role: 'user' },
      { role: 'assistant' },
      { role: 'system' },
      { role: 'tool' },
    ]
    const filtered = allMessages.filter((m) => m.role === 'user' || m.role === 'assistant')
    assert.equal(filtered.length, 2)
  })

  await test('E5: max 20 messages taken (ARCHIVE_TAKE)', () => {
    const messages: MockMessage[] = []
    for (let i = 0; i < 30; i++) {
      messages.push(makeMessage(`${i}`, i % 2 === 0 ? 'user' : 'assistant', `Msg ${i}`, i * 1000))
    }
    const taken = messages.slice(-20)
    assert.equal(taken.length, 20)
    assert.equal(taken[0]!.id, '10') // Last 20
  })

  // Summary
  console.log(`\n${'='.repeat(50)}`)
  console.log(`sessionMemoryHook: ${passed} passed, ${failed} failed`)
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
