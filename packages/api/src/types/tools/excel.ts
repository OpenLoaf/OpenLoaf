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
 * Excel v2 tool schemas.
 *
 * Design overview:
 *   - `ExcelInspect` (readonly, no approval) with 5 actions:
 *       summary | read | tables | images | render
 *   - `ExcelMutate`  (write, needsApproval=true) with 7 actions:
 *       create | update | structure | layout | format-rules | add-chart |
 *       add-image | recalc
 *   - `CellSpec` is a SHARED cell shape consumed by both `create` (under
 *     `sheets[].cells`) and `update` (under `cells`). The same CellSpec object
 *     is valid in both contexts — this is enforced by tests.
 *
 * The `edit` action from excel v1 is intentionally dropped. Any attempt to
 * pass `action: "edit"` MUST be rejected by zod (covered by tests).
 *
 * Style rules:
 *   - Discriminated union on `action`, mirroring `word.ts`.
 *   - Prefer explicit enums over free-form strings so the model sees the
 *     allowed values up-front in the JSON schema.
 *   - CellSpec re-uses the same zod schema for both create and update paths.
 */
import { z } from 'zod'
import { jsonArrayPreprocess, stringBoolPreprocess, stringNumberPreprocess } from './office'

/** boolean field that accepts "true"/"false"/"1"/"0" strings from LLMs. */
const coercedBool = () => z.preprocess(stringBoolPreprocess, z.boolean())
/** non-negative int that accepts stringified numbers. */
const coercedNonNegInt = () => z.preprocess(stringNumberPreprocess, z.number().int().min(0))
/** positive int that accepts stringified numbers. */
const coercedPosInt = () => z.preprocess(stringNumberPreprocess, z.number().int().positive())
/** positive number (can be decimal) that accepts stringified numbers. */
const coercedPosNumber = () => z.preprocess(stringNumberPreprocess, z.number().positive())

// ---------------------------------------------------------------------------
// CellSpec — shared cell shape (create + update)
// ---------------------------------------------------------------------------

const hexColorSchema = z
  .string()
  .regex(/^[0-9A-Fa-f]{6}$/, 'hex RGB without #, e.g. "FF0000"')

const borderEdgeSchema = z.object({
  style: z.enum(['thin', 'medium', 'thick', 'dashed', 'dotted', 'double', 'none']).optional(),
  color: hexColorSchema.optional(),
})

const borderSpecSchema = z.object({
  top: borderEdgeSchema.optional(),
  bottom: borderEdgeSchema.optional(),
  left: borderEdgeSchema.optional(),
  right: borderEdgeSchema.optional(),
})

const cellFontSchema = z.object({
  family: z.string().optional(),
  size: z.number().positive().optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  color: hexColorSchema.optional(),
})

const cellStyleObjectSchema = z.object({
  font: cellFontSchema.optional(),
  fill: hexColorSchema.optional().describe('Solid background color (hex RGB without #).'),
  align: z.enum(['left', 'center', 'right']).optional(),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  border: borderSpecSchema.optional(),
  wrap: z.boolean().optional(),
})

/**
 * StylePreset: small curated set of financial-model primitives. Engines
 * MUST map each preset to a concrete `CellStyle` at write time. Unknown
 * preset strings are rejected by zod.
 */
const stylePresetSchema = z.enum(['HEADER', 'TOTAL', 'INPUT', 'ASSUMPTION'])

export type StylePreset = z.infer<typeof stylePresetSchema>

const validationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('list'), values: z.array(z.string()).min(1) }),
  z.object({
    type: z.literal('date'),
    min: z.string().optional(),
    max: z.string().optional(),
  }),
  z.object({
    type: z.literal('whole'),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.object({
    type: z.literal('decimal'),
    min: z.number().optional(),
    max: z.number().optional(),
  }),
  z.object({ type: z.literal('custom'), formula: z.string().min(1) }),
])

