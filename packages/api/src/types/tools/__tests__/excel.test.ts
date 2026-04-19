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
 * Excel v2 schema — RED test suite for phase A.
 *
 * Coverage matrix:
 *   - S1..S9   CellSpec: value/formula 互斥、StylePreset 白名单、style 对象、
 *              numberFormat、comment、validation 四种 type。
 *   - I1..I12  ExcelInspect 5 action × 合法/非法输入、range 正则、sheetName 非空。
 *   - M1..M22  ExcelMutate 7 action × 形状校验（create/update/structure/layout/
 *              format-rules/add-chart/add-image/recalc）。
 *   - X1..X3   交叉：action=edit 必须被拒绝；filePath 必须非空；CellSpec 复用
 *              检查（create.sheets[].cells 和 update.cells 同一类型）。
 *
 * 运行：在 apps/server 目录下
 *   node --enable-source-maps --import tsx/esm --import ./scripts/registerMdTextLoader.mjs \
 *     ../../packages/api/src/types/tools/__tests__/excel.test.ts
 */
import assert from 'node:assert/strict'

import {
  CellSpecSchema,
  ExcelInspectInputSchema,
  ExcelMutateInputSchema,
  excelInspectToolDef,
  excelMutateToolDef,
} from '@openloaf/api/types/tools/excel'

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

function assertOk<T>(result: { success: true; data: T } | { success: false; error: unknown }, ctx = ''): asserts result is { success: true; data: T } {
  if (!result.success) {
    throw new Error(`expected parse success${ctx ? ' (' + ctx + ')' : ''}: ${JSON.stringify((result as any).error?.issues ?? result)}`)
  }
}

function assertFail(result: { success: boolean }, ctx = '') {
  if (result.success) {
    throw new Error(`expected parse failure${ctx ? ' (' + ctx + ')' : ''}`)
  }
}

// ---------------------------------------------------------------------------
// S: CellSpec
// ---------------------------------------------------------------------------
console.log('\n[S] CellSpec schema')

await test('S1: value-only cell OK', () => {
  assertOk(CellSpecSchema.safeParse({ value: 'hello' }))
  assertOk(CellSpecSchema.safeParse({ value: 123 }))
  assertOk(CellSpecSchema.safeParse({ value: true }))
  assertOk(CellSpecSchema.safeParse({ value: null }))
})

await test('S2: formula-only cell OK', () => {
  assertOk(CellSpecSchema.safeParse({ formula: '=SUM(A1:A10)' }))
})

await test('S3: value + formula 同时出现 → 拒绝 (VALUE_FORMULA_CONFLICT)', () => {
  assertFail(
    CellSpecSchema.safeParse({ value: 1, formula: '=A1+B1' }),
    'both value and formula must be rejected',
  )
})

await test('S4: empty cell {} OK (用于清空 / 仅改 style)', () => {
  assertOk(CellSpecSchema.safeParse({}))
})

await test('S5: style as StylePreset 白名单', () => {
  for (const preset of ['HEADER', 'TOTAL', 'INPUT', 'ASSUMPTION']) {
    assertOk(CellSpecSchema.safeParse({ value: 1, style: preset }), preset)
  }
  assertFail(CellSpecSchema.safeParse({ value: 1, style: 'MADE_UP_PRESET' }))
})

await test('S6: style as full CellStyle object', () => {
  assertOk(CellSpecSchema.safeParse({
    value: 'X',
    style: {
      font: { family: 'Calibri', size: 11, bold: true, italic: false, color: 'FF0000' },
      fill: 'FFFF00',
      align: 'center',
      verticalAlign: 'middle',
      border: { top: { style: 'thin', color: '000000' } },
      wrap: true,
    },
  }))
})

await test('S7: style.align 非法值被拒', () => {
  assertFail(CellSpecSchema.safeParse({ value: 1, style: { align: 'middle-left' } }))
})

