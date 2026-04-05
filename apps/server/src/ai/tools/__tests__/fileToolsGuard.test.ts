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
 * Read-before-Write 守卫行为测试
 *
 * 覆盖：
 *   A. 盲写拒绝（未 Read 直接 Write/Edit 已存在文件）
 *   B. 正常流程（Read → Write/Edit 成功）
 *   C. Read→Edit→Edit（连续编辑 mtime 自更新）
 *   D. 部分 Read → Write 拒绝 / Edit 放行
 *   E. Read 后文件被外部修改 → Edit 拒绝（mtime 漂移）
 *   F. Write 创建新文件（ENOENT）免守卫
 *   G. PLAN_N.md 文件完全绕过守卫
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/fileToolsGuard.test.ts
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs, mkdirSync } from 'node:fs'
import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
import { readTool, editTool, writeTool } from '@/ai/tools/fileTools'
import { __resetForTests } from '@/ai/tools/fileReadState'
import { setProjectRegistryEntries } from '@openloaf/api/services/projectRegistryConfig'

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

const TEST_PROJECT_ID = 'proj_guard_test_00000001'
const SESSION_ID = 'guard-tool-test'

let testDir: string

function withCtx<T>(fn: () => T | Promise<T>): Promise<T> {
  return runWithContext(
    { sessionId: SESSION_ID, cookies: {}, projectId: TEST_PROJECT_ID },
    fn as () => Promise<T>,
  )
}

async function callRead(input: Record<string, unknown>): Promise<string> {
  const exec = readTool.execute as (input: any, options: any) => Promise<string>
  return withCtx(async () => exec(input, {}))
}
async function callEdit(input: Record<string, unknown>): Promise<string> {
  const exec = editTool.execute as (input: any, options: any) => Promise<string>
  return withCtx(async () => exec(input, {}))
}
async function callWrite(input: Record<string, unknown>): Promise<string> {
  const exec = writeTool.execute as (input: any, options: any) => Promise<string>
  return withCtx(async () => exec(input, {}))
}

async function expectReject(
  fn: () => Promise<unknown>,
  needle: string | RegExp,
): Promise<void> {
  let caught: any
  try {
    await fn()
  } catch (err) {
    caught = err
  }
  assert.ok(caught, `expected rejection matching ${needle}`)
  const m = caught?.message ?? String(caught)
  if (typeof needle === 'string') {
    assert.ok(m.includes(needle), `expected message to include "${needle}", got: ${m}`)
  } else {
    assert.ok(needle.test(m), `expected message to match ${needle}, got: ${m}`)
  }
}

async function seedFile(rel: string, content: string): Promise<string> {
  const p = path.join(testDir, rel)
  await fs.mkdir(path.dirname(p), { recursive: true })
  await fs.writeFile(p, content, 'utf-8')
  return p
}

