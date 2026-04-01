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
 * Write 工具核心逻辑测试
 *
 * 验证：
 *   A. 创建新文件（含自动创建父目录）
 *   B. 覆盖已有文件
 *   C. 路径 scope 验证（不允许写入项目外）
 *   D. needsApproval 始终为 true
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/writeTool.test.ts
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
import { writeTool } from '@/ai/tools/fileTools'
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

const TEST_PROJECT_ID = 'proj_write_test_00000001'

function withCtx<T>(fn: () => T | Promise<T>): Promise<T> {
  return runWithContext(
    { sessionId: 'write-tool-test', cookies: {}, projectId: TEST_PROJECT_ID },
    fn as () => Promise<T>,
  )
}

let testDir: string

async function callWrite(input: { file_path: string; content: string }): Promise<string> {
  const exec = writeTool.execute as (input: any, options: any) => Promise<string>
  return withCtx(async () => exec(input, {}))
}

async function callWriteExpectError(input: { file_path: string; content: string }): Promise<string> {
  try {
    await callWrite(input)
    throw new Error('Expected an error but none was thrown')
  } catch (err: any) {
    return err?.message ?? String(err)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const tempRoot = setupE2eTestEnv()
  testDir = path.join(tempRoot, 'project-root')
  mkdirSync(testDir, { recursive: true })

  // 通过 API 注册测试项目
  setProjectRegistryEntries([[TEST_PROJECT_ID, `file://${testDir}`]])

  // -----------------------------------------------------------------------
  // A. 创建新文件
  // -----------------------------------------------------------------------
  console.log('\nA — 创建新文件')

  await test('创建新文件', async () => {
    const result = await callWrite({
      file_path: 'write-test-a1.txt',
      content: 'hello write tool',
    })
    assert.ok(result.includes('Wrote file'))
    const content = await fs.readFile(path.join(testDir, 'write-test-a1.txt'), 'utf-8')
    assert.equal(content, 'hello write tool')
  })

  await test('自动创建嵌套父目录', async () => {
    const result = await callWrite({
      file_path: 'deep/nested/dir/file.txt',
      content: 'nested content',
    })
    assert.ok(result.includes('Wrote file'))
    const content = await fs.readFile(path.join(testDir, 'deep/nested/dir/file.txt'), 'utf-8')
    assert.equal(content, 'nested content')
  })

  await test('写入空内容', async () => {
    const result = await callWrite({
      file_path: 'write-test-empty.txt',
      content: '',
    })
    assert.ok(result.includes('Wrote file'))
    const content = await fs.readFile(path.join(testDir, 'write-test-empty.txt'), 'utf-8')
    assert.equal(content, '')
  })

  // -----------------------------------------------------------------------
  // B. 覆盖已有文件
  // -----------------------------------------------------------------------
  console.log('\nB — 覆盖已有文件')

  await test('覆盖已有文件内容', async () => {
    // 先创建
    await callWrite({ file_path: 'write-test-b1.txt', content: 'original' })
    // 覆盖
    await callWrite({ file_path: 'write-test-b1.txt', content: 'overwritten' })
    const content = await fs.readFile(path.join(testDir, 'write-test-b1.txt'), 'utf-8')
    assert.equal(content, 'overwritten')
  })

  // -----------------------------------------------------------------------
  // C. 路径 scope 验证
  // -----------------------------------------------------------------------
  console.log('\nC — 路径 scope 验证')

  await test('写入项目外绝对路径时报错', async () => {
    const errMsg = await callWriteExpectError({
      file_path: '/etc/test-file.txt',
      content: 'should fail',
    })
    assert.ok(errMsg.includes('outside') || errMsg.includes('scope') || errMsg.includes('not allowed'),
      `应报路径越界错误: ${errMsg}`)
  })

  await test('file:// URI 被拒绝', async () => {
    const errMsg = await callWriteExpectError({
      file_path: 'file:///etc/test.txt',
      content: 'should fail',
    })
    assert.ok(errMsg.includes('URI') || errMsg.includes('not allowed'),
      `应拒绝 file:// URI: ${errMsg}`)
  })

  // -----------------------------------------------------------------------
  // D. needsApproval
  // -----------------------------------------------------------------------
  console.log('\nD — needsApproval')

  await test('writeTool.needsApproval 为 true', () => {
    assert.equal(writeTool.needsApproval, true, 'Write 工具应始终需要审批')
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