await test('S8: numberFormat + comment 字段', () => {
  assertOk(CellSpecSchema.safeParse({
    value: 1234,
    numberFormat: '¥#,##0;(¥#,##0);-',
    comment: 'source: finance sheet',
  }))
})

await test('S9: validation 四种 type 各自必填字段', () => {
  // list
  assertOk(CellSpecSchema.safeParse({ validation: { type: 'list', values: ['Yes', 'No'] } }))
  assertFail(CellSpecSchema.safeParse({ validation: { type: 'list' } }))
  // date
  assertOk(CellSpecSchema.safeParse({ validation: { type: 'date', min: '2020-01-01', max: '2030-12-31' } }))
  assertOk(CellSpecSchema.safeParse({ validation: { type: 'date' } })) // min/max optional
  // whole / decimal
  assertOk(CellSpecSchema.safeParse({ validation: { type: 'whole', min: 0, max: 100 } }))
  assertOk(CellSpecSchema.safeParse({ validation: { type: 'decimal', min: 0 } }))
  // custom
  assertOk(CellSpecSchema.safeParse({ validation: { type: 'custom', formula: '=A1>0' } }))
  assertFail(CellSpecSchema.safeParse({ validation: { type: 'custom' } }))
  // unknown type
  assertFail(CellSpecSchema.safeParse({ validation: { type: 'regex', pattern: '\\d+' } }))
})

// ---------------------------------------------------------------------------
// I: ExcelInspect
// ---------------------------------------------------------------------------
console.log('\n[I] ExcelInspect schema')

await test('I1: tool def shape', () => {
  assert.equal(excelInspectToolDef.id, 'ExcelInspect')
  assert.equal(excelInspectToolDef.readonly, true)
  assert.equal(excelInspectToolDef.needsApproval, false)
})

await test('I2: action=summary 最小参数', () => {
  assertOk(ExcelInspectInputSchema.safeParse({ action: 'summary', filePath: 'report.xlsx' }))
})

await test('I3: action=read 支持 scope=sheet/range/outline', () => {
  assertOk(ExcelInspectInputSchema.safeParse({
    action: 'read', filePath: 'a.xlsx', scope: 'sheet', sheetName: 'Sheet1',
  }))
  assertOk(ExcelInspectInputSchema.safeParse({
    action: 'read', filePath: 'a.xlsx', scope: 'range', sheetName: 'Sheet1', range: 'A1:C10',
  }))
  assertOk(ExcelInspectInputSchema.safeParse({
    action: 'read', filePath: 'a.xlsx', scope: 'outline',
  }))
  assertFail(ExcelInspectInputSchema.safeParse({
    action: 'read', filePath: 'a.xlsx', scope: 'world',
  }))
})

await test('I4: read.limit + read.all + read.where/groupBy', () => {
  assertOk(ExcelInspectInputSchema.safeParse({
    action: 'read', filePath: 'a.xlsx', scope: 'sheet', sheetName: 'S',
    limit: 100, offset: 50, all: false,
  }))
  assertOk(ExcelInspectInputSchema.safeParse({
    action: 'read', filePath: 'a.xlsx', scope: 'range', sheetName: 'S', range: 'A1:C10',
    where: "col('amount') > 100", groupBy: ['region'],
  }))
})

await test('I5: read.range 格式正则 A1:Z100', () => {
  assertOk(ExcelInspectInputSchema.safeParse({
    action: 'read', filePath: 'a.xlsx', scope: 'range', sheetName: 'S', range: 'A1:Z100',
  }))
  assertOk(ExcelInspectInputSchema.safeParse({
    action: 'read', filePath: 'a.xlsx', scope: 'range', sheetName: 'S', range: 'AA1:ZZ9999',
  }))
  assertFail(ExcelInspectInputSchema.safeParse({
    action: 'read', filePath: 'a.xlsx', scope: 'range', sheetName: 'S', range: 'A1Z100',
  }))
  assertFail(ExcelInspectInputSchema.safeParse({
    action: 'read', filePath: 'a.xlsx', scope: 'range', sheetName: 'S', range: '1A:Z9',
  }))
})

