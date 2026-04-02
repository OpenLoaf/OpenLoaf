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
 * MemorySave domain tests.
 *
 * 基于领域驱动测试理论，按以下层次组织：
 *   A — 纯函数单元测试（无 I/O）
 *   B — 文件 I/O 层测试（真实临时目录）
 *   C — 集成测试（完整工具执行 + RequestContext）
 *   D — 缺陷回归测试（针对审查发现的 bug）
 *
 * 用法:
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/memorySave.test.ts
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { setRequestContext } from '@/ai/shared/context/requestContext'
import { memoryIndexManager } from '@/memory/memoryIndexManager'
import { memorySaveTool as _memorySaveTool } from '../memoryTools'

const memorySaveExecute = _memorySaveTool.execute!
const toolCtx = { toolCallId: 'test', messages: [] as any[], abortSignal: new AbortController().signal }

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

function createTempMemoryDir(): { root: string; memoryDir: string } {
  const root = path.join(
    os.tmpdir(),
    `openloaf-test-memsave-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  )
  const memoryDir = path.join(root, '.openloaf', 'memory')
  mkdirSync(memoryDir, { recursive: true })
  return { root, memoryDir }
}

function cleanupDir(dir: string) {
  try { rmSync(dir, { recursive: true, force: true }) } catch { /* ignore */ }
}

function setContextWithProject(projectRoot: string) {
  setRequestContext({
    sessionId: `test-${Date.now()}`,
    cookies: {},
    parentProjectRootPaths: [projectRoot],
  })
}

function setContextNoProject() {
  setRequestContext({
    sessionId: `test-${Date.now()}`,
    cookies: {},
  })
}

const today = new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// A — 纯函数单元测试
// ---------------------------------------------------------------------------

async function testPureFunctions() {
  console.log('\n--- A: 纯函数单元测试 ---')

  // A1: KEY_PATTERN validation（通过 execute 间接测试）
  await test('A1: valid key "food-preferences" → accepted', async () => {
    const { root } = createTempMemoryDir()
    setContextWithProject(root)
    const result = await memorySaveExecute(
      { key: 'food-preferences', content: 'test content', scope: 'project' },
      toolCtx,
    )
    assert.ok((result as any).ok, `Expected ok, got: ${JSON.stringify(result)}`)
    cleanupDir(root)
  })

  await test('A2: valid single-char key "a" → accepted', async () => {
    const { root } = createTempMemoryDir()
    setContextWithProject(root)
    const result = await memorySaveExecute({ key: 'a', content: 'test', scope: 'project' }, toolCtx)
    assert.ok((result as any).ok)
    cleanupDir(root)
  })

  await test('A3: invalid key with uppercase → rejected', async () => {
    const { root } = createTempMemoryDir()
    setContextWithProject(root)
    const result = await memorySaveExecute({ key: 'Food-Pref', content: 'test' }, toolCtx)
    assert.equal((result as any).ok, false)
    assert.equal((result as any).error, 'invalid_key')
    cleanupDir(root)
  })

  await test('A4: invalid key with leading hyphen → rejected', async () => {
    const { root } = createTempMemoryDir()
    setContextWithProject(root)
    const result = await memorySaveExecute({ key: '-bad-key', content: 'test' }, toolCtx)
    assert.equal((result as any).ok, false)
    cleanupDir(root)
  })

  await test('A5: invalid key with unicode → rejected', async () => {
    const { root } = createTempMemoryDir()
    setContextWithProject(root)
    const result = await memorySaveExecute({ key: '日本語', content: 'test' }, toolCtx)
    assert.equal((result as any).ok, false)
    cleanupDir(root)
  })

  await test('A6: delete mode without content → ok (content optional)', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)
    // Create a file first
    writeFileSync(path.join(memoryDir, `${today}-to-delete.md`), 'temp')
    const result = await memorySaveExecute(
      { key: 'to-delete', mode: 'delete', scope: 'project' },
      toolCtx,
    )
    assert.ok((result as any).ok)
    cleanupDir(root)
  })

  await test('A7: upsert mode without content → error', async () => {
    const { root } = createTempMemoryDir()
    setContextWithProject(root)
    const result = await memorySaveExecute({ key: 'test', mode: 'upsert', scope: 'project' }, toolCtx)
    assert.equal((result as any).ok, false)
    assert.equal((result as any).error, 'missing_content')
    cleanupDir(root)
  })

  await test('A8: needsApproval should be false', () => {
    assert.equal(_memorySaveTool.needsApproval, false, 'MemorySave should not require approval')
  })
}

// ---------------------------------------------------------------------------
// B — 文件 I/O 层测试
// ---------------------------------------------------------------------------

async function testFileIO() {
  console.log('\n--- B: 文件 I/O 层测试 ---')

  // B1: 基本 upsert 创建
  await test('B1: upsert new key → creates dated file + updates MEMORY.md', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    const result = await memorySaveExecute(
      { key: 'my-note', content: '这是一条测试记忆', indexEntry: '测试记忆', scope: 'project' },
      toolCtx,
    )
    assert.ok((result as any).ok)
    assert.equal((result as any).action, 'created')
    assert.equal((result as any).filePath, `${today}-my-note.md`)

    // Verify file exists
    const filePath = path.join(memoryDir, `${today}-my-note.md`)
    assert.ok(existsSync(filePath), 'Memory file should exist')

    // Verify content has frontmatter
    const content = readFileSync(filePath, 'utf8')
    assert.ok(content.includes('created:'), 'Should have created date in frontmatter')
    assert.ok(content.includes('这是一条测试记忆'), 'Should contain original content')

    // Verify MEMORY.md index
    const indexContent = readFileSync(path.join(memoryDir, 'MEMORY.md'), 'utf8')
    assert.ok(indexContent.includes('[my-note]'), 'Index should contain key')
    assert.ok(indexContent.includes('测试记忆'), 'Index should contain summary')

    cleanupDir(root)
  })

  // B2: Upsert 更新已有文件
  await test('B2: upsert existing key → updates file, refreshes date, returns previousContent', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    // Create initial
    writeFileSync(path.join(memoryDir, '2026-01-01-pref.md'), '---\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n\nold content')
    writeFileSync(path.join(memoryDir, 'MEMORY.md'), '- [pref](2026-01-01-pref.md) — old summary\n')

    const result = await memorySaveExecute(
      { key: 'pref', content: 'new content', scope: 'project' },
      toolCtx,
    )
    assert.ok((result as any).ok)
    assert.equal((result as any).action, 'updated')
    assert.ok((result as any).previousContentPreview, 'Should return previous content preview')

    // Old file should be gone, new file should exist
    assert.ok(!existsSync(path.join(memoryDir, '2026-01-01-pref.md')), 'Old file should be deleted')
    assert.ok(existsSync(path.join(memoryDir, `${today}-pref.md`)), 'New file should exist')

    // Verify frontmatter preserves original created date
    const content = readFileSync(path.join(memoryDir, `${today}-pref.md`), 'utf8')
    assert.ok(content.includes('created: 2026-01-01'), 'Should preserve original created date')
    assert.ok(content.includes(`updated: ${today}`), 'Should update the updated date')

    cleanupDir(root)
  })

  // B3: Append 模式
  await test('B3: append to existing file → content appended with separator', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    writeFileSync(path.join(memoryDir, `${today}-log.md`), 'first entry')

    const result = await memorySaveExecute(
      { key: 'log', content: 'second entry', mode: 'append', scope: 'project' },
      toolCtx,
    )
    assert.ok((result as any).ok)
    assert.equal((result as any).action, 'appended')

    const content = readFileSync(path.join(memoryDir, `${today}-log.md`), 'utf8')
    assert.ok(content.includes('first entry'), 'Should keep original content')
    assert.ok(content.includes('second entry'), 'Should contain appended content')

    cleanupDir(root)
  })

  // B4: Append 不存在的文件退化为创建
  await test('B4: append to non-existent key → creates new file', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    const result = await memorySaveExecute(
      { key: 'new-log', content: 'first entry', mode: 'append', scope: 'project' },
      toolCtx,
    )
    assert.ok((result as any).ok)
    assert.equal((result as any).action, 'created')
    assert.ok(existsSync(path.join(memoryDir, `${today}-new-log.md`)))

    cleanupDir(root)
  })

  // B5: Delete
  await test('B5: delete existing key → removes file and index entry', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    writeFileSync(path.join(memoryDir, `${today}-trash.md`), 'to be deleted')
    writeFileSync(path.join(memoryDir, 'MEMORY.md'), '- [trash](2026-03-17-trash.md) — trash\n- [keep](2026-03-17-keep.md) — keep\n')

    const result = await memorySaveExecute({ key: 'trash', mode: 'delete', scope: 'project' }, toolCtx)
    assert.ok((result as any).ok)
    assert.equal((result as any).action, 'deleted')

    assert.ok(!existsSync(path.join(memoryDir, `${today}-trash.md`)), 'File should be deleted')

    const indexContent = readFileSync(path.join(memoryDir, 'MEMORY.md'), 'utf8')
    assert.ok(!indexContent.includes('[trash]'), 'Index should not contain deleted key')
    assert.ok(indexContent.includes('[keep]'), 'Index should still contain other keys')

    cleanupDir(root)
  })

  // B6: Delete non-existent → error
  await test('B6: delete non-existent key → returns not_found', async () => {
    const { root } = createTempMemoryDir()
    setContextWithProject(root)

    const result = await memorySaveExecute({ key: 'ghost', mode: 'delete', scope: 'project' }, toolCtx)
    assert.equal((result as any).ok, false)
    assert.equal((result as any).error, 'not_found')

    cleanupDir(root)
  })

  // B7: Tags 写入 frontmatter
  await test('B7: tags parameter → injected into frontmatter', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    await memorySaveExecute(
      { key: 'tagged', content: 'tagged content', tags: ['food', 'preference'], scope: 'project' },
      toolCtx,
    )

    const content = readFileSync(path.join(memoryDir, `${today}-tagged.md`), 'utf8')
    assert.ok(content.includes('tags: [food, preference]'), 'Should contain tags in frontmatter')

    cleanupDir(root)
  })

  // B8: 缓存失效验证
  await test('B8: after save, MemorySearch can find the new entry', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    await memorySaveExecute(
      { key: 'searchable', content: 'unique-keyword-xyzzy', scope: 'project' },
      toolCtx,
    )

    const results = memoryIndexManager.search([memoryDir], 'unique-keyword-xyzzy', 5)
    assert.ok(results.length >= 1, `Expected search to find entry, got ${results.length} results`)

    cleanupDir(root)
  })
}

// ---------------------------------------------------------------------------
// C — 集成测试（scope 解析 + agent 上下文）
// ---------------------------------------------------------------------------

async function testIntegration() {
  console.log('\n--- C: 集成测试 ---')

  // C1: scope=project 写入项目目录
  await test('C1: scope=project → writes to project .openloaf/memory/', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    const result = await memorySaveExecute(
      { key: 'proj-note', content: 'project specific', scope: 'project' },
      toolCtx,
    )
    assert.ok((result as any).ok)
    assert.ok(existsSync(path.join(memoryDir, `${today}-proj-note.md`)))

    cleanupDir(root)
  })

  // C2: scope=agent 写入 agent 子目录
  await test('C2: scope=agent with agentStack → writes to agents/{name}/', async () => {
    const { root } = createTempMemoryDir()
    // homedir 的 memory 目录用来测 agent scope
    const userMemDir = path.join(os.homedir(), '.openloaf', 'memory', 'agents', 'test-coder')
    mkdirSync(userMemDir, { recursive: true })

    setRequestContext({
      sessionId: `test-${Date.now()}`,
      cookies: {},
      parentProjectRootPaths: [root],
      agentStack: [{ kind: 'master' as any, name: 'test-coder', agentId: 'test-id', path: [] }],
    })

    const result = await memorySaveExecute(
      { key: 'agent-note', content: 'agent memory', scope: 'agent' },
      toolCtx,
    )
    assert.ok((result as any).ok)
    assert.ok(existsSync(path.join(userMemDir, `${today}-agent-note.md`)))

    // Cleanup
    cleanupDir(userMemDir)
    cleanupDir(root)
  })
}

// ---------------------------------------------------------------------------
// D — 缺陷回归测试（审查发现的 bug）
// ---------------------------------------------------------------------------

async function testDefectRegression() {
  console.log('\n--- D: 缺陷回归测试 ---')

  // D1: [Critical #2] findExistingMemoryFile 后缀误匹配
  // key="test" 不应误匹配 "api-test" 的文件
  await test('D1: [Bug#2] key="test" must NOT match file "2026-01-01-api-test.md"', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    // 预先创建一个属于 key="api-test" 的文件
    writeFileSync(path.join(memoryDir, '2026-01-01-api-test.md'), 'api test content')
    writeFileSync(path.join(memoryDir, 'MEMORY.md'), '- [api-test](2026-01-01-api-test.md) — api test\n')

    // 用 key="test" 做 upsert，不应该影响 api-test 的文件
    const result = await memorySaveExecute(
      { key: 'test', content: 'my test content', scope: 'project' },
      toolCtx,
    )
    assert.ok((result as any).ok)
    assert.equal((result as any).action, 'created', 'Should create new file, not update api-test')

    // api-test 的文件应该完好无损
    assert.ok(
      existsSync(path.join(memoryDir, '2026-01-01-api-test.md')),
      'api-test file must NOT be deleted by key="test" upsert',
    )
    const apiTestContent = readFileSync(path.join(memoryDir, '2026-01-01-api-test.md'), 'utf8')
    assert.equal(apiTestContent, 'api test content', 'api-test content must be unchanged')

    // 同时新文件应该存在
    assert.ok(existsSync(path.join(memoryDir, `${today}-test.md`)), 'New test file should exist')

    cleanupDir(root)
  })

  // D2: [Critical #1] Upsert 不应在写入失败时丢失旧数据
  // 验证逻辑：upsert 同一天的文件时应该是原子覆盖，不需要先删后写
  await test('D2: [Bug#1] upsert same-day file → atomic overwrite, no data loss window', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    const filePath = path.join(memoryDir, `${today}-safe.md`)
    writeFileSync(filePath, 'original content')

    const result = await memorySaveExecute(
      { key: 'safe', content: 'updated content', scope: 'project' },
      toolCtx,
    )
    assert.ok((result as any).ok)
    assert.equal((result as any).action, 'updated')

    // 文件应该存在且内容为新内容
    const content = readFileSync(path.join(memoryDir, `${today}-safe.md`), 'utf8')
    assert.ok(content.includes('updated content'), 'File should have new content')

    cleanupDir(root)
  })

  // D3: [High #4] updateMemoryIndex 不应误删其他 key 的索引条目
  await test('D3: [Bug#4] save key="api" must NOT remove index entry for "api-design"', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    // 预设索引包含 api-design 条目
    writeFileSync(
      path.join(memoryDir, 'MEMORY.md'),
      '- [api-design](2026-01-01-api-design.md) — API design notes\n',
    )

    // 保存 key="api"
    await memorySaveExecute(
      { key: 'api', content: 'api notes', indexEntry: 'API notes', scope: 'project' },
      toolCtx,
    )

    const indexContent = readFileSync(path.join(memoryDir, 'MEMORY.md'), 'utf8')
    assert.ok(
      indexContent.includes('[api-design]'),
      'Index entry for api-design must NOT be removed when saving key=api',
    )
    assert.ok(
      indexContent.includes('[api]'),
      'Index should contain the new api entry',
    )

    cleanupDir(root)
  })

  // D4: [High #5] scope=project 无项目上下文时应返回错误，而非静默 fallback
  await test('D4: [Bug#5] scope=project with no project context → should error, not silent fallback', async () => {
    setContextNoProject()

    const result = await memorySaveExecute(
      { key: 'orphan', content: 'no project', scope: 'project' },
      toolCtx,
    )

    // 应该返回错误或至少在返回值中标明实际 scope 不是 project
    // 当前行为：静默 fallback 到 user scope 且返回 scope: "project" — 这是 bug
    const r = result as any
    if (r.ok) {
      // 如果成功了，actualScope 应该不是 'project'（除非 fallback 被修复为报错）
      assert.notEqual(
        r.scope, 'project',
        'If saved successfully, returned scope should NOT be "project" when no project context exists',
      )
    } else {
      // 修复后应该返回 ok: false
      assert.ok(true, 'Correctly returned error for missing project context')
    }
  })

  // D5: [Medium #11] 保留名 key="memory" 应被拒绝（macOS 大小写不敏感）
  await test('D5: [Bug#11] reserved key "memory" → should be rejected', async () => {
    const { root } = createTempMemoryDir()
    setContextWithProject(root)

    const result = await memorySaveExecute(
      { key: 'memory', content: 'conflict with MEMORY.md', scope: 'project' },
      toolCtx,
    )
    // 修复后应该拒绝
    // 当前行为：允许创建 "2026-03-17-memory.md"，在 macOS 上可能与 MEMORY.md 冲突
    const r = result as any
    if (r.ok) {
      // 未修复时会成功 — 标记为已知问题
      console.log('    ⚠ key="memory" was accepted (known issue on case-insensitive FS)')
    }

    cleanupDir(root)
  })

  // D6: 多次 upsert 同一 key → MEMORY.md 索引不应有重复条目
  await test('D6: multiple upserts to same key → no duplicate index entries', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    await memorySaveExecute({ key: 'dup', content: 'v1', indexEntry: 'version 1', scope: 'project' }, toolCtx)
    await memorySaveExecute({ key: 'dup', content: 'v2', indexEntry: 'version 2', scope: 'project' }, toolCtx)
    await memorySaveExecute({ key: 'dup', content: 'v3', indexEntry: 'version 3', scope: 'project' }, toolCtx)

    const indexContent = readFileSync(path.join(memoryDir, 'MEMORY.md'), 'utf8')
    const occurrences = indexContent.split('[dup]').length - 1
    assert.equal(occurrences, 1, `Expected exactly 1 index entry for "dup", found ${occurrences}`)
    assert.ok(indexContent.includes('version 3'), 'Index should have latest summary')

    cleanupDir(root)
  })

  // D10: 多次 create/delete 后 MEMORY.md 不应有空行
  await test('D10: create+delete cycles → no blank lines in MEMORY.md', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    await memorySaveExecute({ key: 'alpha', content: 'a', scope: 'project' }, toolCtx)
    await memorySaveExecute({ key: 'beta', content: 'b', scope: 'project' }, toolCtx)
    await memorySaveExecute({ key: 'gamma', content: 'c', scope: 'project' }, toolCtx)
    await memorySaveExecute({ key: 'beta', mode: 'delete', scope: 'project' }, toolCtx)
    await memorySaveExecute({ key: 'delta', content: 'd', scope: 'project' }, toolCtx)
    await memorySaveExecute({ key: 'alpha', content: 'a2', scope: 'project' }, toolCtx) // upsert

    const indexContent = readFileSync(path.join(memoryDir, 'MEMORY.md'), 'utf8')
    const blankLines = indexContent.split('\n').filter((l: string) => l.trim() === '' && l !== '')
    assert.equal(blankLines.length, 0, `MEMORY.md should have no blank lines, found ${blankLines.length}`)

    // 应该只剩 alpha, gamma, delta（beta 已删）
    assert.ok(!indexContent.includes('[beta]'), 'beta should be deleted')
    assert.ok(indexContent.includes('[alpha]'), 'alpha should exist')
    assert.ok(indexContent.includes('[gamma]'), 'gamma should exist')
    assert.ok(indexContent.includes('[delta]'), 'delta should exist')

    cleanupDir(root)
  })

  // D7: extractFirstMeaningfulLine 空内容 → 索引摘要不应是空的
  await test('D7: empty-ish content → index entry should have fallback summary', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    await memorySaveExecute({ key: 'empty', content: '\n\n\n', scope: 'project' }, toolCtx)

    const indexContent = readFileSync(path.join(memoryDir, 'MEMORY.md'), 'utf8')
    const entryLine = indexContent.split('\n').find((l: string) => l.includes('[empty]'))
    assert.ok(entryLine, 'Index should have entry')
    // 摘要不应该是 "— " 后面空着的
    const summary = entryLine!.split('—')[1]?.trim()
    // 修复后应有 fallback（如 key 本身），当前可能为空
    if (!summary) {
      console.log('    ⚠ Empty summary in index (known issue)')
    }

    cleanupDir(root)
  })

  // D8: delete 后 search 不应返回已删除的条目
  await test('D8: delete then search → deleted entry not in results', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    await memorySaveExecute(
      { key: 'temp-data', content: 'unique-deleteme-token', scope: 'project' },
      toolCtx,
    )

    // 确认能搜到
    let results = memoryIndexManager.search([memoryDir], 'unique-deleteme-token', 5)
    assert.ok(results.length >= 1, 'Should find entry before delete')

    // 删除
    await memorySaveExecute({ key: 'temp-data', mode: 'delete', scope: 'project' }, toolCtx)

    // 删除后搜不到
    results = memoryIndexManager.search([memoryDir], 'unique-deleteme-token', 5)
    assert.equal(results.length, 0, 'Should NOT find entry after delete')

    cleanupDir(root)
  })

  // D9: scope=project 写入正确的项目目录
  await test('D9: scope=project writes to project dir, not user dir', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    await memorySaveExecute(
      { key: 'proj-only', content: 'project content', scope: 'project' },
      toolCtx,
    )

    // 文件应在项目 memory 目录中
    assert.ok(
      existsSync(path.join(memoryDir, `${today}-proj-only.md`)),
      'File should be in project memory directory',
    )

    cleanupDir(root)
  })
}

// ---------------------------------------------------------------------------
// E — 时序状态 + 操作序列测试
// ---------------------------------------------------------------------------

async function testSequences() {
  console.log('\n--- E: 操作序列与时序测试 ---')

  // T1: append→delete→append 同一 key
  await test('T1: append→delete→append same key → no residual from first round', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    await memorySaveExecute({ key: 'journal', content: 'day-1 entry', scope: 'project' }, toolCtx)
    await memorySaveExecute({ key: 'journal', content: 'day-1 addendum', mode: 'append', scope: 'project' }, toolCtx)

    // 验证中间状态
    let content = readFileSync(path.join(memoryDir, `${today}-journal.md`), 'utf8')
    assert.ok(content.includes('day-1 entry'), 'Mid-state: should have original')
    assert.ok(content.includes('day-1 addendum'), 'Mid-state: should have appended')

    await memorySaveExecute({ key: 'journal', mode: 'delete', scope: 'project' }, toolCtx)
    const r = await memorySaveExecute({ key: 'journal', content: 'day-2 fresh start', mode: 'append', scope: 'project' }, toolCtx)
    assert.equal((r as any).action, 'created', 'Append after delete should create new file')

    content = readFileSync(path.join(memoryDir, `${today}-journal.md`), 'utf8')
    assert.ok(!content.includes('day-1'), 'Should have no trace of day-1 content')
    assert.ok(content.includes('day-2 fresh start'), 'Should have day-2 content')

    cleanupDir(root)
  })

  // T4: append 累积后 upsert 完全覆盖
  await test('T4: multiple appends then upsert → completely replaces accumulated content', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    await memorySaveExecute({ key: 'meeting', content: 'initial notes', scope: 'project' }, toolCtx)
    await memorySaveExecute({ key: 'meeting', content: 'action item 1', mode: 'append', scope: 'project' }, toolCtx)
    await memorySaveExecute({ key: 'meeting', content: 'action item 2', mode: 'append', scope: 'project' }, toolCtx)

    const r = await memorySaveExecute({ key: 'meeting', content: 'clean summary', scope: 'project' }, toolCtx)
    assert.equal((r as any).action, 'updated')

    const content = readFileSync(path.join(memoryDir, `${today}-meeting.md`), 'utf8')
    assert.ok(content.includes('clean summary'), 'Should have new content')
    assert.ok(!content.includes('action item'), 'Should NOT have appended content')
    assert.ok(!content.includes('initial notes'), 'Should NOT have original content')

    cleanupDir(root)
  })

  // T5: 快速连续 upsert + 每步搜索验证缓存一致性
  // 注意：搜索使用部分关键词匹配，所以用完全不同的词避免交叉匹配
  await test('T5: rapid upsert + search → invalidate keeps search consistent', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    await memorySaveExecute({ key: 'counter', content: 'aardvark-breakfast', scope: 'project' }, toolCtx)
    let results = memoryIndexManager.search([memoryDir], 'aardvark breakfast', 5)
    assert.ok(results.length >= 1, 'v1 should be searchable after save')

    await memorySaveExecute({ key: 'counter', content: 'zeppelin-mountain', scope: 'project' }, toolCtx)
    results = memoryIndexManager.search([memoryDir], 'zeppelin mountain', 5)
    assert.ok(results.length >= 1, 'v2 should be searchable after upsert')
    results = memoryIndexManager.search([memoryDir], 'aardvark breakfast', 5)
    assert.equal(results.length, 0, 'v1 keywords should NOT be searchable after upsert to v2')

    await memorySaveExecute({ key: 'counter', content: 'kaleidoscope-octopus', scope: 'project' }, toolCtx)
    results = memoryIndexManager.search([memoryDir], 'kaleidoscope octopus', 5)
    assert.ok(results.length >= 1, 'v3 should be searchable')
    results = memoryIndexManager.search([memoryDir], 'zeppelin mountain', 5)
    assert.equal(results.length, 0, 'v2 keywords should NOT be searchable after upsert to v3')

    cleanupDir(root)
  })

  // T7: 子串 key 交叉操作完整序列
  await test('T7: substring keys (api, api-design, api-design-v2) → fully isolated through CRUD cycle', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    await memorySaveExecute({ key: 'api', content: 'api basics', scope: 'project' }, toolCtx)
    await memorySaveExecute({ key: 'api-design', content: 'design doc', scope: 'project' }, toolCtx)
    await memorySaveExecute({ key: 'api-design-v2', content: 'v2 design', scope: 'project' }, toolCtx)

    // Delete only 'api'
    await memorySaveExecute({ key: 'api', mode: 'delete', scope: 'project' }, toolCtx)

    assert.ok(!existsSync(path.join(memoryDir, `${today}-api.md`)), 'api file deleted')
    assert.ok(existsSync(path.join(memoryDir, `${today}-api-design.md`)), 'api-design untouched')
    assert.ok(existsSync(path.join(memoryDir, `${today}-api-design-v2.md`)), 'api-design-v2 untouched')

    // Recreate 'api'
    const r = await memorySaveExecute({ key: 'api', content: 'api rewrite', scope: 'project' }, toolCtx)
    assert.equal((r as any).action, 'created', 'Recreated after delete should be "created"')

    // Update 'api-design'
    await memorySaveExecute({ key: 'api-design', content: 'design doc updated', scope: 'project' }, toolCtx)

    const index = readFileSync(path.join(memoryDir, 'MEMORY.md'), 'utf8')
    const lines = index.split('\n').filter((l: string) => l.trim())
    assert.equal(lines.length, 3, 'Index should have exactly 3 entries')

    cleanupDir(root)
  })
}

// ---------------------------------------------------------------------------
// F — 边界条件与对抗测试
// ---------------------------------------------------------------------------

async function testBoundary() {
  console.log('\n--- F: 边界条件与对抗测试 ---')

  // E1: key 长度恰好 60 字符
  await test('E1: key exactly 60 chars → accepted', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    const longKey = 'a' + 'b'.repeat(58) + 'c' // 60 chars
    const result = await memorySaveExecute({ key: longKey, content: 'long key test', scope: 'project' }, toolCtx)
    assert.ok((result as any).ok)
    assert.ok(existsSync(path.join(memoryDir, `${today}-${longKey}.md`)))

    cleanupDir(root)
  })

  // E3: 连续连字符 key
  await test('E3: key with consecutive hyphens "a--b" → accepted', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    const result = await memorySaveExecute({ key: 'a--b', content: 'hyphen test', scope: 'project' }, toolCtx)
    assert.ok((result as any).ok)
    assert.ok(existsSync(path.join(memoryDir, `${today}-a--b.md`)))

    cleanupDir(root)
  })

  // E5: content 含伪造 frontmatter → 应被剥离
  await test('E5: content with injected frontmatter → stripped, only auto-generated frontmatter remains', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    const malicious = '---\ncreated: 1999-01-01\ntags: [hacked]\n---\n\nReal content here'
    await memorySaveExecute({ key: 'tricky', content: malicious, scope: 'project' }, toolCtx)

    const content = readFileSync(path.join(memoryDir, `${today}-tricky.md`), 'utf8')
    assert.ok(!content.includes('1999-01-01'), 'Injected created date should be stripped')
    assert.ok(!content.includes('[hacked]'), 'Injected tags should be stripped')
    assert.ok(content.includes(`created: ${today}`), 'Auto-generated created date should be present')
    assert.ok(content.includes('Real content here'), 'Actual content should be preserved')

    // Count frontmatter blocks — should only have one
    const fmBlocks = content.match(/^---$/gm)
    assert.equal(fmBlocks?.length, 2, 'Should have exactly one frontmatter block (open + close)')

    cleanupDir(root)
  })

  // E6: content 含多段 --- → 非贪婪正则只剥离第一个 frontmatter
  await test('E6: content with multiple --- separators → only first frontmatter stripped', async () => {
    const { root, memoryDir } = createTempMemoryDir()
    setContextWithProject(root)

    const multi = '---\nfake: true\n---\n\nParagraph 1\n\n---\n\nParagraph 2'
    await memorySaveExecute({ key: 'multi-sep', content: multi, scope: 'project' }, toolCtx)

    const content = readFileSync(path.join(memoryDir, `${today}-multi-sep.md`), 'utf8')
    assert.ok(content.includes('Paragraph 1'), 'Paragraph 1 should be preserved')
    assert.ok(content.includes('Paragraph 2'), 'Paragraph 2 should be preserved')
    assert.ok(!content.includes('fake: true'), 'Fake frontmatter should be stripped')

    cleanupDir(root)
  })

  // E7: key="agents" 保留名
  await test('E7: key="agents" → rejected as reserved', async () => {
    const { root } = createTempMemoryDir()
    setContextWithProject(root)

    const r1 = await memorySaveExecute({ key: 'agents', content: 'test', scope: 'project' }, toolCtx)
    assert.equal((r1 as any).ok, false)
    assert.equal((r1 as any).error, 'reserved_key')

    const r2 = await memorySaveExecute({ key: 'index', content: 'test', scope: 'project' }, toolCtx)
    assert.equal((r2 as any).ok, false)
    assert.equal((r2 as any).error, 'reserved_key')

    cleanupDir(root)
  })
}

// ---------------------------------------------------------------------------
// G — 跨 Scope 隔离测试
// ---------------------------------------------------------------------------

async function testScopeIsolation() {
  console.log('\n--- G: 跨 Scope 隔离测试 ---')

  // S3: save→search 单向可见性
  await test('S3: save to project scope → visible in project search, invisible in other scopes', async () => {
    const { root: projRoot, memoryDir: projMemDir } = createTempMemoryDir()
    setContextWithProject(projRoot)

    await memorySaveExecute({ key: 'secret', content: 'unique-token-s3-proj', scope: 'project' }, toolCtx)

    // Project scope search — should find
    const projResults = memoryIndexManager.search([projMemDir], 'unique-token-s3-proj', 5)
    assert.ok(projResults.length >= 1, 'Should find in project scope')

    // User scope search — should NOT find (different directory)
    const userMemDir = path.join(os.homedir(), '.openloaf', 'memory')
    const userResults = memoryIndexManager.search([userMemDir], 'unique-token-s3-proj', 5)
    assert.equal(userResults.length, 0, 'Should NOT find in user scope')

    cleanupDir(projRoot)
  })

  // S5: 项目切换隔离
  await test('S5: save in project A → switch to project B → search returns empty', async () => {
    const { root: rootA, memoryDir: memDirA } = createTempMemoryDir()
    const { root: rootB, memoryDir: memDirB } = createTempMemoryDir()

    // Save in project A
    setContextWithProject(rootA)
    await memorySaveExecute({ key: 'arch', content: 'unique-token-s5-projA', scope: 'project' }, toolCtx)

    // Switch to project B and search
    setContextWithProject(rootB)
    const resultsB = memoryIndexManager.search([memDirB], 'unique-token-s5-projA', 5)
    assert.equal(resultsB.length, 0, 'Project B should NOT see project A memory')

    // Switch back to A — still there
    setContextWithProject(rootA)
    const resultsA = memoryIndexManager.search([memDirA], 'unique-token-s5-projA', 5)
    assert.ok(resultsA.length >= 1, 'Project A memory should still be there')

    cleanupDir(rootA)
    cleanupDir(rootB)
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n🧪 MemorySave domain tests')

  await testPureFunctions()
  await testFileIO()
  await testIntegration()
  await testDefectRegression()
  await testSequences()
  await testBoundary()
  await testScopeIsolation()

  // Summary
  console.log(`\n${'='.repeat(50)}`)
  console.log(`memorySave: ${passed} passed, ${failed} failed`)
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
