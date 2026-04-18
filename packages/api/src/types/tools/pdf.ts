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
// Sub-schemas
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
      width: z.number().optional(),
      height: z.number().optional(),
    })
    .optional()
    .describe('Background rectangle to mask existing content (visual redaction only — underlying text remains extractable).'),
})

const pdfVisualFieldSchema = z.object({
  page: z.number().min(1),
  entryBoundingBox: z
    .array(z.number())
    .length(4)
    .describe('[x0, y0, x1, y1] in the coordinate system indicated by `coordSystem`.'),
  text: z.string(),
  fontSize: z.number().optional().describe('Default 10.'),
  color: z.string().optional().describe('Hex, e.g. "#000000". Default black.'),
  coordSystem: z
    .enum(['pdf', 'image'])
    .optional()
    .describe('Default "pdf" (origin bottom-left, y up). Use "image" when bbox came from a rendered PNG (origin top-left, y down).'),
  imageWidth: z
    .number()
    .optional()
    .describe('Required when coordSystem="image". The PNG width in pixels that the bbox was measured against.'),
  imageHeight: z
    .number()
    .optional()
    .describe('Required when coordSystem="image".'),
})

const pdfRotationSchema = z.object({
  page: z.number().min(1),
  degrees: z.union([
    z.literal(90),
    z.literal(180),
    z.literal(270),
    z.literal(-90),
    z.literal(-180),
    z.literal(-270),
  ]),
})

const pdfCropSchema = z.object({
  page: z.number().min(1),
  mediaBox: z
    .array(z.number())
    .length(4)
    .describe('[x, y, width, height] in PDF points, origin bottom-left.'),
})

// ---------------------------------------------------------------------------
// PdfMutate — 12-action write surface
// ---------------------------------------------------------------------------

