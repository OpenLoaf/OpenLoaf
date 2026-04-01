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
 * Edit 工具核心逻辑测试
 *
 * 验证：
 *   A. old_string/new_string 精确替换
 *   B. 唯一性检查（多次匹配报错）
 *   C. trimEnd 容错提示
 *   D. replace_all 批量替换
 *   E. old_string === new_string 报错
 *   F. 文件不存在时报错
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/editTool.test.ts
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
import { editTool } from '@/ai/tools/fileTools'
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

const TEST_PROJECT_ID = 'proj_edit_test_00000001'

function withCtx<T>(fn: () => T | Promise<T>): Promise<T> {
  return runWithContext(
    { sessionId: 'edit-tool-test', cookies: {}, projectId: TEST_PROJECT_ID },
    fn as () => Promise<T>,
  )
}

let testDir: string

async function createTestFile(name: string, content: string): Promise<string> {
  const filePath = path.join(testDir, name)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
  return filePath
}

async function readTestFile(name: string): Promise<string> {
  return fs.readFile(path.join(testDir, name), 'utf-8')
}

/** 调用 Edit 工具的 execute。 */
async function callEdit(input: {
  file_path: string
  old_string: string
  new_string: string
  replace_all?: boolean
}): Promise<string> {
  const exec = editTool.execute as (input: any, options: any) => Promise<string>
  return withCtx(async () => exec(input, {}))
}

/** 预期调用 Edit 工具抛出错误，返回错误消息。 */
async function callEditExpectError(input: {
  file_path: string
  old_string: string
  new_string: string
  replace_all?: boolean
}): Promise<string> {
  try {
    await callEdit(input)
    throw new Error('Expected an error but none was thrown')
  } catch (err: any) {
    return err?.message ?? String(err)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Setup：初始化 E2E 环境并注册测试项目
  const tempRoot = setupE2eTestEnv()
  testDir = path.join(tempRoot, 'project-root')
  mkdirSync(testDir, { recursive: true })

  // 通过 API 注册测试项目，让 getProjectRootPath 能解析
  setProjectRegistryEntries([[TEST_PROJECT_ID, `file://${testDir}`]])

  // -----------------------------------------------------------------------
  // A. 精确替换
  // -----------------------------------------------------------------------
  console.log('\nA — 精确字符串替换')

  await test('单次精确替换成功', async () => {
    await createTestFile('edit-a1.txt', 'hello world\nfoo bar\n')
    const result = await callEdit({
      file_path: 'edit-a1.txt',
      old_string: 'hello world',
      new_string: 'hello openloaf',
    })
    assert.ok(result.includes('replaced 1'))
    const content = await readTestFile('edit-a1.txt')
    assert.ok(content.includes('hello openloaf'))
    assert.ok(!content.includes('hello world'))
  })

  await test('替换保留周围内容不变', async () => {
    await createTestFile('edit-a2.txt', 'line1\ntarget_text\nline3\n')
    await callEdit({
      file_path: 'edit-a2.txt',
      old_string: 'target_text',
      new_string: 'replaced_text',
    })
    const content = await readTestFile('edit-a2.txt')
    assert.equal(content, 'line1\nreplaced_text\nline3\n')
  })

  await test('替换含特殊字符的字符串', async () => {
    await createTestFile('edit-a3.txt', 'const x = "hello $world";\n')
    await callEdit({
      file_path: 'edit-a3.txt',
      old_string: 'const x = "hello $world";',
      new_string: 'const x = "hello @world";',
    })
    const content = await readTestFile('edit-a3.txt')
    assert.ok(content.includes('"hello @world"'))
  })

  // -----------------------------------------------------------------------
  // B. 唯一性检查
  // -----------------------------------------------------------------------
  console.log('\nB — 唯一性检查')

  await test('多次匹配时报错（含行号信息）', async () => {
    await createTestFile('edit-b1.txt', 'foo\nbar\nfoo\nbaz\nfoo\n')
    const errMsg = await callEditExpectError({
      file_path: 'edit-b1.txt',
      old_string: 'foo',
      new_string: 'qux',
    })
    assert.ok(errMsg.includes('3 times'), `应提示出现 3 次: ${errMsg}`)
    assert.ok(errMsg.includes('replace_all'), `应建议使用 replace_all: ${errMsg}`)
    // 文件内容不应被修改
    const content = await readTestFile('edit-b1.txt')
    assert.ok(content.includes('foo'), '多次匹配时不应修改文件')
  })

  // -----------------------------------------------------------------------
  // C. trimEnd 容错提示
  // -----------------------------------------------------------------------
  console.log('\nC — trimEnd 容错提示')

  await test('精确匹配失败但 trimEnd 匹配时给出提示', async () => {
    // 文件中 "abc def" 无尾部空白；old_string 有尾部空白 → 精确匹配失败但 trimEnd 匹配
    await createTestFile('edit-c1.txt', 'abc def\nfoo\n')
    const errMsg = await callEditExpectError({
      file_path: 'edit-c1.txt',
      old_string: 'abc def   ',
      new_string: 'hi',
    })
    assert.ok(errMsg.includes('trimmed') || errMsg.includes('trailing whitespace'), `应提示尾随空白: ${errMsg}`)
  })

  await test('完全找不到时报 not found', async () => {
    await createTestFile('edit-c2.txt', 'alpha beta gamma\n')
    const errMsg = await callEditExpectError({
      file_path: 'edit-c2.txt',
      old_string: 'nonexistent_string_xyz',
      new_string: 'replacement',
    })
    assert.ok(errMsg.includes('not found'), `应提示 not found: ${errMsg}`)
  })

  // -----------------------------------------------------------------------
  // D. replace_all 批量替换
  // -----------------------------------------------------------------------
  console.log('\nD — replace_all 批量替换')

  await test('replace_all 替换所有匹配', async () => {
    await createTestFile('edit-d1.txt', 'aaa\nbbb\naaa\nccc\naaa\n')
    const result = await callEdit({
      file_path: 'edit-d1.txt',
      old_string: 'aaa',
      new_string: 'zzz',
      replace_all: true,
    })
    assert.ok(result.includes('replaced 3'))
    const content = await readTestFile('edit-d1.txt')
    assert.ok(!content.includes('aaa'))
    assert.equal(content.split('zzz').length - 1, 3)
  })

  await test('replace_all 单次匹配也正常工作', async () => {
    await createTestFile('edit-d2.txt', 'unique_line\nother\n')
    const result = await callEdit({
      file_path: 'edit-d2.txt',
      old_string: 'unique_line',
      new_string: 'replaced_line',
      replace_all: true,
    })
    assert.ok(result.includes('replaced 1'))
  })

  // -----------------------------------------------------------------------
  // E. old_string === new_string 检查
  // -----------------------------------------------------------------------
  console.log('\nE — 相同字符串检查')

  await test('old_string === new_string 时报错', async () => {
    await createTestFile('edit-e1.txt', 'content\n')
    const errMsg = await callEditExpectError({
      file_path: 'edit-e1.txt',
      old_string: 'content',
      new_string: 'content',
    })
    assert.ok(errMsg.includes('different'), `应提示 old_string 和 new_string 必须不同: ${errMsg}`)
  })

  // -----------------------------------------------------------------------
  // F. 文件不存在
  // -----------------------------------------------------------------------
  console.log('\nF — 文件不存在')

  await test('编辑不存在的文件时报错', async () => {
    const errMsg = await callEditExpectError({
      file_path: 'nonexistent-file-xyz.txt',
      old_string: 'foo',
      new_string: 'bar',
    })
    assert.ok(errMsg.length > 0, '应抛出错误')
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
