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
 * ExcelMutate engine — RED test suite for phase C.
 *
 * Matrix (≥ 5 cases per action):
 *   create / update / structure / layout / format-rules / add-chart / add-image
 *   + csv auto-upgrade + error codes (VALUE_FORMULA_CONFLICT / MERGED_CELL_WRITE /
 *     PROTECTED_WORKBOOK / SHEET_NOT_FOUND / RANGE_OUT_OF_BOUNDS / CHART_RANGE_INVALID).
 *
 * Writes go to mktemp dirs — fixtures are NOT mutated.
 *
 * Run:
 *   cd apps/server && node --enable-source-maps --import tsx/esm \
 *     --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/excelEngine.test.ts
 */
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { applyMutate, ExcelMutateError } from '@/ai/tools/office/excelEngine'
import {
  inspectSummary,
  inspectRead,
  inspectTables,
} from '@/ai/tools/office/excelInspectEngine'

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

async function mkTmp(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

async function copyFixtureTo(name: string, destDir: string, destName?: string) {
  const dest = path.join(destDir, destName ?? name)
  await fs.copyFile(fix(name), dest)
  return dest
}

// ---------------------------------------------------------------------------
// [CRE] create
// ---------------------------------------------------------------------------
console.log('\n[CRE] create')

await test('CRE1: create single sheet with literal values', async () => {
  const dir = await mkTmp('xlsx-cre1-')
  const out = path.join(dir, 'out.xlsx')
  const r = await applyMutate({
    action: 'create',
    filePath: out,
    sheets: [
      {
        name: 'S1',
        cells: {
          A1: { value: 'Region' },
          B1: { value: 'Revenue' },
          A2: { value: 'North' },
          B2: { value: 100 },
        },
      },
    ],
  })
  assert.equal(r.ok, true)
  assert.equal(r.action, 'create')
  assert.equal(r.data.filePath, out)
  const read = await inspectRead({ filePath: out, scope: 'sheet', sheetName: 'S1' })
  assert.equal(read.rows[0]?.[0]?.value, 'Region')
  assert.equal(read.rows[1]?.[1]?.value, 100)
})

await test('CRE2: multi-sheet + cross-sheet formula + StylePreset + comment + validation + conditional format', async () => {
  const dir = await mkTmp('xlsx-cre2-')
  const out = path.join(dir, 'financial.xlsx')
  const r = await applyMutate({
    action: 'create',
    filePath: out,
    sheets: [
      {
        name: 'Inputs',
        cells: {
          A1: { value: 'Assumption', style: 'HEADER' },
          B1: { value: 'Value', style: 'HEADER' },
          A2: { value: 'Growth', style: 'ASSUMPTION', comment: '年增长率假设' },
          B2: {
            value: 0.1,
            style: 'INPUT',
            numberFormat: '0.0%',
            validation: { type: 'decimal', min: 0, max: 1 },
          },
        },
        conditionalFormats: [
          { type: 'dataBar', range: 'B2:B2', color: '3B82F6' },
        ],
      },
      {
        name: 'Summary',
        cells: {
          A1: { value: 'Metric', style: 'HEADER' },
          B1: { value: 'Value', style: 'HEADER' },
          A2: { value: 'Projected' },
          B2: { formula: '100*(1+Inputs!B2)', style: 'TOTAL', numberFormat: '¥#,##0' },
        },
      },
    ],
    charts: [
      { sheetName: 'Summary', type: 'bar', dataRange: 'A2:B2', anchor: 'D2', title: 'Proj' },
    ],
  })
  assert.equal(r.ok, true)
  const sum = await inspectSummary({ filePath: out })
  assert.equal(sum.sheetCount, 2)
  assert.equal(sum.hasFormulas, true)
  assert.equal(sum.hasValidations, true)
  const tables = await inspectTables({ filePath: out })
  assert.ok(tables.validations.length >= 1, 'expected ≥1 validation')
})

await test('CRE3: create rejects value+formula conflict in same cell (VALUE_FORMULA_CONFLICT)', async () => {
  const dir = await mkTmp('xlsx-cre3-')
  const out = path.join(dir, 'bad.xlsx')
  await assert.rejects(
    applyMutate({
      action: 'create',
      filePath: out,
      sheets: [{ name: 'S', cells: { A1: { value: 1, formula: 'SUM(B1:B2)' } as any } }],
    }),
    (err: unknown) => err instanceof ExcelMutateError && (err as ExcelMutateError).code === 'VALUE_FORMULA_CONFLICT',
  )
})

await test('CRE4: create with merges + freeze + columnWidths', async () => {
  const dir = await mkTmp('xlsx-cre4-')
  const out = path.join(dir, 'layout.xlsx')
  const r = await applyMutate({
    action: 'create',
    filePath: out,
    sheets: [
      {
        name: 'L',
        cells: {
          A1: { value: 'Header' },
          A2: { value: 1 },
          B2: { value: 2 },
          C2: { value: 3 },
        },
        merges: ['A1:C1'],
        freeze: { rows: 1 },
        columnWidths: { A: 20, B: 15 },
      },
    ],
  })
  assert.equal(r.ok, true)
  const sum = await inspectSummary({ filePath: out })
  assert.equal(sum.hasMergedCells, true)
})

await test('CRE5: csv-style create — .xlsx with single sheet writes xlsx (no upgrade)', async () => {
  const dir = await mkTmp('xlsx-cre5-')
  const out = path.join(dir, 'plain.xlsx')
  const r = await applyMutate({
    action: 'create',
    filePath: out,
    sheets: [{ name: 'Sheet1', cells: { A1: { value: 'a' } } }],
  })
  assert.equal(r.ok, true)
  assert.equal(r.meta?.upgradedFrom, undefined)
})

// ---------------------------------------------------------------------------
// [UPD] update
// ---------------------------------------------------------------------------
console.log('\n[UPD] update')

await test('UPD1: update scalar values in simple-table', async () => {
  const dir = await mkTmp('xlsx-upd1-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const r = await applyMutate({
    action: 'update',
    filePath: target,
    sheetName: 'Sales',
    cells: { E1: { value: 'Margin' }, E2: { value: 0.25 } },
  })
  assert.equal(r.ok, true)
  const read = await inspectRead({ filePath: target, scope: 'range', sheetName: 'Sales', range: 'E1:E2' })
  assert.equal(read.rows[0]?.[0]?.value, 'Margin')
  assert.equal(read.rows[1]?.[0]?.value, 0.25)
})

