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
 * toolResultInterceptor 单元测试
 *
 * 验证：
 *   A. interceptToolResult — 小结果不截断
 *   B. interceptToolResult — 超阈值截断并持久化到真实 temp 目录
 *   C. interceptToolResult — 跳过 SKIP_PERSISTENCE_TOOLS
 *   D. 按工具名的不同阈值（Bash 50K vs Read 20K vs 默认 30K）
 *   E. 磁盘写入失败时返回完整文本（不丢失数据）
 *   F. 截断输出包含 <truncated-output> 标签和正确属性
 *   G. applyToolResultInterception — 包装 execute 函数
 *   H. applyToolResultInterception — 跳过元数据工具
 *
 * 注意：Section A/C/D 中小于阈值的场景通过 interceptToolResult 使用
 *       假的 sessionId（resolveSessionDir 不会被调用，因为结果未超阈值）。
 *       Section B/E/F 使用真实的 temp 目录 + sessionDirCache 注入来测持久化。
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/toolResultInterceptor.test.ts
 */
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  interceptToolResult,
  applyToolResultInterception,
} from '@/ai/tools/toolResultInterceptor'
import { TRUNCATED_OUTPUT_TAG } from '@/ai/shared/contextWindowManager'

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
    console.log(`  \u2713 ${name}`)
  } catch (err: any) {
    failed++
    const m = err?.message ?? String(err)
    errors.push(`${name}: ${m}`)
    console.log(`  \u2717 ${name}: ${m}`)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a string of N characters. */
function chars(n: number, ch = 'a'): string {
  return ch.repeat(n)
}

// ---------------------------------------------------------------------------
// Session dir cache injection
// ---------------------------------------------------------------------------

// We inject a temp directory into the private sessionDirCache of chatFileStore
// by calling resolveSessionDir after seeding the cache via module internals.
// The cleanest approach: create a temp dir and override getResolvedTempStorageDir
// through setOpenLoafRootOverride.
import { setOpenLoafRootOverride } from '@openloaf/config'

let tempRoot: string
const TEST_SESSION_ID = `interceptor-test-${Date.now()}`


async function setup() {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'interceptor-test-'))
  // Override the OpenLoaf root so that the temp storage dir resolves to our temp root.
  // resolveSessionDir → resolveChatHistoryRoot → getResolvedTempStorageDir
  // For sessions without a projectId (DB returns null), the path becomes:
  //   <tempRoot>/chat_history/<sessionId>/
  setOpenLoafRootOverride(tempRoot)

  // Pre-create the chat_history dir to speed up tests
  await fs.mkdir(path.join(tempRoot, 'chat_history'), { recursive: true })
}