// Wait enough wall-clock so that mtimeMs ceilings change on coarse filesystems.
async function bumpMtime(filePath: string, content: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 15))
  await fs.writeFile(filePath, content, 'utf-8')
  // Touch mtime explicitly for file systems with low-resolution mtimes.
  const now = new Date()
  await fs.utimes(filePath, now, now)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const tempRoot = setupE2eTestEnv()
  testDir = path.join(tempRoot, 'project-root')
  mkdirSync(testDir, { recursive: true })
  setProjectRegistryEntries([[TEST_PROJECT_ID, `file://${testDir}`]])

  // -----------------------------------------------------------------------
  // A. 盲写拒绝
  // -----------------------------------------------------------------------
  console.log('\nA — 盲写拒绝')

  await test('Edit 未 Read 的已存在文件 → 拒绝 (not read yet)', async () => {
    __resetForTests()
    const abs = await seedFile('a/existing.txt', 'hello\n')
    await expectReject(
      () => callEdit({ file_path: abs, old_string: 'hello', new_string: 'bye' }),
      'has not been read yet',
    )
  })

  await test('Write 覆盖未 Read 的已存在文件 → 拒绝 (not read yet)', async () => {
    __resetForTests()
    const abs = await seedFile('a/existing2.txt', 'hello\n')
    await expectReject(
      () => callWrite({ file_path: abs, content: 'overwrite' }),
      'has not been read yet',
    )
  })

  // -----------------------------------------------------------------------
  // B. 正常流程
  // -----------------------------------------------------------------------
  console.log('\nB — Read 后修改')

  await test('Read → Edit 成功', async () => {
    __resetForTests()
    const abs = await seedFile('b/ok.txt', 'foo\nbar\n')
    await callRead({ file_path: abs })
    const result = await callEdit({ file_path: abs, old_string: 'foo', new_string: 'FOO' })
    assert.ok(result.includes('Edited'))
    assert.equal((await fs.readFile(abs, 'utf-8')).trim(), 'FOO\nbar')
  })

  await test('Read → Write 覆盖成功', async () => {
    __resetForTests()
    const abs = await seedFile('b/ok2.txt', 'old')
    await callRead({ file_path: abs })
    const result = await callWrite({ file_path: abs, content: 'NEW' })
    assert.ok(result.includes('Wrote'))
    assert.equal(await fs.readFile(abs, 'utf-8'), 'NEW')
  })

  // -----------------------------------------------------------------------
  // C. 连续 Edit（mtime 自更新）
  // -----------------------------------------------------------------------
  console.log('\nC — 连续 Edit')

  await test('Read → Edit → Edit 不再要求重新 Read', async () => {
    __resetForTests()
    const abs = await seedFile('c/chain.txt', 'x\ny\nz\n')
    await callRead({ file_path: abs })
    await callEdit({ file_path: abs, old_string: 'x', new_string: 'X' })
    // 第二次 Edit 不应因为第一次 Edit 改了 mtime 而被拒绝
    await new Promise((r) => setTimeout(r, 15))
    const result = await callEdit({ file_path: abs, old_string: 'y', new_string: 'Y' })
    assert.ok(result.includes('Edited'))
  })

  // -----------------------------------------------------------------------
  // D. 部分视图
  // -----------------------------------------------------------------------
  console.log('\nD — 部分 Read')

  await test('offset/limit 部分 Read → Write 拒绝 (only partially read)', async () => {
    __resetForTests()
    const lines = Array.from({ length: 30 }, (_, i) => `line${i + 1}`).join('\n')
    const abs = await seedFile('d/big.txt', `${lines}\n`)
    await callRead({ file_path: abs, offset: 1, limit: 5 })
    await expectReject(
      () => callWrite({ file_path: abs, content: 'truncated' }),
      'only partially read',
    )
  })

  await test('offset/limit 部分 Read → Edit 放行（Edit 是 surgical）', async () => {
    __resetForTests()
    const lines = Array.from({ length: 30 }, (_, i) => `line${i + 1}`).join('\n')
    const abs = await seedFile('d/big2.txt', `${lines}\n`)
    await callRead({ file_path: abs, offset: 1, limit: 5 })
    const result = await callEdit({
      file_path: abs,
      old_string: 'line4\n',
      new_string: 'LINE4\n',
    })
    assert.ok(result.includes('Edited'))
  })

  // -----------------------------------------------------------------------
  // E. 外部修改 → mtime 漂移
  // -----------------------------------------------------------------------
  console.log('\nE — mtime 漂移')

  await test('Read → 外部改写 → Edit 拒绝 (modified since read)', async () => {
    __resetForTests()
    const abs = await seedFile('e/drift.txt', 'original\n')
    await callRead({ file_path: abs })
    await bumpMtime(abs, 'externally modified\n')
    await expectReject(
      () => callEdit({ file_path: abs, old_string: 'externally', new_string: 'X' }),
      'modified since read',
    )
  })

  // -----------------------------------------------------------------------
  // F. 新文件创建
  // -----------------------------------------------------------------------
  console.log('\nF — 新文件创建')

  await test('Write 新文件（ENOENT）免守卫', async () => {
    __resetForTests()
    const abs = path.join(testDir, 'f/brand-new.txt')
    // No Read was ever done; file doesn't exist.
    const result = await callWrite({ file_path: abs, content: 'created' })
    assert.ok(result.includes('Wrote'))
    assert.equal(await fs.readFile(abs, 'utf-8'), 'created')
  })

  await test('Write 新建后立即再 Write 同文件应成功（自更新状态）', async () => {
    __resetForTests()
    const abs = path.join(testDir, 'f/twice.txt')
    await callWrite({ file_path: abs, content: 'v1' })
    await new Promise((r) => setTimeout(r, 15))
    const result = await callWrite({ file_path: abs, content: 'v2' })
    assert.ok(result.includes('Wrote'))
    assert.equal(await fs.readFile(abs, 'utf-8'), 'v2')
  })

  // -----------------------------------------------------------------------
  // G. PLAN 文件绕过
  // -----------------------------------------------------------------------
  console.log('\nG — PLAN 文件绕过')

  await test('Write PLAN_1.md 不需要先 Read', async () => {
    __resetForTests()
    const abs = await seedFile('PLAN_1.md', 'existing plan content\n')
    // 无 Read 记录，但 PLAN 文件应直接放行
    const result = await callWrite({ file_path: abs, content: 'updated plan' })
    assert.ok(result.includes('Wrote'))
  })

  await test('Edit PLAN_1.md 不需要先 Read', async () => {
    __resetForTests()
    const abs = await seedFile('PLAN_2.md', 'step one\n')
    const result = await callEdit({
      file_path: abs,
      old_string: 'step one',
      new_string: 'step ONE',
    })
    assert.ok(result.includes('Edited'))
  })

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
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