/**
 * CellSpec — the single cell shape used by BOTH `create` and `update`.
 *
 * Fields:
 *   - value    — literal cell value (string / number / boolean / null)
 *   - formula  — "=SUM(...)" — mutually exclusive with `value`
 *   - style    — either a StylePreset string or a full CellStyle object
 *   - numberFormat — Excel number format string, e.g. "¥#,##0"
 *   - comment  — cell comment body
 *   - validation — data validation rule
 *
 * An empty object `{}` is valid — consumers may emit it to clear a cell
 * or to apply only meta changes later.
 */
export const CellSpecSchema = z
  .object({
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    formula: z.string().optional(),
    style: z.union([stylePresetSchema, cellStyleObjectSchema]).optional(),
    numberFormat: z.string().optional(),
    comment: z.string().optional(),
    validation: validationSchema.optional(),
  })
  .refine((v) => !(v.value !== undefined && v.formula !== undefined), {
    message: 'VALUE_FORMULA_CONFLICT: value and formula are mutually exclusive; pick one.',
    path: ['value'],
  })

export type CellSpec = z.infer<typeof CellSpecSchema>
export type CellStyleObject = z.infer<typeof cellStyleObjectSchema>
export type Validation = z.infer<typeof validationSchema>
export type BorderSpec = z.infer<typeof borderSpecSchema>

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** A1-style cell ref like `A1`, `AA99`, `ZZ9999`. */
const cellRefSchema = z
  .string()
  .regex(/^[A-Z]+[1-9][0-9]*$/, 'A1-style cell ref like "A1" or "AA99"')

/** A1:B2 style range. */
const rangeSchema = z
  .string()
  .regex(
    /^[A-Z]+[1-9][0-9]*:[A-Z]+[1-9][0-9]*$/,
    'A1:B2 style range, e.g. "A1:Z100"',
  )

/** Cross-sheet range like `Sheet1!A1:B2` or plain `A1:B2`. */
const chartRangeSchema = z.string().regex(
  /^(?:[^!]+!)?[A-Z]+[1-9][0-9]*:[A-Z]+[1-9][0-9]*$/,
  'A1:B2 or Sheet1!A1:B2 style range',
)

const sheetNameSchema = z.string().min(1, 'sheetName must be non-empty')
const filePathSchema = z.string().min(1, 'filePath must be non-empty')

/** Cells bag: `{ "A1": CellSpec, "B2": CellSpec, ... }`. */
const cellsBagSchema = z.record(cellRefSchema, CellSpecSchema)

// ---------------------------------------------------------------------------
// Sheet spec (used by create)
// ---------------------------------------------------------------------------

const conditionalFormatRuleSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('dataBar'),
    range: rangeSchema,
    color: hexColorSchema.optional(),
  }),
  z.object({
    type: z.literal('colorScale'),
    range: rangeSchema,
    min: hexColorSchema.optional(),
    mid: hexColorSchema.optional(),
    max: hexColorSchema.optional(),
  }),
  z.object({
    type: z.literal('formula'),
    range: rangeSchema,
    formula: z.string().min(1),
    style: cellStyleObjectSchema.optional(),
  }),
])

const sheetSpecSchema = z.object({
  name: sheetNameSchema,
  cells: cellsBagSchema.default({}),
  merges: z.array(rangeSchema).optional(),
  freeze: z
    .object({
      rows: coercedNonNegInt().optional(),
      cols: coercedNonNegInt().optional(),
    })
    .optional(),
  columnWidths: z.record(z.string(), coercedPosNumber()).optional(),
  conditionalFormats: z.array(conditionalFormatRuleSchema).optional(),
})

const chartSpecSchema = z.object({
  sheetName: sheetNameSchema,
  type: z.enum(['bar', 'line', 'pie']),
  dataRange: chartRangeSchema,
  anchor: cellRefSchema,
  title: z.string().optional(),
})

const imageSpecSchema = z.object({
  sheetName: sheetNameSchema,
  source: z.string().min(1),
  anchor: cellRefSchema,
  widthPx: coercedPosNumber().optional(),
  heightPx: coercedPosNumber().optional(),
})