await test('UPD2: same CellSpec (value+style+comment+validation) works on update as it does on create', async () => {
  const dir = await mkTmp('xlsx-upd2-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const spec = {
    value: 0.1,
    style: 'INPUT' as const,
    numberFormat: '0.0%',
    comment: 'rate assumption',
    validation: { type: 'decimal' as const, min: 0, max: 1 },
  }
  const r = await applyMutate({
    action: 'update',
    filePath: target,
    sheetName: 'Sales',
    cells: { F2: spec },
  })
  assert.equal(r.ok, true)
  const tables = await inspectTables({ filePath: target })
  assert.ok(tables.validations.some((v) => v.cell === 'F2'))
})

await test('UPD3: update writes a formula with numberFormat', async () => {
  const dir = await mkTmp('xlsx-upd3-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const r = await applyMutate({
    action: 'update',
    filePath: target,
    sheetName: 'Sales',
    cells: {
      A12: { value: 'Total' },
      D12: { formula: 'SUM(D2:D11)', style: 'TOTAL', numberFormat: '¥#,##0' },
    },
  })
  assert.equal(r.ok, true)
  const read = await inspectRead({ filePath: target, scope: 'range', sheetName: 'Sales', range: 'D12:D12' })
  assert.equal(read.rows[0]?.[0]?.formula?.toUpperCase().replace(/\s/g, ''), 'SUM(D2:D11)')
})

await test('UPD4: update rejects SHEET_NOT_FOUND', async () => {
  const dir = await mkTmp('xlsx-upd4-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  await assert.rejects(
    applyMutate({
      action: 'update',
      filePath: target,
      sheetName: 'Nope',
      cells: { A1: { value: 1 } },
    }),
    (err: unknown) => err instanceof ExcelMutateError && (err as ExcelMutateError).code === 'SHEET_NOT_FOUND',
  )
})

await test('UPD5: update to non-top-left of merged range → MERGED_CELL_WRITE', async () => {
  const dir = await mkTmp('xlsx-upd5-')
  const target = await copyFixtureTo('with-merged-cells.xlsx', dir)
  // A1:C1 is merged. Writing to B1 (non-top-left) should error.
  await assert.rejects(
    applyMutate({
      action: 'update',
      filePath: target,
      sheetName: 'M',
      cells: { B1: { value: 'x' } },
    }),
    (err: unknown) => err instanceof ExcelMutateError && (err as ExcelMutateError).code === 'MERGED_CELL_WRITE',
  )
})

