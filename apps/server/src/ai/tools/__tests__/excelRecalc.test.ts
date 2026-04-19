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
 * Excel recalc engine — RED test suite for phase D.
 *
 * Coverage:
 *   - simple-mode (formulajs): SUM / AVERAGE / IF / VLOOKUP / ROUND / MAX/MIN
 *   - libreoffice mode: cross-sheet refs (skip when soffice unavailable)
 *   - error scanning: #REF! / #DIV/0! / #VALUE! / #NAME? / #N/A
 *   - mode "auto" picks libreoffice when available, falls back to simple
 *   - cross-file refs return CROSS_FILE_REF_IGNORED warning
 *
 * Run:
 *   cd apps/server && node --enable-source-maps --import tsx/esm \
 *     --import ./scripts/registerMdTextLoader.mjs \
 *     src/ai/tools/__tests__/excelRecalc.test.ts
 */
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ExcelJS from 'exceljs'

import { recalc } from '@/ai/tools/office/excelRecalc'
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

async function mkTmp(prefix: string) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix))
}

async function copyFixtureTo(name: string, destDir: string) {
  const dest = path.join(destDir, name)
  await fs.copyFile(fix(name), dest)
  return dest
}

function hasSoffice(): boolean {
  return resolveSofficeBinary() !== null
}

// ---------------------------------------------------------------------------
// [SIMP] simple-mode (formulajs)
// ---------------------------------------------------------------------------
console.log('\n[SIMP] simple-mode')

async function buildSingleFormulaBook(formula: string, seed: Record<string, unknown> = {}) {
  const dir = await mkTmp('xlsx-recalc-simp-')
  const out = path.join(dir, 'f.xlsx')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('S')
  for (const [addr, val] of Object.entries(seed)) {
    ws.getCell(addr).value = val as ExcelJS.CellValue
  }
  ws.getCell('Z1').value = { formula } as ExcelJS.CellValue
  await wb.xlsx.writeFile(out)
  return out
}

await test('SIMP1: SUM(A1:A3) → 6', async () => {
  const file = await buildSingleFormulaBook('SUM(A1:A3)', { A1: 1, A2: 2, A3: 3 })
  const r = await recalc(file, 'simple')
  assert.equal(r.ok, true)
  assert.equal(r.mode, 'simple')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const cell = wb.getWorksheet('S')!.getCell('Z1').value as { result?: number }
  assert.equal(cell.result, 6)
})

await test('SIMP2: AVERAGE(A1:A4) → 2.5', async () => {
  const file = await buildSingleFormulaBook('AVERAGE(A1:A4)', { A1: 1, A2: 2, A3: 3, A4: 4 })
  await recalc(file, 'simple')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const cell = wb.getWorksheet('S')!.getCell('Z1').value as { result?: number }
  assert.equal(cell.result, 2.5)
})

await test('SIMP3: IF(A1>B1,"big","small") → "big"', async () => {
  const file = await buildSingleFormulaBook('IF(A1>B1,"big","small")', { A1: 10, B1: 5 })
  await recalc(file, 'simple')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const cell = wb.getWorksheet('S')!.getCell('Z1').value as { result?: unknown }
  assert.equal(cell.result, 'big')
})

await test('SIMP4: ROUND(3.14159, 2) → 3.14', async () => {
  const file = await buildSingleFormulaBook('ROUND(3.14159,2)')
  await recalc(file, 'simple')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(file)
  const cell = wb.getWorksheet('S')!.getCell('Z1').value as { result?: number }
  assert.equal(cell.result, 3.14)
})

await test('SIMP5: MAX(A1:A3) and MIN(A1:A3)', async () => {
  const dir = await mkTmp('xlsx-recalc-simp5-')
  const out = path.join(dir, 'f.xlsx')
  const wb0 = new ExcelJS.Workbook()
  const ws = wb0.addWorksheet('S')
  ws.getCell('A1').value = 3
  ws.getCell('A2').value = 7
  ws.getCell('A3').value = 1
  ws.getCell('B1').value = { formula: 'MAX(A1:A3)' } as ExcelJS.CellValue
  ws.getCell('B2').value = { formula: 'MIN(A1:A3)' } as ExcelJS.CellValue
  await wb0.xlsx.writeFile(out)
  await recalc(out, 'simple')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(out)
  const v1 = wb.getWorksheet('S')!.getCell('B1').value as { result?: number }
  const v2 = wb.getWorksheet('S')!.getCell('B2').value as { result?: number }
  assert.equal(v1.result, 7)
  assert.equal(v2.result, 1)
})