// ---------------------------------------------------------------------------
// ExcelInspect
// ---------------------------------------------------------------------------

const inspectSummarySchema = z.object({
  action: z.literal('summary'),
  filePath: filePathSchema,
  withRender: coercedBool().optional(),
})

const inspectReadSchema = z
  .object({
    action: z.literal('read'),
    filePath: filePathSchema,
    scope: z.enum(['sheet', 'range', 'outline']),
    sheetName: sheetNameSchema.optional(),
    range: rangeSchema.optional(),
    limit: coercedPosInt().optional(),
    offset: coercedNonNegInt().optional(),
    all: coercedBool().optional(),
    where: z.string().optional(),
    groupBy: z.preprocess(jsonArrayPreprocess, z.array(z.string()).optional()),
  })
  .refine(
    (v) => (v.scope === 'outline' ? true : !!v.sheetName),
    { message: 'sheetName is required for scope=sheet|range', path: ['sheetName'] },
  )
  .refine(
    (v) => (v.scope === 'range' ? !!v.range : true),
    { message: 'range is required for scope=range', path: ['range'] },
  )

const inspectTablesSchema = z.object({
  action: z.literal('tables'),
  filePath: filePathSchema,
  sheetName: sheetNameSchema.optional(),
})

const inspectImagesSchema = z.object({
  action: z.literal('images'),
  filePath: filePathSchema,
  extractImages: coercedBool().optional(),
})

const inspectRenderSchema = z.object({
  action: z.literal('render'),
  filePath: filePathSchema,
  sheetName: sheetNameSchema,
  range: rangeSchema.optional(),
  scale: z.preprocess(stringNumberPreprocess, z.number().positive().max(6).optional()),
})

export const ExcelInspectInputSchema = z.discriminatedUnion('action', [
  inspectSummarySchema,
  inspectReadSchema,
  inspectTablesSchema,
  inspectImagesSchema,
  inspectRenderSchema,
])

export type ExcelInspectInput = z.infer<typeof ExcelInspectInputSchema>

// ---------------------------------------------------------------------------
// ExcelMutate
// ---------------------------------------------------------------------------

const mutateCreateSchema = z.object({
  action: z.literal('create'),
  filePath: filePathSchema,
  sheets: z
    .preprocess(
      jsonArrayPreprocess,
      z.array(sheetSpecSchema).min(1, 'create requires at least one sheet'),
    )
    .describe(
      'REQUIRED. Native JSON array of sheet specs — pass `[{...}, {...}]`, NOT a stringified `"[{...}]"`. Each sheet has { name, cells (A1-keyed bag), merges?, freeze?, columnWidths?, conditionalFormats? }.',
    ),
  charts: z
    .preprocess(jsonArrayPreprocess, z.array(chartSpecSchema).optional())
    .describe('Optional native JSON array of chart specs. Do NOT pass as a stringified JSON.'),
  images: z
    .preprocess(jsonArrayPreprocess, z.array(imageSpecSchema).optional())
    .describe('Optional native JSON array of image specs. Do NOT pass as a stringified JSON.'),
})

const mutateUpdateSchema = z.object({
  action: z.literal('update'),
  filePath: filePathSchema,
  sheetName: sheetNameSchema,
  cells: cellsBagSchema,
  merges: z.preprocess(jsonArrayPreprocess, z.array(rangeSchema).optional()),
  unmerges: z.preprocess(jsonArrayPreprocess, z.array(rangeSchema).optional()),
})

const structureOpSchema = z.enum(['insert', 'delete', 'rename'])
const structureTargetSchema = z.enum(['row', 'col', 'sheet'])

