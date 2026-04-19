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
 * ExcelInspect engine — RED test suite for phase B.
 *
 * Test matrix (each action ≥ 5 cases):
 *   summary × {empty, simple, with-formulas, with-errors, protected, csv, merged}
 *   read    × {scope=sheet, scope=range, scope=outline, with limit, large 分页}
 *   tables  × {has validations, no tables, merged cells, formulas, csv}
 *   images  × {extractImages true / false, no images}
 *   render  × {single sheet ; with range ; missing soffice}
 *   boundary: missing file, corrupted, wrong extension, csv dispatch.
 *
 * Run:
 *   cd apps/server && node --enable-source-maps --import tsx/esm \
 *     --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/excelInspectEngine.test.ts
 */
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  inspectSummary,
  inspectRead,
  inspectTables,
  inspectImages,
  inspectRender,
  ExcelLibreOfficeUnavailableError,
} from '@/ai/tools/office/excelInspectEngine'
import { resolveSofficeBinary } from '@/ai/tools/office/docxInspectEngine'

const FIX = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  'fixtures/excel',
)
const fix = (name: string) => path.join(FIX, name)

let passed = 0
let failed = 0
let skipped = 0
const errors: string[] = []

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (err: any) {
    if (err?.__skip) {
      skipped++
      console.log(`  - ${name} (skip: ${err.message})`)
      return
    }
    failed++
    const m = err?.message ?? String(err)
    errors.push(`${name}: ${m}`)
    console.log(`  \u2717 ${name}: ${m}`)
  }
}

function skip(reason: string): never {
  const e: any = new Error(reason)
  e.__skip = true
  throw e
}