await test('I6: action=tables 最小参数', () => {
  assertOk(ExcelInspectInputSchema.safeParse({ action: 'tables', filePath: 'a.xlsx' }))
})

await test('I7: action=images extractImages 可选', () => {
  assertOk(ExcelInspectInputSchema.safeParse({ action: 'images', filePath: 'a.xlsx' }))
  assertOk(ExcelInspectInputSchema.safeParse({
    action: 'images', filePath: 'a.xlsx', extractImages: true,
  }))
})

await test('I8: action=render 必须有 sheetName', () => {
  assertOk(ExcelInspectInputSchema.safeParse({
    action: 'render', filePath: 'a.xlsx', sheetName: 'Sheet1',
  }))
  assertOk(ExcelInspectInputSchema.safeParse({
    action: 'render', filePath: 'a.xlsx', sheetName: 'Sheet1', range: 'A1:E20', scale: 2,
  }))
})

await test('I9: filePath 不能为空', () => {
  assertFail(ExcelInspectInputSchema.safeParse({ action: 'summary', filePath: '' }))
})

await test('I10: sheetName 在给出时不能为空串', () => {
  assertFail(ExcelInspectInputSchema.safeParse({
    action: 'read', filePath: 'a.xlsx', scope: 'sheet', sheetName: '',
  }))
})

await test('I11: action 非白名单被拒', () => {
  assertFail(ExcelInspectInputSchema.safeParse({ action: 'dump', filePath: 'a.xlsx' }))
})

await test('I12: summary 可选 withRender', () => {
  assertOk(ExcelInspectInputSchema.safeParse({
    action: 'summary', filePath: 'a.xlsx', withRender: true,
  }))
})

// ---------------------------------------------------------------------------
// M: ExcelMutate
// ---------------------------------------------------------------------------
console.log('\n[M] ExcelMutate schema')

await test('M1: tool def shape', () => {
  assert.equal(excelMutateToolDef.id, 'ExcelMutate')
  assert.equal(excelMutateToolDef.needsApproval, true)
})

await test('M2: action=edit 永久砍掉，必须被拒', () => {
  assertFail(ExcelMutateInputSchema.safeParse({
    action: 'edit', filePath: 'a.xlsx', edits: [],
  }))
})

await test('M3: action=create — 多 sheet + cells + formula + chart 一次塞齐', () => {
  assertOk(ExcelMutateInputSchema.safeParse({
    action: 'create',
    filePath: 'q1.xlsx',
    sheets: [
      {
        name: 'Revenue',
        cells: {
          A1: { value: 'Month', style: 'HEADER' },
          B1: { value: 'Sales', style: 'HEADER' },
          A2: { value: '2024-01' },
          B2: { value: 1000, numberFormat: '¥#,##0' },
          B3: { formula: '=SUM(B2:B2)' },
        },
        freeze: { rows: 1, cols: 0 },
      },
      {
        name: 'Summary',
        cells: {
          A1: { formula: "=SUM(Revenue!B2:B2)" },
        },
      },
    ],
    charts: [
      {
        sheetName: 'Summary',
        type: 'bar',
        dataRange: 'Revenue!A1:B2',
        anchor: 'D2',
        title: 'Q1 Sales',
      },
    ],
  }))
})

await test('M4: create.sheets[].name 非空', () => {
  assertFail(ExcelMutateInputSchema.safeParse({
    action: 'create',
    filePath: 'a.xlsx',
    sheets: [{ name: '', cells: {} }],
  }))
})

await test('M5: action=update 单 cell', () => {
  assertOk(ExcelMutateInputSchema.safeParse({
    action: 'update',
    filePath: 'a.xlsx',
    sheetName: 'Sheet1',
    cells: {
      A1: { value: 'Hello', style: 'HEADER' },
    },
  }))
})

