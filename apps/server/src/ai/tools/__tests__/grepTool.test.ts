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
 * Grep 工具核心逻辑测试
 *
 * 验证：
 *   A. 基本正则搜索
 *   B. 三种输出模式（files_with_matches / content / count）
 *   C. 上下文行（-A / -B / -C）
 *   D. 大小写不敏感搜索（-i）
 *   E. glob 过滤
 *   F. 分页（head_limit / offset）
 *   G. 无匹配提示
 *   H. needsApproval = false
 *
 * 前提：系统已安装 ripgrep (rg)
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/grepTool.test.ts
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
import { grepTool } from '@/ai/tools/grepTool'
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

const TEST_PROJECT_ID = 'proj_grep_test_00000001'

function withCtx<T>(fn: () => T | Promise<T>): Promise<T> {
  return runWithContext(
    { sessionId: 'grep-tool-test', cookies: {}, projectId: TEST_PROJECT_ID },
    fn as () => Promise<T>,
  )
}

let testDir: string

async function createFile(relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(testDir, relativePath)
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, content, 'utf-8')
}

async function callGrep(input: Record<string, unknown>): Promise<string> {
  const exec = grepTool.execute as (input: any, options: any) => Promise<string>
  return withCtx(async () => exec(input, {}))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const tempRoot = setupE2eTestEnv()
  testDir = path.join(tempRoot, 'project-root')
  mkdirSync(testDir, { recursive: true })
  setProjectRegistryEntries([[TEST_PROJECT_ID, `file://${testDir}`]])

  // 检查 rg 是否可用（确保 PATH 包含 homebrew）
  if (!process.env.PATH?.includes('/opt/homebrew/bin')) {
    process.env.PATH = `/opt/homebrew/bin:${process.env.PATH || ''}`
  }
  let rgAvailable = false
  for (const bin of ['rg', '/opt/homebrew/bin/rg', '/usr/local/bin/rg']) {
    try {
      execFileSync(bin, ['--version'], {
        timeout: 3000,
        stdio: 'pipe',
      })
      rgAvailable = true
      break
    } catch {
      // 尝试下一个
    }
  }
  if (!rgAvailable) {
    console.log('ripgrep (rg) not installed, skipping grep tool tests.')
    return
  }

  // 创建测试文件
  await createFile('grep-src/main.ts', [
    '// TODO: implement feature',
    'function hello() {',
    '  console.log("Hello World")',
    '}',
    '',
    '// TODO: fix bug',
    'function goodbye() {',
    '  console.log("Goodbye")',
    '}',
  ].join('\n'))

  await createFile('grep-src/utils.js', [
    'const helper = require("./helper")',
    '// todo: refactor',
    'module.exports = { helper }',
  ].join('\n'))

  await createFile('grep-src/data.json', '{ "key": "value" }')

  // -----------------------------------------------------------------------
  // A. 基本搜索
  // -----------------------------------------------------------------------
  console.log('\nA — 基本正则搜索')

  await test('简单字符串搜索', async () => {
    const result = await callGrep({
      pattern: 'TODO',
      path: path.join(testDir, 'grep-src'),
    })
    assert.ok(result.includes('main.ts'), `应匹配 main.ts: ${result}`)
  })

  await test('正则表达式搜索', async () => {
    const result = await callGrep({
      pattern: 'function\\s+\\w+',
      path: path.join(testDir, 'grep-src'),
      output_mode: 'content',
    })
    assert.ok(result.includes('hello'), `应匹配 hello 函数: ${result}`)
    assert.ok(result.includes('goodbye'), `应匹配 goodbye 函数: ${result}`)
  })

  // -----------------------------------------------------------------------
  // B. 输出模式
  // -----------------------------------------------------------------------
  console.log('\nB — 输出模式')

  await test('files_with_matches 模式只返回文件路径', async () => {
    const result = await callGrep({
      pattern: 'TODO',
      path: path.join(testDir, 'grep-src'),
      output_mode: 'files_with_matches',
    })
    assert.ok(result.includes('main.ts'))
    // 不应包含行内容
    assert.ok(!result.includes('implement feature'))
  })

  await test('content 模式返回匹配行内容', async () => {
    const result = await callGrep({
      pattern: 'Hello World',
      path: path.join(testDir, 'grep-src'),
      output_mode: 'content',
    })
    assert.ok(result.includes('Hello World'), `应包含匹配内容: ${result}`)
  })

  await test('count 模式返回计数', async () => {
    const result = await callGrep({
      pattern: 'TODO',
      path: path.join(testDir, 'grep-src'),
      output_mode: 'count',
    })
    // rg --count 输出格式: file:count
    assert.ok(result.includes(':'), `count 模式应包含 file:count 格式: ${result}`)
  })

  // -----------------------------------------------------------------------
  // C. 上下文行
  // -----------------------------------------------------------------------
  console.log('\nC — 上下文行')

  await test('-A 后文行数', async () => {
    const result = await callGrep({
      pattern: 'function hello',
      path: path.join(testDir, 'grep-src'),
      output_mode: 'content',
      '-A': 1,
    })
    // 应包含匹配行和其后 1 行
    assert.ok(result.includes('console.log'), `应包含后文行: ${result}`)
  })

  await test('-B 前文行数', async () => {
    const result = await callGrep({
      pattern: 'function hello',
      path: path.join(testDir, 'grep-src'),
      output_mode: 'content',
      '-B': 1,
    })
    // 应包含前 1 行（TODO comment）
    assert.ok(result.includes('TODO'), `应包含前文行: ${result}`)
  })

  // -----------------------------------------------------------------------
  // D. 大小写不敏感
  // -----------------------------------------------------------------------
  console.log('\nD — 大小写不敏感')

  await test('-i 不区分大小写', async () => {
    const result = await callGrep({
      pattern: 'todo',
      path: path.join(testDir, 'grep-src'),
      '-i': true,
    })
    // 应匹配 main.ts (TODO) 和 utils.js (todo)
    assert.ok(result.includes('main.ts'), `应匹配大写 TODO: ${result}`)
    assert.ok(result.includes('utils.js'), `应匹配小写 todo: ${result}`)
  })

  // -----------------------------------------------------------------------
  // E. glob 过滤
  // -----------------------------------------------------------------------
  console.log('\nE — glob 过滤')

  await test('glob 限制文件类型', async () => {
    const result = await callGrep({
      pattern: 'TODO|todo',
      path: path.join(testDir, 'grep-src'),
      glob: '*.ts',
    })
    assert.ok(result.includes('main.ts'), `应匹配 .ts 文件: ${result}`)
    assert.ok(!result.includes('utils.js'), '不应匹配 .js 文件')
  })

  // -----------------------------------------------------------------------
  // F. 分页
  // -----------------------------------------------------------------------
  console.log('\nF — 分页')

  await test('head_limit 限制结果数量', async () => {
    const result = await callGrep({
      pattern: '\\w+',
      path: path.join(testDir, 'grep-src'),
      output_mode: 'content',
      head_limit: 3,
    })
    const lines = result.split('\n').filter(Boolean)
    // 应不超过 3 行结果（可能有 "showing X-Y of Z" 提示）
    assert.ok(lines.length <= 5, `head_limit=3 应限制结果: got ${lines.length} lines`)
  })

  // -----------------------------------------------------------------------
  // G. 无匹配
  // -----------------------------------------------------------------------
  console.log('\nG — 无匹配')

  await test('无匹配时返回友好提示', async () => {
    const result = await callGrep({
      pattern: 'ZZZZZ_NONEXISTENT_PATTERN',
      path: path.join(testDir, 'grep-src'),
    })
    assert.ok(result.includes('No matches'), `应返回 no match 提示: ${result}`)
  })

  // -----------------------------------------------------------------------
  // H. needsApproval
  // -----------------------------------------------------------------------
  console.log('\nH — needsApproval')

  await test('grepTool.needsApproval 为 false', () => {
    assert.equal(grepTool.needsApproval, false, 'Grep 工具不需要审批')
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