await test('UPD6: update against protected workbook → PROTECTED_WORKBOOK', async () => {
  const dir = await mkTmp('xlsx-upd6-')
  const target = await copyFixtureTo('protected.xlsx', dir)
  await assert.rejects(
    applyMutate({
      action: 'update',
      filePath: target,
      sheetName: 'P',
      cells: { A3: { value: 'x' } },
    }),
    (err: unknown) => err instanceof ExcelMutateError && (err as ExcelMutateError).code === 'PROTECTED_WORKBOOK',
  )
})

await test('UPD7: CSV auto-upgrade when update introduces a formula', async () => {
  const dir = await mkTmp('xlsx-upd7-')
  const csvPath = await copyFixtureTo('csv-sample.csv', dir)
  const r = await applyMutate({
    action: 'update',
    filePath: csvPath,
    sheetName: 'Sheet1',
    cells: { D1: { value: 'total' }, D2: { formula: 'SUM(B2:B4)' } },
  })
  assert.equal(r.ok, true)
  assert.equal(r.meta?.upgradedFrom, 'csv')
  const newPath = r.data.filePath
  assert.equal(path.extname(newPath), '.xlsx')
  const sum = await inspectSummary({ filePath: newPath })
  assert.equal(sum.hasFormulas, true)
})

// ---------------------------------------------------------------------------
// [STR] structure
// ---------------------------------------------------------------------------
console.log('\n[STR] structure')

await test('STR1: insert row at 3', async () => {
  const dir = await mkTmp('xlsx-str1-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const r = await applyMutate({
    action: 'structure',
    filePath: target,
    op: 'insert',
    target: 'row',
    sheetName: 'Sales',
    at: 3,
    count: 1,
  })
  assert.equal(r.ok, true)
  const read = await inspectRead({ filePath: target, scope: 'range', sheetName: 'Sales', range: 'A3:D3' })
  // after insert, new row 3 should be empty
  const allEmpty = read.rows[0]?.every((c) => c === null || c?.value === undefined || c?.value === null)
  assert.equal(allEmpty, true, 'inserted row should be empty')
})

await test('STR2: delete column B', async () => {
  const dir = await mkTmp('xlsx-str2-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const r = await applyMutate({
    action: 'structure',
    filePath: target,
    op: 'delete',
    target: 'col',
    sheetName: 'Sales',
    at: 2,
    count: 1,
  })
  assert.equal(r.ok, true)
  const read = await inspectRead({ filePath: target, scope: 'range', sheetName: 'Sales', range: 'A1:C1' })
  assert.equal(read.rows[0]?.[0]?.value, 'Region')
  // Originally B was 'Product'; after deleting col B, old C ('Units') shifts to B.
  assert.equal(read.rows[0]?.[1]?.value, 'Units')
})

await test('STR3: rename sheet', async () => {
  const dir = await mkTmp('xlsx-str3-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const r = await applyMutate({
    action: 'structure',
    filePath: target,
    op: 'rename',
    target: 'sheet',
    from: 'Sales',
    to: 'SalesV2',
  })
  assert.equal(r.ok, true)
  const sum = await inspectSummary({ filePath: target })
  assert.ok(sum.sheets.some((s) => s.name === 'SalesV2'))
  assert.ok(!sum.sheets.some((s) => s.name === 'Sales'))
})

await test('STR4: insert new sheet', async () => {
  const dir = await mkTmp('xlsx-str4-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const r = await applyMutate({
    action: 'structure',
    filePath: target,
    op: 'insert',
    target: 'sheet',
    to: 'Extra',
  })
  assert.equal(r.ok, true)
  const sum = await inspectSummary({ filePath: target })
  assert.equal(sum.sheetCount, 2)
  assert.ok(sum.sheets.some((s) => s.name === 'Extra'))
})

await test('STR5: delete sheet', async () => {
  const dir = await mkTmp('xlsx-str5-')
  const target = await copyFixtureTo('with-formulas.xlsx', dir)
  const before = await inspectSummary({ filePath: target })
  const r = await applyMutate({
    action: 'structure',
    filePath: target,
    op: 'delete',
    target: 'sheet',
    sheetName: 'Lookup',
  })
  assert.equal(r.ok, true)
  const after = await inspectSummary({ filePath: target })
  assert.equal(after.sheetCount, before.sheetCount - 1)
  assert.ok(!after.sheets.some((s) => s.name === 'Lookup'))
})

// ---------------------------------------------------------------------------
// [LAY] layout
// ---------------------------------------------------------------------------
console.log('\n[LAY] layout')

await test('LAY1: freeze rows + columnWidths applied', async () => {
  const dir = await mkTmp('xlsx-lay1-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const r = await applyMutate({
    action: 'layout',
    filePath: target,
    sheetName: 'Sales',
    freeze: { rows: 1 },
    columnWidths: { A: 22, B: 18 },
  })
  assert.equal(r.ok, true)
})

