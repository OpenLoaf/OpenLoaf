// @ts-nocheck — AI SDK tool().execute 的泛型在直接调用时有类型推断问题；运行时正确性由本文件覆盖。
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
 * ExcelInspect + ExcelMutate 工具入口单元测试（阶段 E）。
 *
 * 用法：
 *   cd apps/server
 *   node --enable-source-maps --import tsx/esm \
 *     --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/excelTools.test.ts
 *
 * 覆盖层：
 *   I 层 — ExcelInspect 5 个 action 的 happy / error path
 *   M 层 — ExcelMutate 8 个 action 的 happy / error path + recalc 路由
 *   R 层 — needsApproval / path 解析 / zod 校验 / 错误码映射
 *
 * 策略：
 *   - 直接复用 fixtures/excel/*.xlsx（阶段 B/C 已造好）
 *   - create 类用例写入 session asset 目录（resolveCreateTargetPath 行为）
 *   - 错误码断言：对 engine 抛 ExcelMutateError 的场景验证 {ok:false, code}
 *   - zod 校验失败：assert.rejects 匹配 InputValidationError 或 schema 抛出
 */

import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'

import { runWithContext } from '@/ai/shared/context/requestContext'
import { setupE2eTestEnv } from '@/ai/__tests__/helpers/testEnv'
import { excelInspectTool, excelMutateTool } from '@/ai/tools/excelTools'
import { ensureWritableRoot } from '@/ai/tools/toolScope'
import {
  excelInspectToolDef,
  excelMutateToolDef,
} from '@openloaf/api/types/tools/excel'

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

function withCtx<T>(fn: () => T | Promise<T>): Promise<T> {
  return runWithContext(
    { sessionId: 'excel-tools-test', cookies: {} },
    fn as () => Promise<T>,
  )
}

const toolCtx = (id: string) => ({
  toolCallId: id,
  messages: [],
  abortSignal: AbortSignal.abort(),
})

let projectRoot = ''
let testSubDir = ''
const FIX_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  'fixtures/excel',
)

async function setupTestDir() {
  projectRoot = await withCtx(async () => (await ensureWritableRoot()).rootPath)
  testSubDir = `_excel_test_${Date.now()}`
  await fs.mkdir(path.join(projectRoot, testSubDir), { recursive: true })
}

async function cleanupTestDir() {
  await fs
    .rm(path.join(projectRoot, testSubDir), { recursive: true, force: true })
    .catch(() => {})
}

/** 相对 writable root 的绝对路径（create 的写入目标）。 */
function rel(filename: string): string {
  return path.join(projectRoot, testSubDir, filename)
}