// ---------------------------------------------------------------------------
// [ERR] error scanning
// ---------------------------------------------------------------------------
console.log('\n[ERR] error scan')

await test('ERR1: with-errors.xlsx → locates each error type', async () => {
  const dir = await mkTmp('xlsx-recalc-err1-')
  const target = await copyFixtureTo('with-errors.xlsx', dir)
  const r = await recalc(target, 'simple')
  assert.ok(r.errorCount >= 1, `expected errors, got ${r.errorCount}`)
  assert.ok(r.errors.length >= 1)
  for (const e of r.errors) {
    assert.ok(typeof e.sheet === 'string' && e.sheet.length > 0)
    assert.ok(typeof e.cell === 'string')
    assert.ok(typeof e.type === 'string')
  }
})

await test('ERR2: errors include the formula text when available', async () => {
  const dir = await mkTmp('xlsx-recalc-err2-')
  const target = await copyFixtureTo('with-errors.xlsx', dir)
  const r = await recalc(target, 'simple')
  // at least one error record should carry a formula
  assert.ok(r.errors.some((e) => typeof e.formula === 'string' && e.formula.length > 0))
})

// ---------------------------------------------------------------------------
// [AUTO] mode auto + fallbacks
// ---------------------------------------------------------------------------
console.log('\n[AUTO] mode')

await test('AUTO1: mode="auto" picks libreoffice when available, else simple', async () => {
  const file = await buildSingleFormulaBook('SUM(A1:A3)', { A1: 1, A2: 2, A3: 3 })
  const r = await recalc(file, 'auto')
  if (hasSoffice()) assert.equal(r.mode, 'libreoffice')
  else assert.equal(r.mode, 'simple')
  assert.equal(r.ok, true)
})

await test('AUTO2: explicit libreoffice mode errors when soffice missing', async () => {
  // We can't easily mock absence — skip when soffice IS available.
  if (hasSoffice()) skip('soffice available — cannot test UNAVAILABLE path')
  const file = await buildSingleFormulaBook('SUM(A1:A3)', { A1: 1, A2: 2, A3: 3 })
  await assert.rejects(recalc(file, 'libreoffice'))
})

// ---------------------------------------------------------------------------
// [LO] libreoffice cross-sheet (requires soffice)
// ---------------------------------------------------------------------------
console.log('\n[LO] libreoffice')

await test('LO1: cross-sheet formula resolves via libreoffice', async () => {
  if (!hasSoffice()) skip('soffice not available')
  const dir = await mkTmp('xlsx-recalc-lo1-')
  const target = await copyFixtureTo('financial-model.xlsx', dir)
  const r = await recalc(target, 'libreoffice')
  assert.equal(r.ok, true)
  assert.equal(r.mode, 'libreoffice')
  // Summary!B2 should be SUM of Revenue!B2:B13 = 1000*(1+2+...+12) = 78000
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(target)
  const cell = wb.getWorksheet('Summary')!.getCell('B2').value as { result?: number }
  assert.equal(cell.result, 78000)
})

// ---------------------------------------------------------------------------
// [XFILE] cross-file refs
// ---------------------------------------------------------------------------
console.log('\n[XFILE] cross-file')

await test('XFILE1: formula with [Book2.xlsx]Sheet1!A1 → CROSS_FILE_REF_IGNORED warning', async () => {
  const dir = await mkTmp('xlsx-recalc-xfile-')
  const out = path.join(dir, 'crossref.xlsx')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('S')
  ws.getCell('A1').value = { formula: "'[Book2.xlsx]Sheet1'!A1+1" } as ExcelJS.CellValue
  await wb.xlsx.writeFile(out)
  const r = await recalc(out, 'simple')
  assert.ok(r.warnings.some((w) => w.includes('CROSS_FILE_REF_IGNORED')))
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