await test('LAY2: autoFilter + printArea', async () => {
  const dir = await mkTmp('xlsx-lay2-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const r = await applyMutate({
    action: 'layout',
    filePath: target,
    sheetName: 'Sales',
    autoFilter: { range: 'A1:D11' },
    printArea: 'A1:D11',
  })
  assert.equal(r.ok, true)
})

await test('LAY3: sort rows ascending by numeric column', async () => {
  const dir = await mkTmp('xlsx-lay3-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const r = await applyMutate({
    action: 'layout',
    filePath: target,
    sheetName: 'Sales',
    sort: [{ column: 'C', order: 'asc' }],
  })
  assert.equal(r.ok, true)
  const read = await inspectRead({ filePath: target, scope: 'range', sheetName: 'Sales', range: 'C2:C11' })
  const vals = read.rows.map((row) => row[0]?.value as number)
  const sorted = [...vals].sort((a, b) => a - b)
  assert.deepEqual(vals, sorted)
})

await test('LAY4: rowHeights applied', async () => {
  const dir = await mkTmp('xlsx-lay4-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const r = await applyMutate({
    action: 'layout',
    filePath: target,
    sheetName: 'Sales',
    rowHeights: { '1': 30 },
  })
  assert.equal(r.ok, true)
})

await test('LAY5: SHEET_NOT_FOUND on unknown sheet', async () => {
  const dir = await mkTmp('xlsx-lay5-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  await assert.rejects(
    applyMutate({
      action: 'layout',
      filePath: target,
      sheetName: 'Missing',
      freeze: { rows: 1 },
    }),
    (err: unknown) => err instanceof ExcelMutateError && (err as ExcelMutateError).code === 'SHEET_NOT_FOUND',
  )
})

// ---------------------------------------------------------------------------
// [FMT] format-rules
// ---------------------------------------------------------------------------
console.log('\n[FMT] format-rules')

await test('FMT1: dataBar rule applied', async () => {
  const dir = await mkTmp('xlsx-fmt1-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const r = await applyMutate({
    action: 'format-rules',
    filePath: target,
    sheetName: 'Sales',
    rules: [{ type: 'dataBar', range: 'D2:D11', color: '3B82F6' }],
  })
  assert.equal(r.ok, true)
})

await test('FMT2: colorScale rule applied', async () => {
  const dir = await mkTmp('xlsx-fmt2-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const r = await applyMutate({
    action: 'format-rules',
    filePath: target,
    sheetName: 'Sales',
    rules: [{ type: 'colorScale', range: 'C2:C11', min: 'FFCCCC', max: 'CCFFCC' }],
  })
  assert.equal(r.ok, true)
})

await test('FMT3: formula rule applied', async () => {
  const dir = await mkTmp('xlsx-fmt3-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const r = await applyMutate({
    action: 'format-rules',
    filePath: target,
    sheetName: 'Sales',
    rules: [
      {
        type: 'formula',
        range: 'D2:D11',
        formula: 'D2>200',
        style: { fill: 'FEE2E2' },
      },
    ],
  })
  assert.equal(r.ok, true)
})

await test('FMT4: multiple rules in one call', async () => {
  const dir = await mkTmp('xlsx-fmt4-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const r = await applyMutate({
    action: 'format-rules',
    filePath: target,
    sheetName: 'Sales',
    rules: [
      { type: 'dataBar', range: 'C2:C11' },
      { type: 'colorScale', range: 'D2:D11' },
    ],
  })
  assert.equal(r.ok, true)
})

await test('FMT5: SHEET_NOT_FOUND on unknown sheet', async () => {
  const dir = await mkTmp('xlsx-fmt5-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  await assert.rejects(
    applyMutate({
      action: 'format-rules',
      filePath: target,
      sheetName: 'Nope',
      rules: [{ type: 'dataBar', range: 'A1:A10' }],
    }),
    (err: unknown) => err instanceof ExcelMutateError && (err as ExcelMutateError).code === 'SHEET_NOT_FOUND',
  )
})

// ---------------------------------------------------------------------------
// [CHT] add-chart
// ---------------------------------------------------------------------------
console.log('\n[CHT] add-chart')

