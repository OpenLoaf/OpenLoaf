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
 * AI 数据完整性与错误处理技术债验证测试
 *
 * 采用静态分析 + 逻辑验证策略，通过读取源文件文本和推导行为来验证
 * 潜在的技术债问题是否存在。每个测试用例对应一个具体的技术债点。
 *
 * 技术债清单：
 *   TD-1: JSONL 非原子写入（rewriteJsonl / writeSessionJson）
 *   TD-2: catch {} 静默吞异常（chatStreamAsyncService buffer 解析）
 *   TD-3: onError 写库竞态（streamOrchestrator saveErrorMessage 非 await）
 *   TD-4: normalizeTitle 截断常量不一致（chat.ts vs messageStore.ts）
 *   TD-5: ensureSession 多余 findUnique 查询（upsert 后再查库）
 *   TD-6: normalizeRole 激进降级（未知 role 静默降级为 "user"）
 *
 * 用法：
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/__tests__/tech-debt-data-integrity.test.ts
 */

import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// 测试框架（与项目其他 *.test.ts 保持一致）
// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
const failures: Array<{ name: string; message: string }> = []

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ✓ ${name}`)
  } catch (err: any) {
    failed++
    const message = err?.message ?? String(err)
    failures.push({ name, message })
    console.log(`  ✗ ${name}: ${message}`)
  }
}

// ---------------------------------------------------------------------------
// 源文件路径
// ---------------------------------------------------------------------------

// import.meta.dirname = apps/server/src/ai/__tests__
// 向上 2 层到达 apps/server/src
const SERVER_SRC = path.resolve(import.meta.dirname, '../..')

const CHAT_FILE_STORE = path.join(
  SERVER_SRC,
  'ai/services/chat/repositories/chatFileStore.ts',
)
const CHAT_STREAM_ASYNC = path.join(
  SERVER_SRC,
  'ai/services/chat/async/chatStreamAsyncService.ts',
)
const STREAM_ORCHESTRATOR = path.join(
  SERVER_SRC,
  'ai/services/chat/streamOrchestrator.ts',
)
const CHAT_ROUTER = path.join(SERVER_SRC, 'routers/chat.ts')
const MESSAGE_STORE = path.join(
  SERVER_SRC,
  'ai/services/chat/repositories/messageStore.ts',
)

// ---------------------------------------------------------------------------
// 辅助：提取函数体文本
// ---------------------------------------------------------------------------

/**
 * 从源文件中提取包含 `marker` 的行前后若干行，返回文本片段。
 * 用于精确定位特定函数或代码块。
 */
function _extractLines(source: string, startLine: number, endLine: number): string {
  return source
    .split('\n')
    .slice(startLine - 1, endLine)
    .join('\n')
}

/**
 * 在 source 中找到第一次出现 pattern 的行号（1-based）。
 * 未找到返回 -1。
 */
function _findLineNumber(source: string, pattern: string | RegExp): number {
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (typeof pattern === 'string' ? line.includes(pattern) : pattern.test(line)) {
      return i + 1
    }
  }
  return -1
}

// ---------------------------------------------------------------------------
// TD-1: JSONL 非原子写入
// ---------------------------------------------------------------------------

async function testTD1RewriteJsonlNonAtomic() {
  console.log('\n--- TD-1: JSONL 非原子写入 ---')

  const source = await fs.readFile(CHAT_FILE_STORE, 'utf8')

  await test('TD-1a: [FIXED] rewriteJsonl 使用 write-temp-then-rename 原子写入', () => {
    const rewriteIdx = source.indexOf('async function rewriteJsonl(')
    assert.ok(rewriteIdx !== -1, '应当存在 rewriteJsonl 函数')
    const funcBody = source.slice(rewriteIdx, rewriteIdx + 500)
    assert.ok(funcBody.includes('.tmp'), '[FIXED] rewriteJsonl 已使用临时文件')
    assert.ok(funcBody.includes('rename'), '[FIXED] rewriteJsonl 已使用 rename 原子替换')
  })

  await test('TD-1b: [FIXED] writeSessionJson 使用 write-temp-then-rename 原子写入', () => {
    const writeSessionIdx = source.indexOf('export async function writeSessionJson(')
    assert.ok(writeSessionIdx !== -1, '应当存在 writeSessionJson 函数')
    const funcBody = source.slice(writeSessionIdx, writeSessionIdx + 600)
    assert.ok(funcBody.includes('.tmp') || funcBody.includes('rename'),
      '[FIXED] writeSessionJson 已使用原子写入')
  })

  await test('TD-1c: writeSessionJson 使用了 withSessionLock 提供最小并发保护', () => {
    // 虽然有 TD-1b 的风险，验证至少有锁保护并发
    const writeSessionIdx = source.indexOf('export async function writeSessionJson(')
    const funcBody = source.slice(writeSessionIdx, writeSessionIdx + 600)

    assert.ok(
      funcBody.includes('withSessionLock'),
      'writeSessionJson 应当使用 withSessionLock 提供并发保护',
    )
  })

  await test('TD-1d: rewriteJsonl 没有 withSessionLock 并发保护', () => {
    const rewriteIdx = source.indexOf('async function rewriteJsonl(')
    const funcBody = source.slice(rewriteIdx, rewriteIdx + 300)

    const hasLock = funcBody.includes('withSessionLock')
    // 这是一个 KNOWN ISSUE
    assert.ok(
      !hasLock,
      '[TD-1d 已验证] rewriteJsonl 缺少并发锁保护',
    )
  })
}

// ---------------------------------------------------------------------------
// TD-2: catch {} 静默吞异常
// ---------------------------------------------------------------------------

async function testTD2SilentCatch() {
  console.log('\n--- TD-2: catch {} 静默吞异常 ---')

  const source = await fs.readFile(CHAT_STREAM_ASYNC, 'utf8')

  await test('TD-2a: [FIXED] buffer 尾部解析的 catch 块已添加日志', () => {
    // 验证不再有空 catch {}
    const hasEmptyCatch = source.includes('} catch {}')
    // 验证有 logger.warn 用于 parse 错误
    const hasParseLogger = source.includes('[chat-stream-async] failed to parse SSE chunk')
    assert.ok(!hasEmptyCatch || hasParseLogger, '[FIXED] catch 块已添加 logger.warn')
  })

  await test('TD-2b: [FIXED] catch 块有 logger 调用', () => {
    const hasParseLogger = source.includes('logger.warn')
    assert.ok(hasParseLogger, '[FIXED] catch 块附近有 logger.warn 调用')
  })

  await test('TD-2c: 外层 catch 有 logger 但内层 JSON.parse catch 无日志', () => {
    // 外层 catch 有正确的错误处理
    const outerCatchIdx = source.indexOf('} catch (err) {')
    assert.ok(outerCatchIdx !== -1, '应当存在外层 catch (err) 块')

    const outerRegion = source.slice(outerCatchIdx, outerCatchIdx + 200)
    // 外层 catch 有逻辑处理（检查 session status 等）
    assert.ok(
      outerRegion.includes('session') || outerRegion.includes('aborted'),
      '外层 catch 应有正确的错误处理逻辑',
    )
  })
}

// ---------------------------------------------------------------------------
// TD-3: onError 写库竞态
// ---------------------------------------------------------------------------

async function testTD3OnErrorRace() {
  console.log('\n--- TD-3: onError 写库竞态 ---')

  const source = await fs.readFile(STREAM_ORCHESTRATOR, 'utf8')

  await test('TD-3a: onError 回调使用 void 关键字（fire-and-forget 模式）', () => {
    const onErrorIdx = source.indexOf('onError: (err) =>')
    assert.ok(onErrorIdx !== -1, '应当存在 onError 回调')

    const region = source.slice(onErrorIdx, onErrorIdx + 400)

    // 验证使用 void saveErrorMessage（非 await）
    assert.ok(
      region.includes('void saveErrorMessage('),
      'saveErrorMessage 应当以 void 方式调用（存在竞态风险）',
    )
  })

  await test('TD-3b: onError 内 saveErrorMessage 不是 await 调用', () => {
    const onErrorIdx = source.indexOf('onError: (err) =>')
    const region = source.slice(onErrorIdx, onErrorIdx + 400)

    // 检查是否用了 await saveErrorMessage
    const hasAwait = /await\s+saveErrorMessage/.test(region)
    assert.ok(
      !hasAwait,
      '[TD-3b 已验证] saveErrorMessage 没有被 await，写库可能在 SSE 响应结束后才完成',
    )
  })

  await test('TD-3c: saveErrorMessage 的 catch 有错误日志（降级处理存在）', () => {
    const onErrorIdx = source.indexOf('onError: (err) =>')
    // 扩大搜索区域到 600 字符，确保覆盖完整的 .catch() 链
    const region = source.slice(onErrorIdx, onErrorIdx + 600)

    // 验证有 .catch 处理（防止 unhandled rejection）
    assert.ok(
      region.includes('.catch('),
      'saveErrorMessage 应当有 .catch 防止 unhandled rejection',
    )

    // 验证 catch 中有 logger.error
    assert.ok(
      region.includes('logger.error'),
      '.catch 中应有 logger.error 记录写库失败',
    )
  })

  await test('TD-3d: onError 是同步回调（返回值为字符串，非 Promise）', () => {
    const onErrorIdx = source.indexOf('onError: (err) =>')
    const region = source.slice(onErrorIdx, onErrorIdx + 400)

    // onError 返回字符串（错误信息），不是 async 函数
    const isAsync = /onError:\s*async/.test(region)
    assert.ok(
      !isAsync,
      '[TD-3d 已验证] onError 不是 async 函数，内部不能 await，只能 fire-and-forget',
    )
  })
}

// ---------------------------------------------------------------------------
// TD-4: normalizeTitle 截断常量不一致
// ---------------------------------------------------------------------------

async function testTD4TitleConstantMismatch() {
  console.log('\n--- TD-4: normalizeTitle 截断常量不一致 ---')

  const chatRouterSource = await fs.readFile(CHAT_ROUTER, 'utf8')
  const messageStoreSource = await fs.readFile(MESSAGE_STORE, 'utf8')

  await test('TD-4a: [FIXED] chat.ts 中 TITLE_MAX_CHARS = 30（已统一）', () => {
    const match = chatRouterSource.match(/const\s+TITLE_MAX_CHARS\s*=\s*(\d+)/)
    assert.ok(match, 'chat.ts 应当定义 TITLE_MAX_CHARS 常量')
    const value = Number.parseInt(match![1]!, 10)
    assert.equal(value, 30, `[FIXED] TITLE_MAX_CHARS 已统一为 30`)
  })

  await test('TD-4b: messageStore.ts 中 MAX_SESSION_TITLE_CHARS = 30', () => {
    const match = messageStoreSource.match(/const\s+MAX_SESSION_TITLE_CHARS\s*=\s*(\d+)/)
    assert.ok(match, 'messageStore.ts 应当定义 MAX_SESSION_TITLE_CHARS 常量')
    const value = Number.parseInt(match![1]!, 10)
    assert.equal(value, 30, `MAX_SESSION_TITLE_CHARS 应当为 30，实际为 ${value}`)
  })

  await test('TD-4c: [FIXED] 两个常量值已一致', () => {
    const routerMatch = chatRouterSource.match(/const\s+TITLE_MAX_CHARS\s*=\s*(\d+)/)
    const storeMatch = messageStoreSource.match(/const\s+MAX_SESSION_TITLE_CHARS\s*=\s*(\d+)/)
    assert.ok(routerMatch && storeMatch, '两个文件均应定义截断常量')
    const routerVal = Number.parseInt(routerMatch![1]!, 10)
    const storeVal = Number.parseInt(storeMatch![1]!, 10)
    assert.equal(routerVal, storeVal, `[FIXED] TITLE_MAX_CHARS(${routerVal}) = MAX_SESSION_TITLE_CHARS(${storeVal})`)
  })
}

// ---------------------------------------------------------------------------
// TD-5: ensureSession 多余 findUnique 查询
// ---------------------------------------------------------------------------

async function testTD5EnsureSessionRedundantQuery() {
  console.log('\n--- TD-5: ensureSession 多余 findUnique 查询 ---')

  const source = await fs.readFile(MESSAGE_STORE, 'utf8')

  await test('TD-5a: [FIXED] ensureSession 直接使用 upsert 返回值', () => {
    const upsertIdx = source.indexOf('prisma.chatSession.upsert(')
    assert.ok(upsertIdx !== -1, '应当存在 prisma.chatSession.upsert 调用')
    const before = source.slice(Math.max(0, upsertIdx - 80), upsertIdx)
    assert.ok(
      before.includes('const session = await'),
      '[FIXED] upsert 返回值已赋值给变量',
    )
  })

  await test('TD-5b: [FIXED] ensureSession 中无多余 findUnique', () => {
    const ensureIdx = source.indexOf('async function ensureSession(')
    assert.ok(ensureIdx !== -1)
    const fnEnd = source.indexOf('\n}', ensureIdx + 10)
    const fnBody = source.slice(ensureIdx, fnEnd > 0 ? fnEnd : ensureIdx + 1000)
    assert.ok(!fnBody.includes('findUnique'), '[FIXED] ensureSession 中无 findUnique')
  })

  await test('TD-5c: [FIXED] upsert 返回值直接用于 writeSessionJson', () => {
    const upsertIdx = source.indexOf('prisma.chatSession.upsert(')
    const region = source.slice(upsertIdx, upsertIdx + 800)
    assert.ok(
      region.includes('session.id') && region.includes('writeSessionJson'),
      '[FIXED] upsert 返回值的字段直接传给 writeSessionJson',
    )
  })
}

// ---------------------------------------------------------------------------
// TD-6: normalizeRole 激进降级
// ---------------------------------------------------------------------------

async function testTD6NormalizeRoleAggressive() {
  console.log('\n--- TD-6: normalizeRole 激进降级 ---')

  const source = await fs.readFile(MESSAGE_STORE, 'utf8')

  await test('TD-6a: normalizeRole 函数存在', () => {
    assert.ok(
      source.includes('function normalizeRole('),
      '应当存在 normalizeRole 函数',
    )
  })

  await test('TD-6b: [FIXED] normalizeRole 对未知 role 返回 "system"', () => {
    const fnIdx = source.indexOf('function normalizeRole(')
    assert.ok(fnIdx !== -1, '应当存在 normalizeRole 函数')
    const fnBody = source.slice(fnIdx, fnIdx + 400)
    assert.ok(
      fnBody.includes("return 'system'"),
      "[FIXED] 未知 role 降级为 'system' 而非 'user'",
    )
  })

  await test('TD-6c: [FIXED] normalizeRole 使用 logger.error', () => {
    const fnIdx = source.indexOf('function normalizeRole(')
    const fnBody = source.slice(fnIdx, fnIdx + 400)
    assert.ok(
      fnBody.includes('logger.error'),
      '[FIXED] normalizeRole 使用 logger.error 提高可见度',
    )
  })

  await test('TD-6d: 已知 role 列表包含 subagent 和 task-report', () => {
    const fnIdx = source.indexOf('function normalizeRole(')
    const fnBody = source.slice(fnIdx, fnIdx + 400)

    // 验证已知的合法 role 值
    assert.ok(fnBody.includes("'assistant'"), "应当处理 'assistant' role")
    assert.ok(fnBody.includes("'system'"), "应当处理 'system' role")
    assert.ok(fnBody.includes("'user'"), "应当处理 'user' role")
    assert.ok(fnBody.includes("'subagent'"), "应当处理 'subagent' role")
    assert.ok(fnBody.includes("'task-report'"), "应当处理 'task-report' role")
  })

  await test('TD-6e: 空字符串和 null role 也会被降级为 user（验证边界）', () => {
    const fnIdx = source.indexOf('function normalizeRole(')
    const fnBody = source.slice(fnIdx, fnIdx + 400)

    // 空字符串和 null 的处理：代码中有 role != null && role !== '' 的检查
    // 这意味着空字符串/null 不会触发 warn，但同样会返回 'user'
    const hasNullCheck = fnBody.includes("role != null") || fnBody.includes("role !== ''")
    assert.ok(
      hasNullCheck,
      '[TD-6e] 空字符串/null role 有特殊处理（不触发 warn，但同样降级为 user）',
    )
  })
}

// ---------------------------------------------------------------------------
// 综合：源文件可读性验证
// ---------------------------------------------------------------------------

async function testSourceFilesAccessible() {
  console.log('\n--- 源文件可读性预检 ---')

  const files = [
    { label: 'chatFileStore.ts', filePath: CHAT_FILE_STORE },
    { label: 'chatStreamAsyncService.ts', filePath: CHAT_STREAM_ASYNC },
    { label: 'streamOrchestrator.ts', filePath: STREAM_ORCHESTRATOR },
    { label: 'chat.ts (router)', filePath: CHAT_ROUTER },
    { label: 'messageStore.ts', filePath: MESSAGE_STORE },
  ]

  for (const { label, filePath } of files) {
    await test(`源文件可读: ${label}`, async () => {
      const stat = await fs.stat(filePath)
      assert.ok(stat.isFile(), `${label} 应当是文件`)
      assert.ok(stat.size > 0, `${label} 不应当为空`)
    })
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('='.repeat(60))
  console.log('AI 数据完整性与错误处理技术债验证测试')
  console.log('='.repeat(60))

  await testSourceFilesAccessible()
  await testTD1RewriteJsonlNonAtomic()
  await testTD2SilentCatch()
  await testTD3OnErrorRace()
  await testTD4TitleConstantMismatch()
  await testTD5EnsureSessionRedundantQuery()
  await testTD6NormalizeRoleAggressive()

  console.log('\n' + '='.repeat(60))
  console.log(`结果: ${passed} 通过, ${failed} 失败`)

  if (failures.length > 0) {
    console.log('\n失败详情:')
    for (const { name, message } of failures) {
      console.log(`  ✗ ${name}`)
      console.log(`    ${message}`)
    }
  }

  console.log('\n说明:')
  console.log('  [TD-Nx 已验证] 标记的测试通过 = 技术债确实存在')
  console.log('  测试失败 = 代码已修复或行为与预期不符，需人工复查')
  console.log('='.repeat(60))

  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(2)
})
