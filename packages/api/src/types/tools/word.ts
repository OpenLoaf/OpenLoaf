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
// WordInspect — read-only analysis (9 actions, no approval needed)
// ---------------------------------------------------------------------------

export const wordInspectToolDef = {
  id: 'WordInspect',
  readonly: true,
  name: 'Inspect Word',
  description:
    `Read-only DOCX analysis. One tool, 9 actions — pick based on what you need:

- \`summary\` — page count, paragraph / word / heading counts, metadata, hasTrackedChanges, hasComments, isProtected, \`availableStyles\` (paragraph + character styles the document defines), and a \`suggestedNextTool\` hint. START HERE when you don't know the DOCX's shape.
- \`outline\` — heading-level outline tree (Heading1..Heading6). Use to plan surgical edits on long documents.
- \`text\` — extract full text (or a pageRange slice). Large documents may cap at 20 pages per call.
- \`tables\` — structured table extraction, respects merged cells (rowSpan / colSpan).
- \`images\` — list embedded raster images; when \`extractImages=true\`, write PNGs to the session asset dir and return URLs.
- \`comments\` — full comment thread with parent/reply hierarchy, author, date.
- \`tracked-changes\` — list every w:ins / w:del with author, date, type, affected runText.
- \`xml\` — dump a raw OOXML part (default \`word/document.xml\`, switch via \`partName\`). Use for planning structural edits via JsSandbox.
- \`render\` — render page(s) to PNG in the session asset dir (libreoffice headless → pdf-lib → sharp). Use for visual verification.

Conventions:
- File paths: pass the existing \`.docx\`. Encrypted (\`.docx\` with write protection) documents return isProtected=true — handle gracefully.
- Do NOT rely on Read / DocPreview for edit planning. Read returns Markdown which hides rPr / pPr details you need.

To CREATE / EDIT DOCX files, use \`JsSandbox\` with the preinstalled \`docx\` / \`adm-zip\` packages — see the docx-skill docs for demo scripts.`,
  parameters: z.object({
    action: z.enum([
      'summary',
      'outline',
      'text',
      'tables',
      'images',
      'comments',
      'tracked-changes',
      'xml',
      'render',
    ]),
    filePath: z
      .string()
      .min(1)
      .describe('Absolute or session-relative path to the .docx file.'),
    pageRange: z
      .string()
      .optional()
      .describe(
        'e.g. "1-5" or "3". Defaults: summary samples first pages; text/tables span all pages; render requires it.',
      ),
    withCoords: zb(z.boolean())
      .optional()
      .describe('For action=text: include per-paragraph section/page hint alongside plain text. Default false.'),
    extractImages: zb(z.boolean())
      .optional()
      .describe('For action=images: when true, write PNGs to the session asset dir and return URLs; default false (metadata only).'),
    partName: z
      .string()
      .optional()
      .describe('For action=xml: ZIP entry path. Default "word/document.xml". Examples: "word/comments.xml", "word/styles.xml", "word/header1.xml".'),
    scale: zn(z.number().min(0.5).max(6))
      .optional()
      .describe('For action=render: scale factor (≈ 72*scale DPI). Default 2 (≈144 DPI).'),
    withRender: zb(z.boolean())
      .optional()
      .describe('For action=summary / outline / tables: also render the first (or requested) page and return PNG URLs alongside, so you can visually verify the structured result in one round-trip.'),
    sampleSize: zn(z.number().min(1).max(20))
      .optional()
      .describe('For action=summary: number of pages to sample for detail counting. Default 3.'),
  }),
  needsApproval: false,
  component: null,
} as const
