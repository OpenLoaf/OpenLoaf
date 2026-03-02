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
 * toolScope + needsApproval 测试
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/toolScope.test.ts
 *
 * 测试覆盖：
 *   A 层（纯函数）— isTargetOutsideScope
 *   B 层（I/O）  — resolveToolPath（路径解析 + rootLabel）
 *   C 层（集成） — readFileTool / listDirTool / grepFilesTool 的 needsApproval
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { setRequestContext, runWithContext } from '@/ai/shared/context/requestContext'
import { isTargetOutsideScope, resolveToolPath } from '@/ai/tools/toolScope'
import { readFileTool, listDirTool } from '@/ai/tools/fileTools'
import { grepFilesTool } from '@/ai/tools/grepFilesTool'
import { setupE2eTestEnv, E2E_WORKSPACE_ID } from '@/ai/__tests__/helpers/testEnv'

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

/** 以有效 workspaceId 运行函数（完整 E2E 工作区上下文）。 */
function withCtx<T>(fn: () => T | Promise<T>): Promise<T> {
  return runWithContext(
    { sessionId: 'toolscope-test', cookies: {}, workspaceId: E2E_WORKSPACE_ID },
    fn as () => Promise<T>,
  )
}

/** 以空 workspaceId 运行函数（模拟无有效工作区的情况）。 */
function withNoWorkspace<T>(fn: () => T | Promise<T>): Promise<T> {
  return runWithContext(
    { sessionId: 'toolscope-test', cookies: {} },
    fn as () => Promise<T>,
  )
}

/** 读取 tool 上的 needsApproval 并以 input 调用，返回 boolean。 */
function callNeedsApproval(tool: any, input: Record<string, unknown>): boolean {
  const na = tool.needsApproval
  if (typeof na === 'function') return Boolean(na(input))
  return Boolean(na)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Setup：初始化 E2E 环境（workspaces.json + settings.json → 临时目录）
  setupE2eTestEnv()
  // 动态获取实际 workspace root（通过 resolveToolPath 解析 "." 得到）
  const workspaceRoot = await withCtx(() => resolveToolPath({ target: '.' }).absPath)
  // 明确在 workspace 之外的绝对路径
  const outsidePath = os.tmpdir()

  // -----------------------------------------------------------------------
  // A 层：isTargetOutsideScope 纯函数行为
  // -----------------------------------------------------------------------
  console.log('\nA 层 — isTargetOutsideScope')

  await test('无 workspaceId 时不抛出，返回 false', () =>
    withNoWorkspace(() => {
      const result = isTargetOutsideScope('/any/path')
      assert.equal(result, false)
    }),
  )

  await test('workspace 根目录（相对 "."）→ false', () =>
    withCtx(() => assert.equal(isTargetOutsideScope('.'), false)),
  )

  await test('workspace 内相对路径 → false', () =>
    withCtx(() => assert.equal(isTargetOutsideScope('subdir/file.txt'), false)),
  )

  await test('workspace 内绝对路径 → false', () =>
    withCtx(() => {
      const insidePath = path.join(workspaceRoot, 'some-file.txt')
      assert.equal(isTargetOutsideScope(insidePath), false)
    }),
  )

  await test('workspace 外绝对路径（os.tmpdir 同级）→ true', () =>
    withCtx(() => assert.equal(isTargetOutsideScope(outsidePath), true)),
  )

  await test('/etc/hosts（系统路径）→ true', () =>
    withCtx(() => assert.equal(isTargetOutsideScope('/etc/hosts'), true)),
  )

  // -----------------------------------------------------------------------
  // B 层：resolveToolPath 路径解析 + rootLabel
  // -----------------------------------------------------------------------
  console.log('\nB 层 — resolveToolPath')

  await test('相对路径解析为 workspace 内绝对路径', () =>
    withCtx(() => {
      const { absPath } = resolveToolPath({ target: 'notes.txt' })
      assert.equal(absPath, path.join(workspaceRoot, 'notes.txt'))
    }),
  )

  await test('workspace 内路径 rootLabel = "workspace"', () =>
    withCtx(() => {
      const { rootLabel } = resolveToolPath({ target: '.' })
      assert.equal(rootLabel, 'workspace')
    }),
  )

  await test('workspace 外绝对路径 rootLabel = "external"（不抛出）', () =>
    withCtx(() => {
      const { rootLabel, absPath } = resolveToolPath({ target: outsidePath })
      assert.equal(rootLabel, 'external')
      assert.equal(absPath, path.resolve(outsidePath))
    }),
  )

  await test('无 workspaceId 时抛出 Error', () =>
    withNoWorkspace(() => {
      assert.throws(
        () => resolveToolPath({ target: 'file.txt' }),
        /workspaceId is required/,
      )
    }),
  )

  // -----------------------------------------------------------------------
  // C 层：needsApproval 集成（readFileTool / listDirTool / grepFilesTool）
  // -----------------------------------------------------------------------
  console.log('\nC 层 — needsApproval 集成')

  await test('readFileTool: workspace 内相对路径 → needsApproval = false', () =>
    withCtx(() => {
      const result = callNeedsApproval(readFileTool, { actionName: 'test', path: 'readme.md' })
      assert.equal(result, false)
    }),
  )

  await test('readFileTool: workspace 外绝对路径 → needsApproval = true', () =>
    withCtx(() => {
      const result = callNeedsApproval(readFileTool, { actionName: 'test', path: '/etc/hosts' })
      assert.equal(result, true)
    }),
  )

  await test('listDirTool: workspace 内相对路径 → needsApproval = false', () =>
    withCtx(() => {
      const result = callNeedsApproval(listDirTool, { actionName: 'test', path: '.' })
      assert.equal(result, false)
    }),
  )

  await test('listDirTool: workspace 外绝对路径 → needsApproval = true', () =>
    withCtx(() => {
      const result = callNeedsApproval(listDirTool, { actionName: 'test', path: outsidePath })
      assert.equal(result, true)
    }),
  )

  await test('grepFilesTool: 无 path（默认 workspace 根）→ needsApproval = false', () =>
    withCtx(() => {
      const result = callNeedsApproval(grepFilesTool, { actionName: 'test', pattern: 'TODO' })
      assert.equal(result, false)
    }),
  )

  await test('grepFilesTool: workspace 外绝对路径 → needsApproval = true', () =>
    withCtx(() => {
      const result = callNeedsApproval(grepFilesTool, {
        actionName: 'test',
        pattern: 'TODO',
        path: '/etc',
      })
      assert.equal(result, true)
    }),
  )

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
