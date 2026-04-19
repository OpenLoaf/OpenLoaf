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
 * Generate Excel fixtures for ExcelInspect engine tests.
 *
 * Produces 11 files under
 *   apps/server/src/ai/tools/__tests__/fixtures/excel/
 *
 *   empty.xlsx               — one empty sheet
 *   simple-table.xlsx        — 4-col header + 10 rows, no formulas
 *   financial-model.xlsx     — Revenue / Cost / Summary with cross-sheet formulas
 *   with-formulas.xlsx       — SUM / AVERAGE / IF / VLOOKUP examples
 *   with-errors.xlsx         — seeded #REF! / #DIV/0! / #VALUE! cells
 *   with-charts.xlsx         — bar chart on top of simple table
 *   with-validations.xlsx    — list / date / whole / decimal / custom validations
 *   with-merged-cells.xlsx   — A1:C1 merged header
 *   protected.xlsx           — sheet-level protection enabled
 *   large-10k-rows.xlsx      — 10_001 rows for pagination tests
 *   csv-sample.csv           — small UTF-8 CSV
 *
 * Run once from apps/server:
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     scripts/generate-excel-fixtures.ts
 *
 * The committed fixtures are deterministic for tests; re-run after schema changes.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import ExcelJS from 'exceljs'

const outDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../src/ai/tools/__tests__/fixtures/excel',
)

async function ensureDir() {
  await fs.mkdir(outDir, { recursive: true })
}

function outPath(name: string) {
  return path.join(outDir, name)
}

// ---------------------------------------------------------------------------
// 1. empty.xlsx
// ---------------------------------------------------------------------------
async function genEmpty() {
  const wb = new ExcelJS.Workbook()
  wb.addWorksheet('Sheet1')
  await wb.xlsx.writeFile(outPath('empty.xlsx'))
}

// ---------------------------------------------------------------------------
// 2. simple-table.xlsx
// ---------------------------------------------------------------------------
async function genSimple() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sales')
  ws.addRow(['Region', 'Product', 'Units', 'Revenue'])
  const rows = [
    ['North', 'A', 10, 100],
    ['North', 'B', 20, 250],
    ['South', 'A', 15, 150],
    ['South', 'B', 30, 360],
    ['East', 'A', 8, 80],
    ['East', 'B', 12, 144],
    ['West', 'A', 22, 220],
    ['West', 'B', 25, 300],
    ['North', 'C', 5, 60],
    ['South', 'C', 7, 90],
  ]
  for (const r of rows) ws.addRow(r)
  await wb.xlsx.writeFile(outPath('simple-table.xlsx'))
}

// ---------------------------------------------------------------------------
// 3. financial-model.xlsx
// ---------------------------------------------------------------------------
async function genFinancial() {
  const wb = new ExcelJS.Workbook()
  const rev = wb.addWorksheet('Revenue')
  rev.addRow(['Month', 'Amount'])
  for (let i = 1; i <= 12; i++) rev.addRow([`2024-${String(i).padStart(2, '0')}`, 1000 * i])
  const cost = wb.addWorksheet('Cost')
  cost.addRow(['Month', 'Amount'])
  for (let i = 1; i <= 12; i++) cost.addRow([`2024-${String(i).padStart(2, '0')}`, 400 * i])
  const sum = wb.addWorksheet('Summary')
  sum.addRow(['Metric', 'Value'])
  sum.addRow(['Total Revenue', { formula: 'SUM(Revenue!B2:B13)' }])
  sum.addRow(['Total Cost', { formula: 'SUM(Cost!B2:B13)' }])
  sum.addRow(['Gross Profit', { formula: 'B2-B3' }])
  await wb.xlsx.writeFile(outPath('financial-model.xlsx'))
}

// ---------------------------------------------------------------------------
// 4. with-formulas.xlsx
// ---------------------------------------------------------------------------
async function genFormulas() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Data')
  ws.addRow(['A', 'B', 'C'])
  ws.addRow([10, 20, { formula: 'A2+B2' }])
  ws.addRow([5, 15, { formula: 'A3*B3' }])
  ws.addRow([8, 12, { formula: 'IF(A4>B4,"big","small")' }])
  ws.addRow(['Total', null, { formula: 'SUM(C2:C4)' }])
  ws.addRow(['Avg', null, { formula: 'AVERAGE(A2:A4)' }])
  const lk = wb.addWorksheet('Lookup')
  lk.addRow(['Key', 'Value'])
  lk.addRow(['alpha', 100])
  lk.addRow(['beta', 200])
  const out = wb.addWorksheet('Out')
  out.addRow(['Q', 'Result'])
  out.addRow(['alpha', { formula: 'VLOOKUP(A2,Lookup!A:B,2,FALSE)' }])
  out.addRow(['beta', { formula: 'VLOOKUP(A3,Lookup!A:B,2,FALSE)' }])
  await wb.xlsx.writeFile(outPath('with-formulas.xlsx'))
}