const mutateStructureSchema = z
  .object({
    action: z.literal('structure'),
    filePath: filePathSchema,
    op: structureOpSchema,
    target: structureTargetSchema,
    sheetName: sheetNameSchema.optional(),
    at: coercedNonNegInt().optional(),
    count: coercedPosInt().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .refine(
    (v) => (v.target === 'sheet' ? true : !!v.sheetName),
    { message: 'sheetName is required when target is row or col', path: ['sheetName'] },
  )
  .refine(
    (v) => (v.op === 'insert' || v.op === 'delete' ? v.at !== undefined : true),
    { message: 'at is required for op=insert|delete', path: ['at'] },
  )
  .refine(
    (v) => (v.op === 'rename' ? !!v.from && !!v.to : true),
    { message: 'from and to are required for op=rename', path: ['from'] },
  )

const mutateLayoutSchema = z.object({
  action: z.literal('layout'),
  filePath: filePathSchema,
  sheetName: sheetNameSchema,
  freeze: z
    .object({
      rows: coercedNonNegInt().optional(),
      cols: coercedNonNegInt().optional(),
    })
    .optional(),
  autoFilter: z.object({ range: rangeSchema }).optional(),
  sort: z.preprocess(
    jsonArrayPreprocess,
    z
      .array(
        z.object({
          column: z.string().min(1),
          order: z.enum(['asc', 'desc']),
        }),
      )
      .optional(),
  ),
  columnWidths: z.record(z.string(), coercedPosNumber()).optional(),
  rowHeights: z.record(z.string(), coercedPosNumber()).optional(),
  printArea: rangeSchema.optional(),
})

const mutateFormatRulesSchema = z.object({
  action: z.literal('format-rules'),
  filePath: filePathSchema,
  sheetName: sheetNameSchema,
  rules: z.preprocess(jsonArrayPreprocess, z.array(conditionalFormatRuleSchema)),
})

const mutateAddChartSchema = z.object({
  action: z.literal('add-chart'),
  filePath: filePathSchema,
  sheetName: sheetNameSchema,
  type: z.enum(['bar', 'line', 'pie']),
  dataRange: chartRangeSchema,
  anchor: cellRefSchema,
  title: z.string().optional(),
})

const mutateAddImageSchema = z.object({
  action: z.literal('add-image'),
  filePath: filePathSchema,
  sheetName: sheetNameSchema,
  source: z.string().min(1),
  anchor: cellRefSchema,
  widthPx: coercedPosNumber().optional(),
  heightPx: coercedPosNumber().optional(),
})

const mutateRecalcSchema = z.object({
  action: z.literal('recalc'),
  filePath: filePathSchema,
  mode: z.enum(['auto', 'simple', 'libreoffice']).optional(),
})

export const ExcelMutateInputSchema = z.discriminatedUnion('action', [
  mutateCreateSchema,
  mutateUpdateSchema,
  mutateStructureSchema,
  mutateLayoutSchema,
  mutateFormatRulesSchema,
  mutateAddChartSchema,
  mutateAddImageSchema,
  mutateRecalcSchema,
])

export type ExcelMutateInput = z.infer<typeof ExcelMutateInputSchema>

// ---------------------------------------------------------------------------
// Output shapes (reference types — not validated at input parse time)
// ---------------------------------------------------------------------------

export interface ExcelInspectSummaryOutput {
  sheetCount: number
  sheets: Array<{
    name: string
    rows: number
    cols: number
    hasFormulas: boolean
    isProtected: boolean
    hasMergedCells: boolean
  }>
  hasFormulas: boolean
  hasCharts: boolean
  hasMergedCells: boolean
  hasValidations: boolean
  isProtected: boolean
  errorCount: number
  /** Up to 5 sampled formula errors. */
  errorSamples: Array<{ sheet: string; cell: string; error: string; formula?: string }>
  suggestedNextTool?: string
  renderUrls?: string[]
}

export interface ExcelInspectReadOutput {
  scope: 'sheet' | 'range' | 'outline'
  sheetName?: string
  range?: string
  rows: Array<Array<{ value?: unknown; formula?: string; computed?: unknown; error?: string } | null>>
  totalRows: number
  truncated?: boolean
}

export interface ExcelInspectOutput {
  ok: boolean
  action: 'summary' | 'read' | 'tables' | 'images' | 'render'
  data: unknown
  meta?: Record<string, unknown>
}

export interface ExcelMutateOutput {
  ok: boolean
  action: ExcelMutateInput['action']
  data: {
    filePath: string
    [k: string]: unknown
  }
  meta?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Tool defs (consumed by AI runtime)
// ---------------------------------------------------------------------------

export const excelInspectToolDef = {
  id: 'ExcelInspect',
  readonly: true,
  name: 'Inspect Excel',
  description:
    `Read-only XLSX / CSV analysis. One tool, 5 actions — pick based on what you need:

- \`summary\` — workbook overview: sheet list with rows × cols, hasFormulas, hasCharts, hasMergedCells, hasValidations, isProtected, errorCount + up to 5 errorSamples, and a \`suggestedNextTool\` hint. START HERE when you don't know the file's shape.
- \`read\` — unified read with \`scope: "sheet" | "range" | "outline"\`. Default paginates at 500 rows; pass \`all: true\` to lift the cap. Supports \`where\` / \`groupBy\` for lightweight aggregation. Cells return \`{value, formula?, computed?, error?}\`.
- \`tables\` — Excel Tables + pivot tables + named ranges + data validation rules.
- \`images\` — image / chart manifest. \`extractImages: true\` writes PNGs to the session asset dir and returns URLs.
- \`render\` — libreoffice-headless render of \`{sheetName, range?}\` to PNG.

Conventions:
- \`.csv\` / \`.tsv\` inputs are dispatched to a virtual single-sheet workbook automatically — no special flag needed.
- Files > 50 MB or >10,000 cells in a single read return \`meta.truncated: true\`; page with \`offset / limit\`.`,
  parameters: ExcelInspectInputSchema,
  needsApproval: false,
  component: null,
} as const

export const excelMutateToolDef = {
  id: 'ExcelMutate',
  readonly: false,
  name: 'Mutate Excel',
  description:
    `Write operations on XLSX / CSV — 8 actions. Pick the one that matches the user's intent:

🚨 PARAMETER FORMAT: array-valued params (\`sheets\`, \`charts\`, \`images\`, \`merges\`, \`unmerges\`, \`rules\`, \`sort\`) MUST be native JSON arrays — \`"sheets": [{...}]\`, NOT \`"sheets": "[{...}]"\`. Stringified JSON is auto-recovered with a warning but wastes a retry.

GENERATION
- \`create\` — build a new workbook from \`sheets[]\` (each with cells bag keyed by A1 ref, merges, freeze, columnWidths, conditionalFormats) plus optional \`charts\` and \`images\`. CellSpec carries value OR formula (exclusive), style (preset or object), numberFormat, comment, validation — all in one cell entry.

CELL EDITS
- \`update\` — unified cell writer on an existing workbook. Pass \`sheetName\` and a \`cells\` bag; every entry can carry value/formula/style/numberFormat/comment/validation in one go. Add \`merges\` / \`unmerges\` for range operations.

STRUCTURE
- \`structure\` — insert / delete / rename with \`target: "row" | "col" | "sheet"\`. 6-in-1 action.
- \`layout\`  — freeze panes, auto filter, sort, column widths, row heights, print area.
- \`format-rules\` — conditional formats: dataBar / colorScale / formula. Icon sets are not supported.

VISUALS
- \`add-chart\` — bar / line / pie only, single-axis, default palette. Complex / dual-axis charts are out of scope.
- \`add-image\` — insert a raster image at an anchor cell.

COMPUTATION
- \`recalc\` — force formula recalculation. \`mode: "auto" | "simple" | "libreoffice"\` (default auto). Returns errorCount + error list; cross-file references are warned but not recomputed.

Conventions:
- File paths: \`create\` writes a NEW file; every other action mutates the existing path in place.
- \`.csv\` input + formulas / multiple sheets / charts auto-upgrades to \`.xlsx\` (meta.upgradedFrom = "csv").
- CellSpec \`value\` and \`formula\` are mutually exclusive — pick one per cell.
- No \`edit\` XPath escape hatch (dropped in v2). Use \`update\` for cell-level changes.`,
  parameters: ExcelMutateInputSchema,
  needsApproval: true,
  component: null,
} as const
