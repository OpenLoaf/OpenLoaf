/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from 'zod'
import { jsonArrayPreprocess } from './office'

// ---------------------------------------------------------------------------
// PdfMutate — write operations
// NOTE: current 4-action surface (create / fill-form / merge / add-text) is
// kept working while PdfInspect rolls out in stage 1. Stage 2 will extend
// this to 12 actions (+split/extract-pages/rotate/crop/watermark/decrypt/
// optimize/fill-visual) and remove the old descriptions.
// ---------------------------------------------------------------------------

const pdfContentItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('heading'),
    text: z.string(),
    level: z.number().min(1).max(6).optional(),
  }),
  z.object({
    type: z.literal('paragraph'),
    text: z.string(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    fontSize: z.number().optional(),
  }),
  z.object({
    type: z.literal('table'),
    headers: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  z.object({
    type: z.literal('bullet-list'),
    items: z.array(z.string()),
  }),
  z.object({
    type: z.literal('numbered-list'),
    items: z.array(z.string()),
  }),
  z.object({
    type: z.literal('page-break'),
  }),
])

const pdfTextOverlaySchema = z.object({
  page: z.number().min(1).describe('1-based.'),
  x: z.number().describe('PDF points, origin at bottom-left.'),
  y: z.number().describe('PDF points, origin at bottom-left.'),
  text: z.string(),
  fontSize: z.number().optional().describe('Default 12.'),
  color: z.string().optional().describe('Hex, e.g. "#FF0000". Default black.'),
  background: z
    .object({
      color: z.string().describe('Hex, e.g. "#FFFFFF" for white masking.'),
      padding: z.number().optional().describe('Default 2.'),
      width: z.number().optional().describe('Auto from text width + padding when omitted.'),
      height: z.number().optional().describe('Auto from font size + padding when omitted.'),
    })
    .optional()
    .describe('Background rectangle to mask existing content (visual redaction only — underlying text remains extractable).'),
})

export const pdfMutateToolDef = {
  id: 'PdfMutate',
  readonly: false,
  name: 'Mutate Pdf',
  description:
    'Write operations on PDFs. Actions: create / fill-form / merge / add-text. ' +
    'CJK characters are fully supported (Noto Sans SC auto-embedded when Chinese/Japanese/Korean detected). ' +
    'Use PdfInspect for all read operations (summary / text / form-fields / render / etc).',
  parameters: z.object({
    action: z.enum(['create', 'fill-form', 'merge', 'add-text']),
    filePath: z
      .string()
      .min(1)
      .describe('New file for create/merge, existing file for fill-form/add-text.'),
    content: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(pdfContentItemSchema).optional(),
      )
      .describe('Required for create.'),
    fields: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Form field name → value. Required for fill-form. ALWAYS call PdfInspect(form-fields) first to get the exact checkedValue (not "true"/"yes") and radio / choice option values.',
      ),
    sourcePaths: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(z.string()).optional(),
      )
      .describe('Required for merge.'),
    overlays: z
      .preprocess(
        jsonArrayPreprocess,
        z.array(pdfTextOverlaySchema).optional(),
      )
      .describe('Required for add-text.'),
  }),
  needsApproval: true,
  component: null,
} as const

// ---------------------------------------------------------------------------
// PdfInspect — read-only analysis (new tool, no approval needed)
// ---------------------------------------------------------------------------

export const pdfInspectToolDef = {
  id: 'PdfInspect',
  readonly: true,
  name: 'Inspect PDF',
  description:
    `Read-only PDF analysis. One tool, 8 actions — pick based on what you need:

- \`summary\` — page count, metadata, encryption status, textType detection ('extractable' | 'scanned' | 'cid-encoded'), form info, and a \`suggestedNextTool\` hint (e.g. "CloudImageUnderstand" for scanned PDFs, "PdfInspect text" for extractable). START HERE when you don't know the PDF's shape.
- \`text\` — extract full text (optionally with per-item coordinates). Honor \`pageRange\` for large PDFs.
- \`form-fields\` — AcroForm field catalog with page / rect / type / checkedValue / radioOptions[].value / choiceOptions[]. Use BEFORE PdfMutate(fill-form) to get exact values (checkbox needs the PDF's own checkedValue, not 'true'/'yes').
- \`form-structure\` — For non-AcroForm PDFs (visual tables): extracts text labels + horizontal lines + square checkboxes + row boundaries. Feed into PdfMutate(add-text) to fill visually.
- \`images\` — list or extract embedded raster images.
- \`annotations\` — highlights / text notes / stamps.
- \`render\` — render page(s) to PNG in the session asset dir. Supports pageRange for multi-page batch. Use to SHOW the model what a page looks like (visual form filling, scanned OCR via CloudImageUnderstand, verification).
- \`tables\` — structured table extraction (simple grid heuristic; may miss complex layouts).

Encrypted PDFs: pass \`password\` or the call will fail with \`isEncrypted: true\`.
Scanned PDFs / OCR: this tool does NOT OCR. Call \`render\` then invoke \`CloudImageUnderstand\` on the rendered PNG.
Coordinate system: PDF points, origin at bottom-left (y increases upward).`,
  parameters: z.object({
    action: z.enum([
      'summary',
      'text',
      'tables',
      'form-fields',
      'form-structure',
      'images',
      'annotations',
      'render',
    ]),
    filePath: z.string().min(1),
    pageRange: z
      .string()
      .optional()
      .describe(
        'e.g. "1-5" or "3". Defaults: summary samples first pages; text/images/annotations/form-structure span all pages; render requires it.',
      ),
    password: z
      .string()
      .optional()
      .describe(
        'Required if the PDF is encrypted. summary returns isEncrypted=true when missing.',
      ),
    withCoords: z
      .boolean()
      .optional()
      .describe('For action=text: include per-item bbox { x, y, width, height, str } alongside plain text.'),
    extractImages: z
      .boolean()
      .optional()
      .describe('For action=images: when true, write PNGs to the session asset dir and return URLs; default false (metadata only).'),
    scale: z
      .number()
      .min(0.5)
      .max(6)
      .optional()
      .describe('For action=render: scale factor (≈ 72*scale DPI). Default 2 (≈144 DPI, suitable for OCR / vision).'),
    withRender: z
      .boolean()
      .optional()
      .describe('For action=form-fields / form-structure / tables: also render the target pages and return PNG URLs alongside, so you can visually verify the structured result in one round-trip.'),
    sampleSize: z
      .number()
      .min(1)
      .max(20)
      .optional()
      .describe('For action=summary: number of pages to sample for textType detection. Default 3.'),
  }),
  needsApproval: false,
  component: null,
} as const