export const pdfMutateToolDef = {
  id: 'PdfMutate',
  readonly: false,
  name: 'Mutate Pdf',
  description:
    `Write operations on PDFs — 12 actions. Pick the one that matches the user's intent:

GENERATION
- \`create\` — from-scratch PDF (heading / paragraph / table / bullet-list / numbered-list / page-break). CJK works natively (Noto Sans SC auto-loaded). NO Unicode sub/superscript — use ASCII.

FORM FILLING
- \`fill-form\` — AcroForm fill. ALWAYS preceded by PdfInspect(form-fields) to get exact \`checkedValue\` / \`radioOptions[].value\` / \`choiceOptions[].value\`. skippedFields in the return flags wrong names/values.
- \`fill-visual\` — for non-AcroForm (scanned / static layout). Pass \`fields: [{ page, entryBoundingBox, text, coordSystem? }]\`. Handler validates bboxes (no overlap, enough width for fontSize) and auto-converts image↔pdf coords.

PAGE-LEVEL OPS
- \`rotate\`       — \`rotations: [{ page, degrees: 90/180/270/-90/-180/-270 }]\`
- \`crop\`         — \`crops: [{ page, mediaBox: [x,y,w,h] }]\` (PDF points, origin bottom-left)
- \`split\`        — cut into equal groups: \`groupSize: N\` → \`outputDir/{base}-partN.pdf\`; OR explicit breakpoints: \`splitAt: [3,7]\` → parts [1-3], [4-7], [8-end]
- \`extract-pages\` — \`pageRanges: "1,3-5,8,10-end"\` (qpdf syntax) → single output PDF

COMBINATION
- \`merge\`     — concatenate \`sourcePaths: [...]\`.
- \`watermark\` — overlay a watermark on every page (or a subset). \`type: 'text'\` for a diagonal text watermark (opacity configurable), \`type: 'pdf'\` to stamp another PDF page on top.
- \`add-text\`  — one-off text overlay at a specific coordinate (for stamps, redaction masks with \`background\`).

SECURITY / SIZE
- \`decrypt\`  — password-protected PDF → unlocked copy at \`outputPath\`. Encryption WRITE is not supported (by design).
- \`optimize\` — re-save with compression + optional \`linearize: true\` for web-friendly streaming.

Conventions:
- File paths: create/merge/split/extract-pages/decrypt/optimize write NEW files (\`filePath\` / \`outputPath\` / \`outputDir\`); the rest mutate the existing \`filePath\` in place.
- PDF coordinates: origin bottom-left, y increases upward. A4 ≈ 595 × 842 pt.
- Encrypted sources: pass \`password\`. The tool throws PDF_ENCRYPTED if it's needed but missing.`,
  parameters: z.object({
    action: z.enum([
      'create',
      'fill-form',
      'fill-visual',
      'add-text',
      'merge',
      'split',
      'extract-pages',
      'rotate',
      'crop',
      'watermark',
      'decrypt',
      'optimize',
    ]),
    filePath: z
      .string()
      .min(1)
      .describe(
        'For create / merge: new file path. For everything else: existing PDF path. Split / extract-pages / decrypt / optimize write to outputPath (or outputDir).',
      ),
    outputPath: z
      .string()
      .optional()
      .describe('Required for extract-pages / decrypt / optimize.'),
    outputDir: z
      .string()
      .optional()
      .describe('Required for split. Each part written as `{dir}/{base}-part{N}.pdf`.'),
    password: z
      .string()
      .optional()
      .describe('Required when the source PDF is encrypted (fill-form / fill-visual / add-text / rotate / crop / watermark / decrypt / optimize / split / extract-pages).'),

    // create
    content: z
      .preprocess(jsonArrayPreprocess, z.array(pdfContentItemSchema).optional())
      .describe('Required for create.'),

    // fill-form
    fields: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Required for fill-form. ALWAYS call PdfInspect(form-fields) first: checkboxes need the exact checkedValue, radios need radioOptions[i].value, dropdowns need choiceOptions[i].value.',
      ),

    // fill-visual
    visualFields: z
      .preprocess(jsonArrayPreprocess, z.array(pdfVisualFieldSchema).optional())
      .describe('Required for fill-visual. Each entry places text inside an entryBoundingBox with automatic overlap / size validation.'),

    // add-text
    overlays: z
      .preprocess(jsonArrayPreprocess, z.array(pdfTextOverlaySchema).optional())
      .describe('Required for add-text.'),

    // merge
    sourcePaths: z
      .preprocess(jsonArrayPreprocess, z.array(z.string()).optional())
      .describe('Required for merge. PDFs are concatenated in array order.'),

    // split
    groupSize: z
      .number()
      .min(1)
      .optional()
      .describe('For split: pages per part. Mutually exclusive with splitAt.'),
    splitAt: z
      .preprocess(jsonArrayPreprocess, z.array(z.number().min(1)).optional())
      .describe('For split: page numbers where each NEW part starts (e.g. [4, 8] → parts 1-3, 4-7, 8-end). Mutually exclusive with groupSize.'),

    // extract-pages
    pageRanges: z
      .string()
      .optional()
      .describe('For extract-pages: qpdf-style range string, e.g. "1,3-5,8,10-end".'),

    // rotate
    rotations: z
      .preprocess(jsonArrayPreprocess, z.array(pdfRotationSchema).optional())
      .describe('Required for rotate.'),

    // crop
    crops: z
      .preprocess(jsonArrayPreprocess, z.array(pdfCropSchema).optional())
      .describe('Required for crop.'),

    // watermark
    watermarkType: z
      .enum(['text', 'pdf'])
      .optional()
      .describe('Required for watermark.'),
    watermarkText: z
      .string()
      .optional()
      .describe('For watermark type=text.'),
    watermarkFontSize: z.number().optional().describe('Default 48.'),
    watermarkColor: z.string().optional().describe('Hex, default "#888888".'),
    watermarkOpacity: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe('0..1, default 0.3.'),
    watermarkAngle: z.number().optional().describe('Degrees, default -30 (diagonal up-right).'),
    watermarkPdfPath: z.string().optional().describe('For watermark type=pdf: source PDF to stamp.'),
    watermarkPdfPage: z.number().min(1).optional().describe('1-based page in the watermark PDF. Default 1.'),
    watermarkPageRange: z
      .string()
      .optional()
      .describe('Which pages of the target PDF to watermark (e.g. "1-5"). Default all pages.'),

    // optimize
    linearize: z
      .boolean()
      .optional()
      .describe('For optimize: produce a web-optimized (non-object-stream) layout.'),
  }),
  needsApproval: true,
  component: null,
} as const

// ---------------------------------------------------------------------------
// PdfInspect — read-only analysis (no approval needed)
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
- \`form-structure\` — For non-AcroForm PDFs (visual tables): extracts text labels + horizontal lines + square checkboxes + row boundaries. Feed into PdfMutate(fill-visual) to fill visually.
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
