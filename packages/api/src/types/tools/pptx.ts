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
// PptxInspect — read-only analysis (9 actions, no approval needed)
// ---------------------------------------------------------------------------

export const pptxInspectToolDef = {
  id: 'PptxInspect',
  readonly: true,
  name: 'Inspect PPTX',
  description:
    `Read-only PPTX analysis. One tool, 9 actions — pick based on what you need:

- \`summary\` — slide count, master / layout counts, note count, metadata (creator, lastModifiedBy, dates), hasCharts, hasSmartArt, fileSize, and a \`suggestedNextTool\` hint. START HERE when you don't know the deck's shape.
- \`outline\` — per-slide title list. Use to get a quick TOC of a long deck before going deeper.
- \`text\` — full text of each slide (optionally with per-run bounding boxes). Large decks cap at 30 slides per call — use \`slideNumbers\` to page through.
- \`notes\` — speaker notes per slide. Use when you need the presenter's annotations, not the visible slide text.
- \`tables\` — structured table extraction per slide (rows as string arrays).
- \`shapes\` — shape tree per slide (type, name, optional text, bounding box). Use to locate where anomalous visuals live before deciding whether to \`render\`.
- \`images\` — list embedded images per slide; set \`extractImages=true\` to write them to the session asset dir.
- \`xml\` — raw OOXML part dump. Default lists all part names; pass \`partName\` (e.g. "ppt/slides/slide1.xml") to retrieve a specific part. Use to plan structural edits via JsSandbox.
- \`render\` — render slide(s) to PNG using node-pptx-png-v2 (pure Node, no LibreOffice). Use when you need to visually inspect a slide. Note: SmartArt, custom charts, and WMF vector backgrounds may degrade — fallback to DocConvert or render + CloudImageUnderstand if fidelity is critical.

Conventions:
- Pass the existing \`.pptx\` path. Old binary \`.ppt\` files return \`{ ok: false, error: "PPT_LEGACY_FORMAT" }\`.
- Don't know the deck shape? → \`summary\` first.
- Need to visually verify a slide? → \`render\` with \`slideNumbers\`.
- Only need titles? → \`outline\`.
- Only need body text? → \`text\` or \`notes\`.

To CREATE / EDIT PPTX files, use \`JsSandbox\` with the preinstalled \`pptxgenjs\` / \`adm-zip\` packages — see the pptx-skill docs for demo scripts.`,
  parameters: z.object({
    action: z.enum([
      'summary',
      'outline',
      'text',
      'notes',
      'tables',
      'shapes',
      'images',
      'xml',
      'render',
    ]),
    filePath: z
      .string()
      .min(1)
      .describe('Absolute or session-relative path to the .pptx file.'),
    slideNumbers: z
      .string()
      .optional()
      .describe(
        'Comma-separated or range of 1-based slide numbers, e.g. "1,3,5" or "2-8". Applies to text / notes / tables / shapes / images / render. Omit to process all slides (capped internally for large decks).',
      ),
    withCoords: zb(z.boolean())
      .optional()
      .describe(
        'For action=text / shapes: include per-run or per-shape bounding box (EMU units). Default false.',
      ),
    extractImages: zb(z.boolean())
      .optional()
      .describe(
        'For action=images: when true, write image files to the session asset dir and return paths; default false (metadata only).',
      ),
    partName: z
      .string()
      .optional()
      .describe(
        'For action=xml: ZIP entry path to retrieve (e.g. "ppt/slides/slide1.xml", "ppt/theme/theme1.xml"). Omit to list all part names.',
      ),
    scale: zn(z.number().min(0.5).max(4))
      .optional()
      .describe(
        'For action=render: output width scale relative to the default 1280px base (e.g. 2 → 2560px wide). Default 1.',
      ),
    withRender: zb(z.boolean())
      .optional()
      .describe(
        'For action=summary / outline / tables: also render the first (or requested) slide and return PNG path alongside, for a one-round-trip visual + structured result.',
      ),
  }),
  needsApproval: false,
  component: null,
} as const