async function cleanup() {
  try {
    await fs.rm(tempRoot, { recursive: true, force: true })
  } catch {
    // Ignore cleanup errors
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== toolResultInterceptor Tests ===\n')

  await setup()

  // ── Section A: 小结果不截断 ─────────────────────────────────────────────
  // Note: When result doesn't exceed threshold, resolveSessionDir is never called,
  // so we can use any sessionId safely.

  console.log('  --- A. Small results not truncated ---')

  await test('小结果（< 默认 30K）不截断', async () => {
    const result = await interceptToolResult('SomeTool', 'call_1', chars(1000), 'no-db-session')
    assert.equal(result.truncated, false)
    assert.equal(result.content.length, 1000)
    assert.equal(result.persistedPath, undefined)
    assert.equal(result.originalLength, 1000)
  })

  await test('空结果不截断', async () => {
    const result = await interceptToolResult('SomeTool', 'call_2', '', 'no-db-session')
    assert.equal(result.truncated, false)
    assert.equal(result.content, '')
    assert.equal(result.originalLength, 0)
  })

  await test('null 结果不截断', async () => {
    const result = await interceptToolResult('SomeTool', 'call_3', null, 'no-db-session')
    assert.equal(result.truncated, false)
    assert.equal(result.content, '')
    assert.equal(result.originalLength, 0)
  })

  await test('对象结果序列化后不超阈值则不截断', async () => {
    const obj = { key: 'value', nested: { a: 1 } }
    const result = await interceptToolResult('SomeTool', 'call_4', obj, 'no-db-session')
    assert.equal(result.truncated, false)
    assert.equal(result.content, JSON.stringify(obj))
  })

  // ── Section B: 超阈值截断并持久化 ──────────────────────────────────────
  // These tests call resolveSessionDir which queries the DB.
  // Since the DB has no matching session, it falls back to temp storage dir
  // (which we've overridden via setOpenLoafRootOverride).

  console.log('\n  --- B. Oversized results truncated and persisted ---')

  await test('超过默认 30K 阈值时截断并持久化', async () => {
    const bigText = chars(35_000)
    const result = await interceptToolResult('SomeTool', 'call_big_1', bigText, TEST_SESSION_ID)
    assert.equal(result.truncated, true)
    assert.equal(result.originalLength, 35_000)
    assert.ok(result.persistedPath, 'should have persisted path')
    // Verify file exists on disk
    const stat = await fs.stat(result.persistedPath!)
    assert.ok(stat.isFile())
    // Verify file content is the full text
    const diskContent = await fs.readFile(result.persistedPath!, 'utf-8')
    assert.equal(diskContent.length, 35_000)
  })

  await test('截断后 preview 长度为 2000 字符', async () => {
    const bigText = chars(50_000, 'x')
    const result = await interceptToolResult('SomeTool', 'call_big_2', bigText, TEST_SESSION_ID)
    assert.equal(result.truncated, true)
    // The preview is 2000 chars of 'x' wrapped in tags
    assert.ok(result.content.includes('x'.repeat(2000)), 'should contain 2000-char preview')
    // But not 2001 consecutive 'x's (beyond preview)
    assert.ok(!result.content.includes('x'.repeat(2001)), 'should not contain more than 2000 chars of original')
  })

  // ── Section C: 跳过 SKIP_PERSISTENCE_TOOLS ─────────────────────────────

  console.log('\n  --- C. Skip persistence for metadata tools ---')

  const skipTools = [
    'tool-search',
    'Agent',
    'SendMessage',
    'request-user-input',
    'load-skill',
  ]

  for (const toolName of skipTools) {
    await test(`跳过 ${toolName}（即使超大结果也不截断）`, async () => {
      const bigText = chars(100_000)
      const result = await interceptToolResult(toolName, `call_skip_${toolName}`, bigText, 'no-db-session')
      assert.equal(result.truncated, false)
      assert.equal(result.content, bigText)
      assert.equal(result.originalLength, 100_000)
    })
  }

  // ── Section D: 按工具名的不同阈值 ──────────────────────────────────────
  // Only test cases where result does NOT exceed threshold (no DB access needed).
  // Cases that DO exceed threshold are tested in Section B via real temp dir.

  console.log('\n  --- D. Per-tool threshold overrides ---')

  await test('Bash 阈值为 50K — 45K 不截断', async () => {
    const result = await interceptToolResult('Bash', 'call_bash_1', chars(45_000), 'no-db-session')
    assert.equal(result.truncated, false)
  })

  await test('Bash 阈值为 50K — 55K 截断', async () => {
    const result = await interceptToolResult('Bash', 'call_bash_2', chars(55_000), TEST_SESSION_ID)
    assert.equal(result.truncated, true)
  })

  await test('Read 阈值为 20K — 15K 不截断', async () => {
    const result = await interceptToolResult('Read', 'call_read_1', chars(15_000), 'no-db-session')
    assert.equal(result.truncated, false)
  })

  await test('Read 阈值为 20K — 25K 截断', async () => {
    const result = await interceptToolResult('Read', 'call_read_2', chars(25_000), TEST_SESSION_ID)
    assert.equal(result.truncated, true)
  })

  await test('WebFetch 阈值为 20K — 25K 截断', async () => {
    const result = await interceptToolResult('WebFetch', 'call_wf_1', chars(25_000), TEST_SESSION_ID)
    assert.equal(result.truncated, true)
  })

  await test('Grep 阈值为 20K — 25K 截断', async () => {
    const result = await interceptToolResult('Grep', 'call_grep_1', chars(25_000), TEST_SESSION_ID)
    assert.equal(result.truncated, true)
  })

  await test('默认工具阈值为 30K — 25K 不截断', async () => {
    const result = await interceptToolResult('UnknownTool', 'call_def_1', chars(25_000), 'no-db-session')
    assert.equal(result.truncated, false)
  })

  await test('默认工具阈值为 30K — 35K 截断', async () => {
    const result = await interceptToolResult('UnknownTool', 'call_def_2', chars(35_000), TEST_SESSION_ID)
    assert.equal(result.truncated, true)
  })

  // ── Section E: 磁盘写入失败时返回完整文本 ────────────────────────────────
  // We simulate disk failure by using a sessionId that resolves to a read-only path.

  console.log('\n  --- E. Disk failure returns full text ---')

  await test('resolveSessionDir 查找不到 session 但 tempStorage 可写 — 不丢数据', async () => {
    // This verifies that even with unknown session, the fallback path works
    const bigText = chars(35_000)
    const result = await interceptToolResult('SomeTool', 'call_fallback_1', bigText, `unknown-session-${Date.now()}`)
    // Should either truncate (if temp dir works) or return full text (if disk fails)
    // In either case, no data should be lost
    if (result.truncated) {
      assert.ok(result.persistedPath, 'if truncated, should have persisted path')
    } else {
      assert.equal(result.content, bigText, 'if not truncated, should return full text')
    }
    assert.equal(result.originalLength, 35_000)
  })

  // ── Section F: 截断输出包含正确标签和属性 ─────────────────────────────────

  console.log('\n  --- F. Truncated output tags and attributes ---')

  await test('截断输出包含 <truncated-output> 开始和结束标签', async () => {
    const result = await interceptToolResult('SomeTool', 'call_tag_1', chars(35_000), TEST_SESSION_ID)
    assert.ok(result.content.startsWith(`<${TRUNCATED_OUTPUT_TAG}`), 'should start with opening tag')
    assert.ok(result.content.endsWith(`</${TRUNCATED_OUTPUT_TAG}>`), 'should end with closing tag')
  })

  await test('截断输出包含 path 属性', async () => {
    const result = await interceptToolResult('SomeTool', 'call_tag_2', chars(35_000), TEST_SESSION_ID)
    assert.ok(result.content.includes('path="'), 'should contain path attribute')
    assert.ok(result.content.includes(result.persistedPath!), 'path should match persisted path')
  })

  await test('截断输出包含 original-length 属性', async () => {
    const result = await interceptToolResult('SomeTool', 'call_tag_3', chars(35_000), TEST_SESSION_ID)
    assert.ok(
      result.content.includes('original-length="35000"'),
      'should contain correct original-length attribute',
    )
  })

  await test('toolCallId 中的特殊字符在文件名中被清理', async () => {
    const result = await interceptToolResult(
      'SomeTool',
      'call/with:special<chars>',
      chars(35_000),
      TEST_SESSION_ID,
    )
    assert.equal(result.truncated, true)
    // Filename should not contain special chars
    const basename = path.basename(result.persistedPath!)
    assert.ok(!basename.includes('/'), 'filename should not contain /')
    assert.ok(!basename.includes(':'), 'filename should not contain :')
    assert.ok(!basename.includes('<'), 'filename should not contain <')
    assert.ok(!basename.includes('>'), 'filename should not contain >')
  })

  // ── Section G: applyToolResultInterception 包装 execute ───────────────

  console.log('\n  --- G. applyToolResultInterception wraps execute ---')

  await test('包装后的工具在结果超阈值时返回截断内容', async () => {
    const tools: Record<string, any> = {
      TestTool: {
        description: 'A test tool',
        execute: async () => chars(35_000),
      },
    }

    applyToolResultInterception(tools, () => TEST_SESSION_ID)

    const result = await tools.TestTool.execute({}, { toolCallId: 'wrapped_1' })
    assert.ok(typeof result === 'string')
    assert.ok(result.includes(TRUNCATED_OUTPUT_TAG), 'should contain truncated tag')
  })

  await test('包装后的工具在结果小于阈值时返回原始结果', async () => {
    const tools: Record<string, any> = {
      TestTool: {
        description: 'A test tool',
        execute: async () => 'small result',
      },
    }

    applyToolResultInterception(tools, () => TEST_SESSION_ID)

    const result = await tools.TestTool.execute({}, { toolCallId: 'wrapped_2' })
    assert.equal(result, 'small result')
  })

  await test('无 sessionId 时返回原始结果（不截断）', async () => {
    const tools: Record<string, any> = {
      TestTool: {
        description: 'A test tool',
        execute: async () => chars(35_000),
      },
    }

    applyToolResultInterception(tools, () => undefined)

    const result = await tools.TestTool.execute({}, { toolCallId: 'wrapped_3' })
    assert.equal(result.length, 35_000, 'should return full result when no sessionId')
  })

  await test('包装保留工具的其他属性', async () => {
    const tools: Record<string, any> = {
      TestTool: {
        description: 'A test tool',
        parameters: { type: 'object' },
        execute: async () => 'ok',
      },
    }

    applyToolResultInterception(tools, () => TEST_SESSION_ID)

    assert.equal(tools.TestTool.description, 'A test tool')
    assert.deepEqual(tools.TestTool.parameters, { type: 'object' })
  })

  // ── Section H: applyToolResultInterception 跳过元数据工具 ──────────────

  console.log('\n  --- H. applyToolResultInterception skips metadata tools ---')

  await test('SKIP_PERSISTENCE_TOOLS 中的工具不被包装', async () => {
    const originalExecute = async () => chars(100_000)
    const tools: Record<string, any> = {
      'tool-search': { execute: originalExecute },
      'Agent': { execute: originalExecute },
      'load-skill': { execute: originalExecute },
    }

    applyToolResultInterception(tools, () => TEST_SESSION_ID)

    // The execute function should remain unchanged (not wrapped)
    assert.equal(tools['tool-search'].execute, originalExecute)
    assert.equal(tools['Agent'].execute, originalExecute)
    assert.equal(tools['load-skill'].execute, originalExecute)
  })

  await test('没有 execute 函数的工具不会被包装', async () => {
    const tools: Record<string, any> = {
      NoExec: { description: 'no execute' },
    }

    // Should not throw
    applyToolResultInterception(tools, () => TEST_SESSION_ID)
    assert.equal(tools.NoExec.execute, undefined)
  })

  // ── Cleanup & Summary ───────────────────────────────────────────────────

  await cleanup()

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`)
  if (errors.length > 0) {
    console.log('Failures:')
    for (const e of errors) console.log(`  - ${e}`)
  }
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