// ---------------------------------------------------------------------------
// 5. with-errors.xlsx  — seed #REF! / #DIV/0! / #VALUE! / #NAME?
// ---------------------------------------------------------------------------
async function genErrors() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Bad')
  ws.addRow(['Label', 'Formula'])
  // #DIV/0!
  ws.addRow(['div0', { formula: '1/0' }])
  // #VALUE! — summing a text
  ws.addRow(['value', { formula: '"abc"+1' }])
  // #NAME?
  ws.addRow(['name', { formula: 'NOTAFUNC(1)' }])
  // #REF! — write directly as cached error so inspect.errorCount catches it
  const refCell = ws.getCell('B5')
  refCell.value = { formula: 'A99999', result: { error: '#REF!' } } as unknown as ExcelJS.CellValue
  ws.getCell('A5').value = 'ref'
  await wb.xlsx.writeFile(outPath('with-errors.xlsx'))
}

// ---------------------------------------------------------------------------
// 6. with-charts.xlsx  — we stick to writing a simple table; chart object
//    creation via exceljs is flaky, so the fixture intentionally has NO chart
//    wired up. Tests on this fixture check the "no-chart" branch. A separate
//    positive chart fixture is generated by the engine tests themselves using
//    the ExcelMutate.create path (phase C).
// ---------------------------------------------------------------------------
async function genCharts() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Data')
  ws.addRow(['Month', 'Revenue'])
  for (let i = 1; i <= 6; i++) ws.addRow([`M${i}`, 100 * i])
  // Mark metadata to signal "should have a chart but exceljs fixture cannot".
  wb.description = 'intended-has-charts'
  await wb.xlsx.writeFile(outPath('with-charts.xlsx'))
}

// ---------------------------------------------------------------------------
// 7. with-validations.xlsx
// ---------------------------------------------------------------------------
async function genValidations() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('V')
  ws.addRow(['Status', 'Date', 'Qty', 'Rate', 'Custom'])
  ws.addRow(['Open', new Date('2024-01-01'), 10, 0.5, 1])
  ws.getCell('A2').dataValidation = {
    type: 'list',
    allowBlank: true,
    formulae: ['"Open,Closed"'],
  }
  ws.getCell('B2').dataValidation = {
    type: 'date',
    operator: 'between',
    formulae: [new Date('2020-01-01'), new Date('2030-12-31')],
  }
  ws.getCell('C2').dataValidation = {
    type: 'whole',
    operator: 'between',
    formulae: [0, 100],
  }
  ws.getCell('D2').dataValidation = {
    type: 'decimal',
    operator: 'between',
    formulae: [0, 1],
  }
  ws.getCell('E2').dataValidation = {
    type: 'custom',
    formulae: ['E2>0'],
  }
  await wb.xlsx.writeFile(outPath('with-validations.xlsx'))
}

// ---------------------------------------------------------------------------
// 8. with-merged-cells.xlsx
// ---------------------------------------------------------------------------
async function genMerged() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('M')
  ws.addRow(['Merged Header', '', '', 'Side'])
  ws.addRow(['a', 'b', 'c', 'd'])
  ws.mergeCells('A1:C1')
  await wb.xlsx.writeFile(outPath('with-merged-cells.xlsx'))
}

// ---------------------------------------------------------------------------
// 9. protected.xlsx
// ---------------------------------------------------------------------------
async function genProtected() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('P')
  ws.addRow(['locked', 'content'])
  await ws.protect('test-password', {
    selectLockedCells: true,
    selectUnlockedCells: true,
  })
  await wb.xlsx.writeFile(outPath('protected.xlsx'))
}

// ---------------------------------------------------------------------------
// 10. large-10k-rows.xlsx
// ---------------------------------------------------------------------------
async function genLarge() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Big')
  ws.addRow(['idx', 'value'])
  for (let i = 1; i <= 10_000; i++) ws.addRow([i, i * 2])
  await wb.xlsx.writeFile(outPath('large-10k-rows.xlsx'))
}

// ---------------------------------------------------------------------------
// 11. csv-sample.csv
// ---------------------------------------------------------------------------
async function genCsv() {
  const body =
    'name,age,score\n' +
    'Alice,30,95.5\n' +
    'Bob,25,82.3\n' +
    'Chen,28,77.0\n'
  await fs.writeFile(outPath('csv-sample.csv'), body, 'utf8')
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  await ensureDir()
  await Promise.all([
    genEmpty(),
    genSimple(),
    genFinancial(),
    genFormulas(),
    genErrors(),
    genCharts(),
    genValidations(),
    genMerged(),
    genProtected(),
    genLarge(),
    genCsv(),
  ])
  const files = (await fs.readdir(outDir)).sort()
  console.log('Generated fixtures in', outDir)
  for (const f of files) console.log('  -', f)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