async function mkTmpDir(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

// ---------------------------------------------------------------------------
// [SUM] summary
// ---------------------------------------------------------------------------
console.log('\n[SUM] inspectSummary')

await test('SUM1: empty.xlsx → 1 sheet, no formulas/charts/errors', async () => {
  const r = await inspectSummary({ filePath: fix('empty.xlsx') })
  assert.equal(r.sheetCount, 1)
  assert.equal(r.hasFormulas, false)
  assert.equal(r.errorCount, 0)
  assert.equal(r.errorSamples.length, 0)
  assert.equal(r.hasCharts, false)
  assert.equal(r.isProtected, false)
})

await test('SUM2: simple-table.xlsx → 1 sheet, 11 rows × 4 cols', async () => {
  const r = await inspectSummary({ filePath: fix('simple-table.xlsx') })
  assert.equal(r.sheetCount, 1)
  assert.equal(r.sheets[0]?.name, 'Sales')
  assert.equal(r.sheets[0]?.rows, 11)
  assert.equal(r.sheets[0]?.cols, 4)
  assert.equal(r.hasFormulas, false)
})

await test('SUM3: with-formulas.xlsx → hasFormulas=true', async () => {
  const r = await inspectSummary({ filePath: fix('with-formulas.xlsx') })
  assert.equal(r.hasFormulas, true)
  assert.ok(r.sheetCount >= 2)
})

await test('SUM4: with-errors.xlsx → errorCount >= 1 and samples ≤ 5', async () => {
  const r = await inspectSummary({ filePath: fix('with-errors.xlsx') })
  assert.ok(r.errorCount >= 1, `expected >=1 errors, got ${r.errorCount}`)
  assert.ok(r.errorSamples.length >= 1)
  assert.ok(r.errorSamples.length <= 5)
  assert.ok(typeof r.errorSamples[0]?.cell === 'string')
  assert.ok(typeof r.errorSamples[0]?.sheet === 'string')
})

await test('SUM5: protected.xlsx → isProtected=true', async () => {
  const r = await inspectSummary({ filePath: fix('protected.xlsx') })
  assert.equal(r.isProtected, true)
})

await test('SUM6: with-merged-cells.xlsx → hasMergedCells=true', async () => {
  const r = await inspectSummary({ filePath: fix('with-merged-cells.xlsx') })
  assert.equal(r.hasMergedCells, true)
})

await test('SUM7: csv-sample.csv → single virtual sheet', async () => {
  const r = await inspectSummary({ filePath: fix('csv-sample.csv') })
  assert.equal(r.sheetCount, 1)
  assert.equal(r.sheets[0]?.rows, 4)
  assert.equal(r.sheets[0]?.cols, 3)
})

await test('SUM8: suggestedNextTool 字符串存在', async () => {
  const r = await inspectSummary({ filePath: fix('with-formulas.xlsx') })
  assert.ok(typeof r.suggestedNextTool === 'string' && r.suggestedNextTool.length > 0)
})

// ---------------------------------------------------------------------------
// [READ] read
// ---------------------------------------------------------------------------
console.log('\n[READ] inspectRead')

await test('READ1: scope=sheet 默认 limit=500', async () => {
  const r = await inspectRead({
    filePath: fix('simple-table.xlsx'),
    scope: 'sheet',
    sheetName: 'Sales',
  })
  assert.equal(r.scope, 'sheet')
  assert.equal(r.totalRows, 11)
  assert.equal(r.rows.length, 11)
})

await test('READ2: scope=range A1:B3', async () => {
  const r = await inspectRead({
    filePath: fix('simple-table.xlsx'),
    scope: 'range',
    sheetName: 'Sales',
    range: 'A1:B3',
  })
  assert.equal(r.scope, 'range')
  assert.equal(r.rows.length, 3)
  assert.equal(r.rows[0]?.length, 2)
  const headerA = r.rows[0]?.[0]
  assert.equal(headerA?.value, 'Region')
})

await test('READ3: scope=outline → 返回 sheet 名单+行列', async () => {
  const r = await inspectRead({
    filePath: fix('financial-model.xlsx'),
    scope: 'outline',
  })
  assert.equal(r.scope, 'outline')
  // outline 语义：rows 不用；totalRows 记总 sheets
  assert.ok(r.totalRows >= 3)
})

await test('READ4: limit 截断 + truncated=true', async () => {
  const r = await inspectRead({
    filePath: fix('large-10k-rows.xlsx'),
    scope: 'sheet',
    sheetName: 'Big',
    limit: 100,
  })
  assert.equal(r.rows.length, 100)
  assert.equal(r.truncated, true)
  assert.equal(r.totalRows, 10_001)
})

await test('READ5: all=true 全量读 (10_001 行)', async () => {
  const r = await inspectRead({
    filePath: fix('large-10k-rows.xlsx'),
    scope: 'sheet',
    sheetName: 'Big',
    all: true,
  })
  assert.equal(r.rows.length, 10_001)
  assert.equal(r.truncated, false)
})

await test('READ6: formula cell 带 formula+computed', async () => {
  const r = await inspectRead({
    filePath: fix('with-formulas.xlsx'),
    scope: 'range',
    sheetName: 'Data',
    range: 'C2:C2',
  })
  const cell = r.rows[0]?.[0]
  assert.ok(cell, 'expected cell')
  assert.equal(typeof cell!.formula, 'string')
})

await test('READ7: offset 分页', async () => {
  const r = await inspectRead({
    filePath: fix('large-10k-rows.xlsx'),
    scope: 'sheet',
    sheetName: 'Big',
    limit: 10,
    offset: 100,
  })
  assert.equal(r.rows.length, 10)
  // row @ offset=100 (0-indexed header + 100 data = idx 100)
  const firstCellValue = r.rows[0]?.[0]?.value as number
  assert.equal(typeof firstCellValue, 'number')
})

// ---------------------------------------------------------------------------
// [TBL] tables
// ---------------------------------------------------------------------------
console.log('\n[TBL] inspectTables')

await test('TBL1: with-validations.xlsx → validations 清单 ≥ 4', async () => {
  const r = await inspectTables({ filePath: fix('with-validations.xlsx') })
  assert.ok(Array.isArray(r.validations))
  assert.ok(r.validations.length >= 4, `got ${r.validations.length} validations`)
})

await test('TBL2: simple-table 无 table 对象 / 无 validation', async () => {
  const r = await inspectTables({ filePath: fix('simple-table.xlsx') })
  assert.equal(r.tables.length, 0)
  assert.equal(r.validations.length, 0)
  assert.equal(r.namedRanges.length, 0)
})

await test('TBL3: financial-model → namedRanges shape present', async () => {
  const r = await inspectTables({ filePath: fix('financial-model.xlsx') })
  assert.ok(Array.isArray(r.namedRanges))
  assert.ok(Array.isArray(r.tables))
})

await test('TBL4: with-merged-cells → tables 空但不崩', async () => {
  const r = await inspectTables({ filePath: fix('with-merged-cells.xlsx') })
  assert.equal(r.tables.length, 0)
})

await test('TBL5: csv-sample → 返回空的 tables/validations', async () => {
  const r = await inspectTables({ filePath: fix('csv-sample.csv') })
  assert.equal(r.tables.length, 0)
  assert.equal(r.validations.length, 0)
})

// ---------------------------------------------------------------------------
// [IMG] images
// ---------------------------------------------------------------------------
console.log('\n[IMG] inspectImages')

await test('IMG1: simple-table.xlsx → 0 images', async () => {
  const tmp = await mkTmpDir('excel-img-')
  const r = await inspectImages({
    filePath: fix('simple-table.xlsx'),
    extractImages: false,
    assetDirAbsPath: tmp,
    assetRelPrefix: 'excel_asset',
  })
  assert.equal(r.images.length, 0)
})

await test('IMG2: extractImages=true 不崩 (无 image 则返回空)', async () => {
  const tmp = await mkTmpDir('excel-img-')
  const r = await inspectImages({
    filePath: fix('simple-table.xlsx'),
    extractImages: true,
    assetDirAbsPath: tmp,
    assetRelPrefix: 'excel_asset',
  })
  assert.equal(r.images.length, 0)
})

await test('IMG3: empty.xlsx 0 images', async () => {
  const tmp = await mkTmpDir('excel-img-')
  const r = await inspectImages({
    filePath: fix('empty.xlsx'),
    assetDirAbsPath: tmp,
    assetRelPrefix: 'x',
  })
  assert.equal(r.images.length, 0)
})

// ---------------------------------------------------------------------------
// [RND] render (libreoffice)
// ---------------------------------------------------------------------------
console.log('\n[RND] inspectRender')

await test('RND1: simple-table.xlsx render 指定 sheet → PNG 文件', async () => {
  if (!resolveSofficeBinary()) skip('soffice not available on host')
  const tmp = await mkTmpDir('excel-render-')
  const r = await inspectRender({
    filePath: fix('simple-table.xlsx'),
    sheetName: 'Sales',
    assetDirAbsPath: tmp,
    assetRelPrefix: 'excel_render',
  })
  assert.ok(Array.isArray(r.pages))
  assert.ok(r.pages.length >= 1, 'expected at least 1 page')
  const first = r.pages[0]!
  assert.ok(first.url.startsWith('excel_render/'))
  // file exists
  const exists = await fs
    .stat(path.join(tmp, path.basename(first.url)))
    .then(() => true)
    .catch(() => false)
  assert.equal(exists, true)
})

await test('RND2: render with range 不崩', async () => {
  if (!resolveSofficeBinary()) skip('soffice not available on host')
  const tmp = await mkTmpDir('excel-render-')
  const r = await inspectRender({
    filePath: fix('simple-table.xlsx'),
    sheetName: 'Sales',
    range: 'A1:D5',
    assetDirAbsPath: tmp,
    assetRelPrefix: 'excel_render',
  })
  assert.ok(r.pages.length >= 1)
})

await test('RND3: soffice 不可用 → ExcelLibreOfficeUnavailableError', async () => {
  // 仅当真的没有 soffice 时才能测；有 soffice 时 skip 这条（语义重复）
  if (resolveSofficeBinary()) skip('soffice is available — cannot test UNAVAILABLE path')
  const tmp = await mkTmpDir('excel-render-')
  let thrown: unknown
  try {
    await inspectRender({
      filePath: fix('simple-table.xlsx'),
      sheetName: 'Sales',
      assetDirAbsPath: tmp,
      assetRelPrefix: 'excel_render',
    })
  } catch (e) {
    thrown = e
  }
  assert.ok(thrown instanceof ExcelLibreOfficeUnavailableError)
})

// ---------------------------------------------------------------------------
// [BND] boundary
// ---------------------------------------------------------------------------
console.log('\n[BND] boundaries')

await test('BND1: 不存在的文件 → 抛错', async () => {
  let thrown: unknown
  try {
    await inspectSummary({ filePath: fix('does-not-exist.xlsx') })
  } catch (e) {
    thrown = e
  }
  assert.ok(thrown instanceof Error, 'expected Error for missing file')
})

await test('BND2: 非 xlsx/csv 扩展名的文件 → 抛错', async () => {
  const tmp = await mkTmpDir('excel-bnd-')
  const badPath = path.join(tmp, 'x.docx')
  await fs.writeFile(badPath, 'not an xlsx')
  let thrown: unknown
  try {
    await inspectSummary({ filePath: badPath })
  } catch (e) {
    thrown = e
  }
  assert.ok(thrown instanceof Error)
})

await test('BND3: corrupted xlsx → 抛错而不是无声绿色', async () => {
  const tmp = await mkTmpDir('excel-bnd-')
  const badPath = path.join(tmp, 'bad.xlsx')
  await fs.writeFile(badPath, Buffer.from([0, 1, 2, 3, 4]))
  let thrown: unknown
  try {
    await inspectSummary({ filePath: badPath })
  } catch (e) {
    thrown = e
  }
  assert.ok(thrown instanceof Error)
})

await test('BND4: csv dispatch 自动走 — read 能读到行', async () => {
  const r = await inspectRead({
    filePath: fix('csv-sample.csv'),
    scope: 'sheet',
    sheetName: 'Sheet1',
  })
  assert.equal(r.totalRows, 4)
  assert.equal(r.rows[0]?.[0]?.value, 'name')
})

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const e of errors) console.log('  - ' + e)
  process.exit(1)
}