await test('M6: update CellSpec 复用：和 create 用同一形状', () => {
  // 同一个 CellSpec 对象喂给 create 和 update 都通过（证明共用类型）
  const cellSpec = {
    value: 42,
    style: { font: { bold: true } as const, fill: 'E0E0E0' },
    numberFormat: '0.00%',
    comment: 'note',
    validation: { type: 'whole', min: 0, max: 100 } as const,
  }
  assertOk(ExcelMutateInputSchema.safeParse({
    action: 'update',
    filePath: 'a.xlsx',
    sheetName: 'S',
    cells: { A1: cellSpec },
  }))
  assertOk(ExcelMutateInputSchema.safeParse({
    action: 'create',
    filePath: 'b.xlsx',
    sheets: [{ name: 'S', cells: { A1: cellSpec } }],
  }))
})

await test('M7: update cells 中 value+formula 互斥', () => {
  assertFail(ExcelMutateInputSchema.safeParse({
    action: 'update',
    filePath: 'a.xlsx',
    sheetName: 'S',
    cells: { A1: { value: 1, formula: '=B1' } },
  }))
})

await test('M8: action=structure 6 合 1', () => {
  for (const op of ['insert', 'delete', 'rename'] as const) {
    for (const target of ['row', 'col', 'sheet'] as const) {
      const params: any = { action: 'structure', filePath: 'a.xlsx', op, target }
      if (target !== 'sheet') params.sheetName = 'S'
      if (op === 'insert') params.at = 3
      if (op === 'delete') params.at = 2
      if (op === 'rename') { params.from = 'Old'; params.to = 'New' }
      assertOk(ExcelMutateInputSchema.safeParse(params), `${op} ${target}`)
    }
  }
})

await test('M9: structure 非法 op/target 被拒', () => {
  assertFail(ExcelMutateInputSchema.safeParse({
    action: 'structure', filePath: 'a.xlsx', op: 'move', target: 'row', sheetName: 'S',
  }))
  assertFail(ExcelMutateInputSchema.safeParse({
    action: 'structure', filePath: 'a.xlsx', op: 'insert', target: 'pixel', sheetName: 'S', at: 0,
  }))
})

await test('M10: action=layout 冻结 + 筛选 + 排序 + 列宽', () => {
  assertOk(ExcelMutateInputSchema.safeParse({
    action: 'layout',
    filePath: 'a.xlsx',
    sheetName: 'S',
    freeze: { rows: 1, cols: 1 },
    autoFilter: { range: 'A1:D100' },
    sort: [{ column: 'B', order: 'desc' }],
    columnWidths: { A: 10, B: 20, C: 30 },
    printArea: 'A1:D50',
  }))
})

await test('M11: action=format-rules 条件格式三种', () => {
  assertOk(ExcelMutateInputSchema.safeParse({
    action: 'format-rules',
    filePath: 'a.xlsx',
    sheetName: 'S',
    rules: [
      { type: 'dataBar', range: 'B2:B100', color: '4472C4' },
      { type: 'colorScale', range: 'C2:C100', min: 'FF0000', mid: 'FFFF00', max: '00FF00' },
      { type: 'formula', range: 'D2:D100', formula: '=D2<0', style: { font: { color: 'FF0000' } } },
    ],
  }))
})

await test('M12: format-rules 非法 type 被拒', () => {
  assertFail(ExcelMutateInputSchema.safeParse({
    action: 'format-rules', filePath: 'a.xlsx', sheetName: 'S',
    rules: [{ type: 'iconSet', range: 'A1:A10' }],
  }))
})

await test('M13: action=add-chart 仅 bar/line/pie', () => {
  for (const type of ['bar', 'line', 'pie'] as const) {
    assertOk(ExcelMutateInputSchema.safeParse({
      action: 'add-chart',
      filePath: 'a.xlsx',
      sheetName: 'S',
      type,
      dataRange: 'A1:B10',
      anchor: 'D2',
    }), type)
  }
  assertFail(ExcelMutateInputSchema.safeParse({
    action: 'add-chart', filePath: 'a.xlsx', sheetName: 'S',
    type: 'radar', dataRange: 'A1:B10', anchor: 'D2',
  }))
  assertFail(ExcelMutateInputSchema.safeParse({
    action: 'add-chart', filePath: 'a.xlsx', sheetName: 'S',
    type: 'scatter', dataRange: 'A1:B10', anchor: 'D2',
  }))
})

