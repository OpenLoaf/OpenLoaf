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
 * Glob 工具核心逻辑测试
 *
 * 验证：
 *   A. glob 模式匹配（*.txt、**\/*.ts 等）
 *   B. 固定排除目录（.git、node_modules）
 *   C. 结果按修改时间排序
 *   D. 250 条结果限制
 *   E. 空匹配提示
 *   F. needsApproval = false
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/globTool.test.ts
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
import { globTool } from '@/ai/tools/globTool'
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

const TEST_PROJECT_ID = 'proj_glob_test_00000001'

function withCtx<T>(fn: () => T | Promise<T>): Promise<T> {
  return runWithContext(
    { sessionId: 'glob-tool-test', cookies: {}, projectId: TEST_PROJECT_ID },
    fn as () => Promise<T>,
  )
}

let testDir: string

async function createFile(relativePath: string, content = ''): Promise<void> {
  const fullPath = path.join(testDir, relativePath)
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, content, 'utf-8')
}

async function callGlob(input: { pattern: string; path?: string }): Promise<string> {
  const exec = globTool.execute as (input: any, options: any) => Promise<string>
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

  // 创建测试文件结构
  await createFile('src/index.ts', 'export {}')
  await createFile('src/utils/helper.ts', 'export {}')
  await createFile('src/utils/format.js', 'module.exports = {}')
  await createFile('docs/readme.md', '# Docs')
  await createFile('config.json', '{}')
  await createFile('.git/HEAD', 'ref: refs/heads/main')
  await createFile('node_modules/pkg/index.js', 'module.exports = {}')

  // -----------------------------------------------------------------------
  // A. glob 模式匹配
  // -----------------------------------------------------------------------
  console.log('\nA — glob 模式匹配')

  await test('*.ts 匹配顶层 .ts 文件', async () => {
    // 创建顶层 ts 文件
    await createFile('app.ts', 'export {}')
    const result = await callGlob({ pattern: '*.ts' })
    assert.ok(result.includes('app.ts'), `应包含 app.ts: ${result}`)
    // 不应匹配子目录中的 .ts
    assert.ok(!result.includes('src/index.ts'), '*.ts 不应匹配子目录')
  })

  await test('**/*.ts 递归匹配所有 .ts 文件', async () => {
    const result = await callGlob({ pattern: '**/*.ts' })
    assert.ok(result.includes('index.ts'), `应包含 index.ts: ${result}`)
    assert.ok(result.includes('helper.ts'), `应包含 helper.ts: ${result}`)
  })

  await test('src/**/*.{ts,js} 匹配多扩展名', async () => {
    const result = await callGlob({ pattern: 'src/**/*.{ts,js}' })
    assert.ok(result.includes('index.ts') || result.includes('helper.ts'), `应包含 .ts 文件`)
    assert.ok(result.includes('format.js'), `应包含 .js 文件: ${result}`)
  })

  // -----------------------------------------------------------------------
  // B. 固定排除目录
  // -----------------------------------------------------------------------
  console.log('\nB — 固定排除目录')

  await test('.git 目录被排除', async () => {
    const result = await callGlob({ pattern: '**/*' })
    assert.ok(!result.includes('.git/HEAD'), '.git 内文件不应出现')
  })

  await test('node_modules 目录被排除', async () => {
    const result = await callGlob({ pattern: '**/*.js' })
    assert.ok(!result.includes('node_modules'), 'node_modules 内文件不应出现')
  })

  // -----------------------------------------------------------------------
  // C. 结果排序
  // -----------------------------------------------------------------------
  console.log('\nC — 结果排序')

  await test('结果按修改时间排序（最新在前）', async () => {
    // 创建两个文件，第二个更新
    await createFile('sort-older.txt', 'old')
    // 等待一小段时间确保 mtime 不同
    await new Promise((r) => setTimeout(r, 50))
    await createFile('sort-newer.txt', 'new')
    const result = await callGlob({ pattern: 'sort-*.txt' })
    const lines = result.split('\n').filter(Boolean)
    assert.ok(lines.length >= 2, '应至少有 2 个结果')
    // 最新的应在前面
    const newerIdx = lines.findIndex((l) => l.includes('sort-newer.txt'))
    const olderIdx = lines.findIndex((l) => l.includes('sort-older.txt'))
    assert.ok(newerIdx < olderIdx, `最新文件应排在前面: ${result}`)
  })

  // -----------------------------------------------------------------------
  // D. 空匹配
  // -----------------------------------------------------------------------
  console.log('\nD — 空匹配')

  await test('无匹配时返回提示信息', async () => {
    const result = await callGlob({ pattern: '*.nonexistent_extension_xyz' })
    assert.ok(result.includes('No files matched'), `应返回 no match 提示: ${result}`)
  })

  // -----------------------------------------------------------------------
  // E. path 参数
  // -----------------------------------------------------------------------
  console.log('\nE — path 参数')

  await test('指定 path 限制搜索目录', async () => {
    const result = await callGlob({ pattern: '*.ts', path: path.join(testDir, 'src/utils') })
    assert.ok(result.includes('helper.ts'), `应在 src/utils 下找到 helper.ts: ${result}`)
    assert.ok(!result.includes('index.ts'), '不应找到 src/ 根下的 index.ts')
  })

  // -----------------------------------------------------------------------
  // F. needsApproval
  // -----------------------------------------------------------------------
  console.log('\nF — needsApproval')

  await test('globTool.needsApproval 为 false', () => {
    assert.equal(globTool.needsApproval, false, 'Glob 工具不需要审批')
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