/** 把 fixture 复制到 writable root 下便于 mutate 测试就地修改。 */
async function copyFixture(fxName: string, relName?: string): Promise<string> {
  const src = path.join(FIX_DIR, fxName)
  const dst = rel(relName ?? fxName)
  await fs.copyFile(src, dst)
  return dst
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  setupE2eTestEnv()
  await setupTestDir()

  // ========================================================================
  // R 层 — 注册元信息 / 路径解析 / zod 校验
  // ========================================================================
  console.log('\nR 层 — 元信息 + 路径 + schema')

  await test('R1: excelInspectTool needsApproval=false, excelMutateTool needsApproval=true', () => {
    assert.equal(excelInspectToolDef.needsApproval, false)
    assert.equal(excelMutateToolDef.needsApproval, true)
    assert.equal(excelInspectToolDef.id, 'ExcelInspect')
    assert.equal(excelMutateToolDef.id, 'ExcelMutate')
  })

  await test('R2: Inspect 的 filePath 相对路径能 resolve 到 session asset dir', async () => {
    // 先在 session asset 下落一个文件，再用文件名（相对路径）访问
    const absPath = await copyFixture('simple-table.xlsx', 'r2.xlsx')
    assert.ok(absPath.includes(testSubDir))
    const r = (await withCtx(() =>
      excelInspectTool.execute(
        { action: 'summary', filePath: absPath },
        toolCtx('r2'),
      ),
    )) as { ok: boolean; data: Record<string, unknown> }
    assert.equal(r.ok, true)
    assert.equal(r.data.action, 'summary')
  })

  await test('R3: Mutate zod 校验失败（CellSpec 同传 value+formula）→ InputValidationError', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          excelMutateTool.execute(
            {
              action: 'update',
              filePath: rel('r3.xlsx'),
              sheetName: 'Sheet1',
              cells: { A1: { value: 1, formula: '=1' } },
            },
            toolCtx('r3'),
          ),
        ),
      /VALUE_FORMULA_CONFLICT|InputValidation|value and formula/i,
    )
  })

  await test('R4: Inspect zod 校验失败（scope=range 少 range）', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          excelInspectTool.execute(
            {
              action: 'read',
              filePath: rel('r4.xlsx'),
              scope: 'range',
              sheetName: 'Sheet1',
            },
            toolCtx('r4'),
          ),
        ),
      /range is required|InputValidation/i,
    )
  })

  // ========================================================================
  // I 层 — ExcelInspect 5 个 action
  // ========================================================================
  console.log('\nI 层 — ExcelInspect 5 action')

  await test('I1: summary(happy) — simple-table.xlsx', async () => {
    const abs = await copyFixture('simple-table.xlsx', 'i1.xlsx')
    const r = (await withCtx(() =>
      excelInspectTool.execute(
        { action: 'summary', filePath: abs },
        toolCtx('i1'),
      ),
    )) as { ok: boolean; data: Record<string, unknown> }
    assert.equal(r.ok, true)
    assert.equal(r.data.action, 'summary')
    assert.equal(typeof r.data.sheetCount, 'number')
    assert.ok(Array.isArray(r.data.sheets))
    assert.equal(typeof r.data.hasFormulas, 'boolean')
  })

  await test('I2: summary(error) — 文件不存在 → ok:false 或 throw', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          excelInspectTool.execute(
            { action: 'summary', filePath: rel('does-not-exist.xlsx') },
            toolCtx('i2'),
          ),
        ),
    )
  })

  await test('I3: read(scope=sheet,happy) — simple-table.xlsx', async () => {
    const abs = await copyFixture('simple-table.xlsx', 'i3.xlsx')
    const r = (await withCtx(() =>
      excelInspectTool.execute(
        {
          action: 'read',
          filePath: abs,
          scope: 'sheet',
          sheetName: 'Sheet1',
        },
        toolCtx('i3'),
      ),
    )) as { ok: boolean; data: { rows: unknown[][] } }
    assert.equal(r.ok, true)
    assert.ok(Array.isArray(r.data.rows))
  })

  await test('I4: read(error) — SHEET_NOT_FOUND 映射为 ok:false / throw', async () => {
    const abs = await copyFixture('simple-table.xlsx', 'i4.xlsx')
    let errored = false
    try {
      const r = (await withCtx(() =>
        excelInspectTool.execute(
          {
            action: 'read',
            filePath: abs,
            scope: 'sheet',
            sheetName: 'NoSuchSheet',
          },
          toolCtx('i4'),
        ),
      )) as { ok?: boolean }
      if (r && r.ok === false) errored = true
    } catch {
      errored = true
    }
    assert.ok(errored, 'should surface SHEET_NOT_FOUND either as throw or ok:false')
  })

  await test('I5: tables(happy) — with-validations.xlsx', async () => {
    const abs = await copyFixture('with-validations.xlsx', 'i5.xlsx')
    const r = (await withCtx(() =>
      excelInspectTool.execute(
        { action: 'tables', filePath: abs },
        toolCtx('i5'),
      ),
    )) as { ok: boolean; data: Record<string, unknown> }
    assert.equal(r.ok, true)
    assert.equal(r.data.action, 'tables')
  })

  await test('I6: images(happy) — with-charts.xlsx（无 image 也应返回空数组）', async () => {
    const abs = await copyFixture('with-charts.xlsx', 'i6.xlsx')
    const r = (await withCtx(() =>
      excelInspectTool.execute(
        { action: 'images', filePath: abs },
        toolCtx('i6'),
      ),
    )) as { ok: boolean; data: { images: unknown[] } }
    assert.equal(r.ok, true)
    assert.ok(Array.isArray(r.data.images))
  })

  await test('I7: render — 无 libreoffice 报 LIBREOFFICE_UNAVAILABLE 或成功', async () => {
    const abs = await copyFixture('simple-table.xlsx', 'i7.xlsx')
    let finalOk: boolean | undefined
    let finalCode: string | undefined
    try {
      const r = (await withCtx(() =>
        excelInspectTool.execute(
          { action: 'render', filePath: abs, sheetName: 'Sheet1' },
          toolCtx('i7'),
        ),
      )) as { ok: boolean; code?: string }
      finalOk = r.ok
      finalCode = r.code
    } catch (err: any) {
      finalCode = err?.code ?? err?.message
    }
    // 允许两种结果：本机装了 soffice 就绿；没装则 ok:false + LIBREOFFICE_UNAVAILABLE
    if (finalOk !== true) {
      assert.match(
        String(finalCode ?? ''),
        /LIBREOFFICE_UNAVAILABLE/,
      )
    }
  })

  // ========================================================================
  // M 层 — ExcelMutate 8 action
  // ========================================================================
  console.log('\nM 层 — ExcelMutate 8 action')

  await test('M1: create(happy) — 生成新 workbook', async () => {
    const filePath = rel('m1.xlsx')
    const r = (await withCtx(() =>
      excelMutateTool.execute(
        {
          action: 'create',
          filePath,
          sheets: [
            {
              name: 'Sheet1',
              cells: {
                A1: { value: 'Name' },
                B1: { value: 'Score' },
                A2: { value: 'Alice' },
                B2: { value: 95 },
              },
            },
          ],
        },
        toolCtx('m1'),
      ),
    )) as { ok: boolean; data: { filePath: string } }
    assert.equal(r.ok, true)
    const stat = await fs.stat(r.data.filePath)
    assert.ok(stat.size > 0)
  })

  await test('M2: create(error) — SHEET_NOT_FOUND / STRUCTURE（空 sheets 数组 → schema 拒绝）', async () => {
    await assert.rejects(
      () =>
        withCtx(() =>
          excelMutateTool.execute(
            { action: 'create', filePath: rel('m2.xlsx'), sheets: [] },
            toolCtx('m2'),
          ),
        ),
    )
  })

  await test('M3: update(happy) — 改 B2=500 → read 回来验证', async () => {
    const abs = await copyFixture('simple-table.xlsx', 'm3.xlsx')
    const up = (await withCtx(() =>
      excelMutateTool.execute(
        {
          action: 'update',
          filePath: abs,
          sheetName: 'Sheet1',
          cells: { B2: { value: 500 } },
        },
        toolCtx('m3u'),
      ),
    )) as { ok: boolean }
    assert.equal(up.ok, true)
    const rd = (await withCtx(() =>
      excelInspectTool.execute(
        {
          action: 'read',
          filePath: abs,
          scope: 'range',
          sheetName: 'Sheet1',
          range: 'B2:B2',
        },
        toolCtx('m3r'),
      ),
    )) as { data: { rows: Array<Array<{ value?: unknown } | null>> } }
    const cell = rd.data.rows[0]?.[0]
    assert.equal(cell?.value, 500)
  })

  await test('M4: update(error) — SHEET_NOT_FOUND 映射到 {ok:false,code}', async () => {
    const abs = await copyFixture('simple-table.xlsx', 'm4.xlsx')
    const r = (await withCtx(() =>
      excelMutateTool.execute(
        {
          action: 'update',
          filePath: abs,
          sheetName: 'NoSuch',
          cells: { A1: { value: 1 } },
        },
        toolCtx('m4'),
      ),
    )) as { ok: boolean; code?: string }
    assert.equal(r.ok, false)
    assert.match(String(r.code ?? ''), /SHEET_NOT_FOUND/)
  })

  await test('M5: structure(happy) — insert row', async () => {
    const abs = await copyFixture('simple-table.xlsx', 'm5.xlsx')
    const r = (await withCtx(() =>
      excelMutateTool.execute(
        {
          action: 'structure',
          filePath: abs,
          op: 'insert',
          target: 'row',
          sheetName: 'Sheet1',
          at: 2,
          count: 1,
        },
        toolCtx('m5'),
      ),
    )) as { ok: boolean }
    assert.equal(r.ok, true)
  })

  await test('M6: structure(error) — STRUCTURE_OP_INVALID（rename 缺 from/to）', async () => {
    const abs = await copyFixture('simple-table.xlsx', 'm6.xlsx')
    // schema 不强制 from/to 必填，引擎层会抛；tool 应映射 ok:false+code
    const r = (await withCtx(() =>
      excelMutateTool.execute(
        {
          action: 'structure',
          filePath: abs,
          op: 'rename',
          target: 'sheet',
        },
        toolCtx('m6'),
      ),
    )) as { ok: boolean; code?: string }
    assert.equal(r.ok, false)
    assert.match(String(r.code ?? ''), /STRUCTURE_OP_INVALID/)
  })

  await test('M7: layout(happy) — 冻结首行', async () => {
    const abs = await copyFixture('simple-table.xlsx', 'm7.xlsx')
    const r = (await withCtx(() =>
      excelMutateTool.execute(
        {
          action: 'layout',
          filePath: abs,
          sheetName: 'Sheet1',
          freeze: { rows: 1 },
        },
        toolCtx('m7'),
      ),
    )) as { ok: boolean }
    assert.equal(r.ok, true)
  })

  await test('M8: format-rules(happy) — dataBar', async () => {
    const abs = await copyFixture('simple-table.xlsx', 'm8.xlsx')
    const r = (await withCtx(() =>
      excelMutateTool.execute(
        {
          action: 'format-rules',
          filePath: abs,
          sheetName: 'Sheet1',
          rules: [{ type: 'dataBar', range: 'B2:B10' }],
        },
        toolCtx('m8'),
      ),
    )) as { ok: boolean }
    assert.equal(r.ok, true)
  })

  await test('M9: add-chart(happy) — bar 图', async () => {
    const abs = await copyFixture('simple-table.xlsx', 'm9.xlsx')
    const r = (await withCtx(() =>
      excelMutateTool.execute(
        {
          action: 'add-chart',
          filePath: abs,
          sheetName: 'Sheet1',
          type: 'bar',
          dataRange: 'A1:B3',
          anchor: 'D2',
          title: 'demo',
        },
        toolCtx('m9'),
      ),
    )) as { ok: boolean }
    assert.equal(r.ok, true)
  })

  await test('M10: add-chart(error) — CHART_RANGE_INVALID（dataRange 指向不存在的 sheet）', async () => {
    const abs = await copyFixture('simple-table.xlsx', 'm10.xlsx')
    const r = (await withCtx(() =>
      excelMutateTool.execute(
        {
          action: 'add-chart',
          filePath: abs,
          sheetName: 'Sheet1',
          type: 'bar',
          dataRange: 'Nope!A1:B3',
          anchor: 'D2',
        },
        toolCtx('m10'),
      ),
    )) as { ok: boolean; code?: string }
    assert.equal(r.ok, false)
    assert.match(String(r.code ?? ''), /CHART_RANGE_INVALID/)
  })

  await test('M11: recalc 必须路由到 excelRecalc.recalc（不走 applyMutate）', async () => {
    const abs = await copyFixture('with-formulas.xlsx', 'm11.xlsx')
    // 若错误走 applyMutate，会抛 STRUCTURE_OP_INVALID ("recalc must be dispatched through ...")
    // 正确走 recalc() 时返回 {ok, mode, errorCount, errors}
    const r = (await withCtx(() =>
      excelMutateTool.execute(
        { action: 'recalc', filePath: abs, mode: 'simple' },
        toolCtx('m11'),
      ),
    )) as { ok: boolean; data: Record<string, unknown>; code?: string }
    // 允许 ok:true（算成功）或 ok:false(FORMULA_ERRORS_FOUND / LIBREOFFICE_UNAVAILABLE)
    if (r.ok) {
      assert.ok(
        'mode' in (r.data ?? {}) || 'errorCount' in (r.data ?? {}),
        'recalc 成功时 data 应含 mode/errorCount',
      )
    } else {
      assert.match(
        String(r.code ?? ''),
        /FORMULA_ERRORS_FOUND|LIBREOFFICE_UNAVAILABLE/,
      )
    }
    // 绝对不能泄漏 STRUCTURE_OP_INVALID（那是 applyMutate 兜底错误，说明路由错了）
    assert.ok(
      !/STRUCTURE_OP_INVALID/.test(String(r.code ?? '')),
      'recalc 不能走 applyMutate',
    )
  })

  // Cleanup
  await cleanupTestDir()

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