async function addChartCase(type: 'bar' | 'line' | 'pie') {
  const dir = await mkTmp(`xlsx-cht-${type}-`)
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const r = await applyMutate({
    action: 'add-chart',
    filePath: target,
    sheetName: 'Sales',
    type,
    dataRange: 'A1:D11',
    anchor: 'F2',
    title: `${type} chart`,
  })
  assert.equal(r.ok, true)
  // roundtrip: reopen and verify persistence by reading back summary
  const sum = await inspectSummary({ filePath: target })
  assert.ok(sum.sheets.length >= 1)
}

await test('CHT1: add bar chart', () => addChartCase('bar'))
await test('CHT2: add line chart', () => addChartCase('line'))
await test('CHT3: add pie chart', () => addChartCase('pie'))

await test('CHT4: CHART_RANGE_INVALID when dataRange out of sheet bounds', async () => {
  const dir = await mkTmp('xlsx-cht4-')
  const target = await copyFixtureTo('empty.xlsx', dir)
  await assert.rejects(
    applyMutate({
      action: 'add-chart',
      filePath: target,
      sheetName: 'Sheet1',
      type: 'bar',
      dataRange: 'A1:B10',
      anchor: 'D2',
    }),
    (err: unknown) => err instanceof ExcelMutateError && (err as ExcelMutateError).code === 'CHART_RANGE_INVALID',
  )
})

await test('CHT5: SHEET_NOT_FOUND when chart target sheet missing', async () => {
  const dir = await mkTmp('xlsx-cht5-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  await assert.rejects(
    applyMutate({
      action: 'add-chart',
      filePath: target,
      sheetName: 'NopeSheet',
      type: 'bar',
      dataRange: 'A1:B2',
      anchor: 'F2',
    }),
    (err: unknown) => err instanceof ExcelMutateError && (err as ExcelMutateError).code === 'SHEET_NOT_FOUND',
  )
})

// ---------------------------------------------------------------------------
// [IMG] add-image
// ---------------------------------------------------------------------------
console.log('\n[IMG] add-image')

// Create a tiny PNG once and reuse.
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da636460600000000600010ac5f0630000000049454e44ae426082',
  'hex',
)

await test('IMG1: add image from local file', async () => {
  const dir = await mkTmp('xlsx-img1-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const imgPath = path.join(dir, 'tiny.png')
  await fs.writeFile(imgPath, TINY_PNG)
  const r = await applyMutate({
    action: 'add-image',
    filePath: target,
    sheetName: 'Sales',
    source: imgPath,
    anchor: 'F2',
  })
  assert.equal(r.ok, true)
})

await test('IMG2: add-image with width/height', async () => {
  const dir = await mkTmp('xlsx-img2-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const imgPath = path.join(dir, 'tiny.png')
  await fs.writeFile(imgPath, TINY_PNG)
  const r = await applyMutate({
    action: 'add-image',
    filePath: target,
    sheetName: 'Sales',
    source: imgPath,
    anchor: 'F2',
    widthPx: 80,
    heightPx: 40,
  })
  assert.equal(r.ok, true)
})

await test('IMG3: SHEET_NOT_FOUND for unknown sheet', async () => {
  const dir = await mkTmp('xlsx-img3-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const imgPath = path.join(dir, 'tiny.png')
  await fs.writeFile(imgPath, TINY_PNG)
  await assert.rejects(
    applyMutate({
      action: 'add-image',
      filePath: target,
      sheetName: 'Nope',
      source: imgPath,
      anchor: 'A1',
    }),
    (err: unknown) => err instanceof ExcelMutateError && (err as ExcelMutateError).code === 'SHEET_NOT_FOUND',
  )
})

await test('IMG4: missing source file raises error', async () => {
  const dir = await mkTmp('xlsx-img4-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  await assert.rejects(
    applyMutate({
      action: 'add-image',
      filePath: target,
      sheetName: 'Sales',
      source: path.join(dir, 'nonexistent.png'),
      anchor: 'F2',
    }),
  )
})

await test('IMG5: add-image persists media in workbook', async () => {
  const dir = await mkTmp('xlsx-img5-')
  const target = await copyFixtureTo('simple-table.xlsx', dir)
  const imgPath = path.join(dir, 'tiny.png')
  await fs.writeFile(imgPath, TINY_PNG)
  await applyMutate({
    action: 'add-image',
    filePath: target,
    sheetName: 'Sales',
    source: imgPath,
    anchor: 'F2',
  })
  // roundtrip: open and ensure workbook media now has ≥1 image
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(target)
  const media = (wb as unknown as { media?: unknown[] }).media ?? []
  assert.ok(media.length >= 1, 'expected ≥1 media entry after add-image')
})

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`)
if (failed > 0) {
  console.error('\nFAILURES:')
  for (const e of errors) console.error(' -', e)
  process.exit(1)
}