await test('M14: action=add-image', () => {
  assertOk(ExcelMutateInputSchema.safeParse({
    action: 'add-image',
    filePath: 'a.xlsx',
    sheetName: 'S',
    source: '/tmp/logo.png',
    anchor: 'E1',
    widthPx: 200,
  }))
  assertOk(ExcelMutateInputSchema.safeParse({
    action: 'add-image',
    filePath: 'a.xlsx',
    sheetName: 'S',
    source: 'https://example.com/logo.png',
    anchor: 'E1',
  }))
})

await test('M15: action=recalc 默认 mode=auto', () => {
  assertOk(ExcelMutateInputSchema.safeParse({
    action: 'recalc', filePath: 'a.xlsx',
  }))
  for (const mode of ['auto', 'simple', 'libreoffice'] as const) {
    assertOk(ExcelMutateInputSchema.safeParse({
      action: 'recalc', filePath: 'a.xlsx', mode,
    }), mode)
  }
  assertFail(ExcelMutateInputSchema.safeParse({
    action: 'recalc', filePath: 'a.xlsx', mode: 'magic',
  }))
})

await test('M16: action=create sheets 至少 1 个', () => {
  assertFail(ExcelMutateInputSchema.safeParse({
    action: 'create', filePath: 'a.xlsx', sheets: [],
  }))
})

await test('M17: update 必须带 sheetName', () => {
  assertFail(ExcelMutateInputSchema.safeParse({
    action: 'update', filePath: 'a.xlsx', cells: { A1: { value: 1 } },
  }))
})

await test('M18: update.cells 的 key 必须是 A1 形式', () => {
  assertFail(ExcelMutateInputSchema.safeParse({
    action: 'update', filePath: 'a.xlsx', sheetName: 'S',
    cells: { '1A': { value: 1 } },
  }))
  assertFail(ExcelMutateInputSchema.safeParse({
    action: 'update', filePath: 'a.xlsx', sheetName: 'S',
    cells: { 'A': { value: 1 } },
  }))
  assertOk(ExcelMutateInputSchema.safeParse({
    action: 'update', filePath: 'a.xlsx', sheetName: 'S',
    cells: { 'AA999': { value: 1 } },
  }))
})

await test('M19: layout.sort.order ∈ asc/desc', () => {
  assertFail(ExcelMutateInputSchema.safeParse({
    action: 'layout', filePath: 'a.xlsx', sheetName: 'S',
    sort: [{ column: 'A', order: 'random' }],
  }))
})

await test('M20: create 支持 validation + comment + conditional format 同批', () => {
  assertOk(ExcelMutateInputSchema.safeParse({
    action: 'create',
    filePath: 'a.xlsx',
    sheets: [{
      name: 'S',
      cells: {
        A1: {
          value: 'Status',
          validation: { type: 'list', values: ['Open', 'Closed'] },
          comment: 'pick one',
        },
      },
      conditionalFormats: [
        { type: 'dataBar', range: 'B2:B100', color: '4472C4' },
      ],
    }],
  }))
})

