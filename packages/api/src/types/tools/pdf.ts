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
import { stringBoolPreprocess, stringNumberPreprocess } from './office'

/** Wrap a zod schema so LLM-stringified booleans ("true"/"false"/"0"/"1") are auto-coerced. */
const zb = <T extends z.ZodTypeAny>(inner: T) => z.preprocess(stringBoolPreprocess, inner)
/** Wrap a zod schema so LLM-stringified numbers ("123"/"1.5") are auto-coerced. */
const zn = <T extends z.ZodTypeAny>(inner: T) => z.preprocess(stringNumberPreprocess, inner)

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
- \`form-fields\` — AcroForm field catalog with page / rect / type / checkedValue / radioOptions[].value / choiceOptions[]. Use BEFORE filling the form via JsSandbox + pdf-lib to get exact values (checkbox needs the PDF's own checkedValue, not 'true'/'yes').
- \`form-structure\` — For non-AcroForm PDFs (visual tables): extracts text labels + horizontal lines + square checkboxes + row boundaries. Feed into JsSandbox + pdf-lib to draw fill text at the right coordinates.
- \`images\` — list or extract embedded raster images.
- \`annotations\` — highlights / text notes / stamps.
- \`render\` — render page(s) to PNG in the session asset dir. Supports pageRange for multi-page batch. Use to SHOW the model what a page looks like (visual form filling, scanned OCR via CloudImageUnderstand, verification).
- \`tables\` — structured table extraction (simple grid heuristic; may miss complex layouts).

Encrypted PDFs: pass \`password\` or the call will fail with \`isEncrypted: true\`.
Scanned PDFs / OCR: this tool does NOT OCR. Call \`render\` then invoke \`CloudImageUnderstand\` on the rendered PNG.
Coordinate system: PDF points, origin at bottom-left (y increases upward).

To CREATE / EDIT / MERGE / WATERMARK / ROTATE / DECRYPT PDFs, use \`JsSandbox\` with the preinstalled \`pdf-lib\` / \`pdfkit\` packages — see the pdf-skill docs for demo scripts.`,
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
    withCoords: zb(z.boolean())
      .optional()
      .describe('For action=text: include per-item bbox { x, y, width, height, str } alongside plain text.'),
    extractImages: zb(z.boolean())
      .optional()
      .describe('For action=images: when true, write PNGs to the session asset dir and return URLs; default false (metadata only).'),
    scale: zn(z.number().min(0.5).max(6))
      .optional()
      .describe('For action=render: scale factor (≈ 72*scale DPI). Default 2 (≈144 DPI, suitable for OCR / vision).'),
    withRender: zb(z.boolean())
      .optional()
      .describe('For action=form-fields / form-structure / tables: also render the target pages and return PNG URLs alongside, so you can visually verify the structured result in one round-trip.'),
    sampleSize: zn(z.number().min(1).max(20))
      .optional()
      .describe('For action=summary: number of pages to sample for textType detection. Default 3.'),
  }),
  needsApproval: false,
  component: null,
} as const