await test('M21: filePath 不能为空 (所有 action)', () => {
  for (const action of ['create', 'update', 'structure', 'layout', 'format-rules', 'add-chart', 'add-image', 'recalc'] as const) {
    const base: any = { action, filePath: '' }
    // 补必填以绕过其他分支，只检查 filePath
    if (action === 'create') base.sheets = [{ name: 'S', cells: {} }]
    if (action === 'update') { base.sheetName = 'S'; base.cells = {} }
    if (action === 'structure') { base.op = 'insert'; base.target = 'row'; base.sheetName = 'S'; base.at = 0 }
    if (action === 'layout') base.sheetName = 'S'
    if (action === 'format-rules') { base.sheetName = 'S'; base.rules = [] }
    if (action === 'add-chart') { base.sheetName = 'S'; base.type = 'bar'; base.dataRange = 'A1:B2'; base.anchor = 'D1' }
    if (action === 'add-image') { base.sheetName = 'S'; base.source = '/tmp/a.png'; base.anchor = 'A1' }
    assertFail(ExcelMutateInputSchema.safeParse(base), action)
  }
})

await test('M22: 未知 action 被拒', () => {
  assertFail(ExcelMutateInputSchema.safeParse({
    action: 'merge', filePath: 'a.xlsx',
  }))
})

// ---------------------------------------------------------------------------
// X: Cross-cutting
// ---------------------------------------------------------------------------
console.log('\n[X] Cross-cutting')

await test('X1: ExcelInspect action enum 完整 (5 个)', () => {
  const actions = ['summary', 'read', 'tables', 'images', 'render']
  for (const a of actions) {
    const r = ExcelInspectInputSchema.safeParse({ action: a, filePath: 'a.xlsx', sheetName: 'S', scope: 'sheet', range: 'A1:A1' })
    // 形状多余字段不影响解析成功（zod 默认 strip 未知），关键只验证 action 被接受
    // 不同 action 必填字段不同，简化用 union-friendly 的全量参数
    if (!r.success) {
      // render 要 sheetName；read 必须 scope；其他允许
      // 再尝试最小化参数
      const r2 = ExcelInspectInputSchema.safeParse({ action: a, filePath: 'a.xlsx', sheetName: 'S' })
      if (!r2.success) {
        const r3 = ExcelInspectInputSchema.safeParse({ action: a, filePath: 'a.xlsx', scope: 'outline' })
        if (!r3.success) throw new Error(`action ${a} could not be parsed`)
      }
    }
  }
})

await test('X2: ExcelMutate action enum 完整 (7 个, 不含 edit)', () => {
  // 通过 discriminator 构造每个 action 的最小合法输入
  assertOk(ExcelMutateInputSchema.safeParse({ action: 'create', filePath: 'a.xlsx', sheets: [{ name: 'S', cells: {} }] }))
  assertOk(ExcelMutateInputSchema.safeParse({ action: 'update', filePath: 'a.xlsx', sheetName: 'S', cells: {} }))
  assertOk(ExcelMutateInputSchema.safeParse({ action: 'structure', filePath: 'a.xlsx', op: 'insert', target: 'row', sheetName: 'S', at: 0 }))
  assertOk(ExcelMutateInputSchema.safeParse({ action: 'layout', filePath: 'a.xlsx', sheetName: 'S' }))
  assertOk(ExcelMutateInputSchema.safeParse({ action: 'format-rules', filePath: 'a.xlsx', sheetName: 'S', rules: [] }))
  assertOk(ExcelMutateInputSchema.safeParse({ action: 'add-chart', filePath: 'a.xlsx', sheetName: 'S', type: 'bar', dataRange: 'A1:B2', anchor: 'D1' }))
  assertOk(ExcelMutateInputSchema.safeParse({ action: 'add-image', filePath: 'a.xlsx', sheetName: 'S', source: '/tmp/a.png', anchor: 'A1' }))
  assertOk(ExcelMutateInputSchema.safeParse({ action: 'recalc', filePath: 'a.xlsx' }))
})

await test('X3: excelMutateToolDef.parameters === ExcelMutateInputSchema (同源)', () => {
  // 保证 tool def 直接挂 Schema，不再是独立对象
  assert.equal(excelMutateToolDef.parameters, ExcelMutateInputSchema)
  assert.equal(excelInspectToolDef.parameters, ExcelInspectInputSchema)
})

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log('\nFailures:')
  for (const e of errors) console.log('  - ' + e)
  process.exit(1)
}
