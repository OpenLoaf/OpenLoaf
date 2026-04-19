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
import { jsonArrayPreprocess, officeEditSchema } from './office'

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

/**
 * TextRun — inline run with character-level formatting. The 11 optional fields
 * cover Word's common `w:rPr` surface. Keep the schema broad; guidance on
 * when to use each lives in the SKILL.md, not in the schema.
 */
const textRunSchema = z.object({
  text: z.string().describe('The literal text of this run. Required.'),
  bold: z.boolean().optional().describe('w:b. Default false.'),
  italic: z.boolean().optional().describe('w:i. Default false.'),
  underline: z
    .boolean()
    .optional()
    .describe('w:u single line. Default false.'),
  strike: z
    .boolean()
    .optional()
    .describe('w:strike. Default false. Use for tracked-change visual hints only when NOT using add-tracked-change.'),
  superscript: z
    .boolean()
    .optional()
    .describe('w:vertAlign="superscript". Do NOT use Unicode ² / ³ — always go through this flag.'),
  subscript: z
    .boolean()
    .optional()
    .describe('w:vertAlign="subscript". Do NOT use Unicode subscript characters.'),
  font: z
    .string()
    .optional()
    .describe('w:rFonts ascii / hAnsi. e.g. "Calibri", "Times New Roman". CJK auto-injects eastAsia — no need to specify for Chinese/Japanese/Korean.'),
  size: z
    .number()
    .optional()
    .describe('Font size in half-points (w:sz). e.g. 22 = 11pt, 28 = 14pt. Default inherits from style.'),
  color: z
    .string()
    .optional()
    .describe('Hex RGB without leading #, e.g. "FF0000" for red. Default inherits from style.'),
  highlight: z
    .enum([
      'yellow', 'green', 'cyan', 'magenta', 'blue', 'red', 'darkBlue',
      'darkCyan', 'darkGreen', 'darkMagenta', 'darkRed', 'darkYellow',
      'darkGray', 'lightGray', 'black', 'white', 'none',
    ])
    .optional()
    .describe('w:highlight. One of the OOXML named highlight colors. Use "none" to explicitly clear.'),
  style: z
    .string()
    .optional()
    .describe('Character style id (w:rStyle). Reference an id from availableStyles in WordInspect(summary).'),
})

const paragraphSpacingSchema = z.object({
  before: z.number().optional().describe('Space before in twentieths of a point (e.g. 240 = 12pt).'),
  after: z.number().optional().describe('Space after in twentieths of a point.'),
  line: z.number().optional().describe('Line spacing in twentieths of a point. 240 = single, 360 = 1.5x, 480 = double.'),
  lineRule: z.enum(['auto', 'exact', 'atLeast']).optional().describe('How `line` is interpreted. Default "auto".'),
})

const paragraphIndentSchema = z.object({
  left: z.number().optional().describe('Left indent in twips (1/1440 inch). 720 = 0.5 inch.'),
  right: z.number().optional().describe('Right indent in twips.'),
  firstLine: z.number().optional().describe('First-line indent in twips. Mutually exclusive with hanging.'),
  hanging: z.number().optional().describe('Hanging indent in twips. Mutually exclusive with firstLine.'),
})

const tableBorderSchema = z.object({
  style: z
    .enum(['single', 'double', 'dashed', 'dotted', 'thick', 'none'])
    .optional()
    .describe('Border line style. Default "single".'),
  size: z.number().optional().describe('Border width in eighths of a point. Default 4 (0.5pt).'),
  color: z.string().optional().describe('Hex RGB, e.g. "000000" for black.'),
})

const tableCellSchema = z.object({
  runs: z
    .array(textRunSchema)
    .optional()
    .describe('Cell content as text runs. Mutually exclusive with `text` shorthand.'),
  text: z
    .string()
    .optional()
    .describe('Shorthand for a single plain-text run. Prefer `runs` when formatting is needed.'),
  width: z
    .number()
    .optional()
    .describe('Cell width in twips. Should be consistent with table.columnWidths[colIndex].'),
  shading: z
    .string()
    .optional()
    .describe('Cell background color hex RGB, e.g. "FFFF00". Always renders as CLEAR fill (not pattern).'),
  borders: z
    .object({
      top: tableBorderSchema.optional(),
      bottom: tableBorderSchema.optional(),
      left: tableBorderSchema.optional(),
      right: tableBorderSchema.optional(),
    })
    .optional()
    .describe('Per-edge overrides. Omit to inherit from table-level borders.'),
  padding: z
    .object({
      top: z.number().optional(),
      bottom: z.number().optional(),
      left: z.number().optional(),
      right: z.number().optional(),
    })
    .optional()
    .describe('Cell margins in twips. Default matches Word defaults.'),
  merge: z
    .object({
      rowSpan: z
        .number()
        .min(1)
        .optional()
        .describe('Vertical span (w:vMerge). 1 = no span. Cells covered by a span must still appear in the row array as empty cells.'),
      colSpan: z
        .number()
        .min(1)
        .optional()
        .describe('Horizontal span (w:gridSpan). 1 = no span.'),
    })
    .optional(),
  verticalAlign: z
    .enum(['top', 'center', 'bottom'])
    .optional()
    .describe('Cell vertical alignment (w:vAlign). Default "top".'),
})

// ---------------------------------------------------------------------------
// ContentItem — block-level elements for WordMutate.create
// ---------------------------------------------------------------------------

const contentItemSchema = z.discriminatedUnion('type', [
  // --- Heading ---------------------------------------------------------------
  z.object({
    type: z.literal('heading'),
    text: z
      .string()
      .describe('Plain-text heading. For mixed formatting, use a paragraph with `style` referencing Heading1/2/... instead.'),
    level: z
      .number()
      .int()
      .min(1)
      .max(6)
      .optional()
      .describe('1-6, default 1. Maps to built-in Heading1..Heading6 styles.'),
    alignment: z
      .enum(['left', 'center', 'right', 'justify'])
      .optional()
      .describe('w:jc. Default inherits from style.'),
    color: z.string().optional().describe('Override heading color (hex RGB without #).'),
    font: z.string().optional().describe('Override heading font family.'),
    size: z.number().optional().describe('Override heading size in half-points.'),
    pageBreakBefore: z
      .boolean()
      .optional()
      .describe('Start this heading on a new page (w:pageBreakBefore).'),
  }),

  // --- Paragraph -------------------------------------------------------------
  z.object({
    type: z.literal('paragraph'),
    runs: z
      .array(textRunSchema)
      .min(1)
      .describe('One or more TextRuns. Use multiple runs to mix formatting within the same paragraph.'),
    alignment: z
      .enum(['left', 'center', 'right', 'justify'])
      .optional()
      .describe('Paragraph alignment (w:jc). Default inherits from style.'),
    spacing: paragraphSpacingSchema.optional().describe('Line / before / after spacing.'),
    indent: paragraphIndentSchema.optional().describe('Indentation settings.'),
    pageBreakBefore: z
      .boolean()
      .optional()
      .describe('Start this paragraph on a new page.'),
    style: z
      .string()
      .optional()
      .describe('Paragraph style id (w:pStyle). Reference an id from availableStyles in WordInspect(summary).'),
  }),

  // --- Table -----------------------------------------------------------------
  z.object({
    type: z.literal('table'),
    columnWidths: z
      .array(z.number())
      .optional()
      .describe('Column widths in twips, e.g. [2000, 4000, 3000] for a 3-col table. Length should match row cell count; cell.width should agree.'),
    borders: z
      .object({
        top: tableBorderSchema.optional(),
        bottom: tableBorderSchema.optional(),
        left: tableBorderSchema.optional(),
        right: tableBorderSchema.optional(),
        insideH: tableBorderSchema.optional(),
        insideV: tableBorderSchema.optional(),
      })
      .optional()
      .describe('Table-level borders. Override per-cell via cell.borders.'),
    shading: z
      .string()
      .optional()
      .describe('Default cell background hex RGB. Per-cell shading overrides.'),
    cellPadding: z
      .object({
        top: z.number().optional(),
        bottom: z.number().optional(),
        left: z.number().optional(),
        right: z.number().optional(),
      })
      .optional()
      .describe('Default cell padding in twips. Per-cell padding overrides.'),
    headers: z
      .array(z.string())
      .optional()
      .describe('Shorthand: plain-text header row. For rich cells use `rows` with TableCell objects instead.'),
    rows: z
      .array(
        z.union([
          z.array(z.string()).describe('Shorthand row: plain-text cells.'),
          z.array(tableCellSchema).describe('Rich row: each cell is a TableCell with formatting and/or merges.'),
        ]),
      )
      .describe('Row array. Mix shorthand and rich rows is allowed but not recommended.'),
  }),

  // --- Bullet list -----------------------------------------------------------
  z.object({
    type: z.literal('bullet-list'),
    items: z
      .array(
        z.union([
          z.string().describe('Shorthand: plain-text bullet.'),
          z
            .object({
              runs: z
                .array(textRunSchema)
                .min(1)
                .describe('Rich bullet: TextRuns for mixed formatting.'),
              level: z
                .number()
                .int()
                .min(0)
                .max(8)
                .optional()
                .describe('Nesting level (0-indexed). 0 = top-level bullet, 1 = sub-bullet, up to 8. Default 0.'),
            })
            .describe('Rich bullet item with optional nesting.'),
        ]),
      )
      .min(1),
  }),

  // --- Numbered list ---------------------------------------------------------
  z.object({
    type: z.literal('numbered-list'),
    items: z
      .array(
        z.union([
          z.string().describe('Shorthand: plain-text numbered item.'),
          z
            .object({
              runs: z.array(textRunSchema).min(1),
              level: z
                .number()
                .int()
                .min(0)
                .max(8)
                .optional()
                .describe('Nesting level (0-indexed). Default 0.'),
            }),
        ]),
      )
      .min(1),
  }),

  // --- Image -----------------------------------------------------------------
  z.object({
    type: z.literal('image'),
    source: z
      .string()
      .describe('Local file path or http(s) URL to a PNG/JPEG/GIF. The engine embeds the bytes into word/media/ and registers the rels entry.'),
    width: z
      .number()
      .optional()
      .describe('Display width in EMUs (1 inch = 914400). For px, the engine converts automatically when `widthPx` is used.'),
    widthPx: z.number().optional().describe('Display width in pixels (96 DPI assumption).'),
    heightPx: z.number().optional().describe('Display height in pixels. Omit to preserve aspect ratio.'),
    alt: z.string().optional().describe('Alt text (w:docPr descr).'),
    alignment: z
      .enum(['left', 'center', 'right'])
      .optional()
      .describe('Paragraph-level alignment of the image anchor. Default "left".'),
  }),

  // --- Explicit page break ---------------------------------------------------
  z.object({
    type: z.literal('page-break'),
  }),

  // --- Table of contents -----------------------------------------------------
  z.object({
    type: z.literal('toc'),
    title: z.string().optional().describe('Optional heading line above the TOC (e.g. "Table of Contents").'),
    minLevel: z
      .number()
      .int()
      .min(1)
      .max(6)
      .optional()
      .describe('Lowest heading level to include. Default 1.'),
    maxLevel: z
      .number()
      .int()
      .min(1)
      .max(6)
      .optional()
      .describe('Highest heading level to include. Default 3.'),
  }),

  // --- Footnote reference ----------------------------------------------------
  z.object({
    type: z.literal('footnote-ref'),
    text: z
      .string()
      .describe('Footnote body text (rendered at the bottom of the page).'),
  }),

  // --- Hyperlink block (standalone link paragraph) ---------------------------
  z.object({
    type: z.literal('hyperlink'),
    url: z.string().describe('Target URL (http, https, mailto:, etc.).'),
    runs: z
      .array(textRunSchema)
      .min(1)
      .describe('Display runs for the link text. Typically one run with blue color and underline, but formatting is free-form.'),
  }),
])

// ---------------------------------------------------------------------------
// Document-level settings (optional — omit to use project defaults)
// ---------------------------------------------------------------------------

const pageSettingsSchema = z.object({
  size: z
    .enum(['a4', 'letter', 'legal', 'a3', 'a5', 'b5', 'tabloid'])
    .optional()
    .describe('Named paper size. Default "a4".'),
  orientation: z
    .enum(['portrait', 'landscape'])
    .optional()
    .describe('Default "portrait".'),
  margins: z
    .object({
      top: z.number().optional(),
      bottom: z.number().optional(),
      left: z.number().optional(),
      right: z.number().optional(),
      header: z.number().optional().describe('Distance from top of page to header (twips).'),
      footer: z.number().optional().describe('Distance from bottom of page to footer (twips).'),
    })
    .optional()
    .describe('Margins in twips. Default 1440 (1 inch) on all sides.'),
})

const columnsSettingsSchema = z.object({
  count: z.number().int().min(1).max(6).describe('Column count. Default 1.'),
  space: z
    .number()
    .optional()
    .describe('Space between columns in twips. Default 720 (0.5 inch).'),
  separator: z
    .boolean()
    .optional()
    .describe('Draw vertical separator lines between columns.'),
})

const headerFooterContentSchema = z.object({
  runs: z
    .array(textRunSchema)
    .optional()
    .describe('TextRuns for the header/footer paragraph.'),
  includePageNumber: z
    .boolean()
    .optional()
    .describe('Append a page-number field (w:fldChar PAGE) at the end of the line.'),
  alignment: z
    .enum(['left', 'center', 'right'])
    .optional()
    .describe('Alignment for the single header/footer paragraph. Default "center".'),
})

const documentSettingsSchema = z.object({
  page: pageSettingsSchema
    .optional()
    .describe('Page size / orientation / margins. OMIT unless overriding defaults (A4 portrait, 2.54cm margins).'),
  columns: columnsSettingsSchema
    .optional()
    .describe('Multi-column layout. OMIT for single-column (default).'),
  defaultFont: z
    .object({
      family: z.string().optional().describe('Default font family for the whole document. Default "Calibri".'),
      size: z.number().optional().describe('Default font size in half-points. Default 22 (11pt).'),
    })
    .optional()
    .describe('Document-wide font defaults. OMIT unless overriding Calibri 11pt.'),
  header: headerFooterContentSchema
    .optional()
    .describe('Page header (appears on every page). OMIT for no header.'),
  footer: headerFooterContentSchema
    .optional()
    .describe('Page footer. Typical use: `{ includePageNumber: true, alignment: "center" }`.'),
})

// ---------------------------------------------------------------------------
// WordInspect — read-only analysis (9 actions, no approval needed)
// ---------------------------------------------------------------------------

export const wordInspectToolDef = {
  id: 'WordInspect',
  readonly: true,
  name: 'Inspect Word',
  description:
    `Read-only DOCX analysis. One tool, 9 actions — pick based on what you need:

- \`summary\` — page count, paragraph / word / heading counts, metadata, hasTrackedChanges, hasComments, isProtected, \`availableStyles\` (paragraph + character styles the document defines), and a \`suggestedNextTool\` hint (e.g. "WordInspect tracked-changes" when tracked changes exist, "WordInspect xml" for unusual structure). START HERE when you don't know the DOCX's shape.
- \`outline\` — heading-level outline tree (Heading1..Heading6). Use to plan surgical edits on long documents.
- \`text\` — extract full text (or a pageRange slice). Large documents may cap at 20 pages per call.
- \`tables\` — structured table extraction, respects merged cells (rowSpan / colSpan).
- \`images\` — list embedded raster images; when \`extractImages=true\`, write PNGs to the session asset dir and return URLs.
- \`comments\` — full comment thread with parent/reply hierarchy, author, date.
- \`tracked-changes\` — list every w:ins / w:del with author, date, type, affected runText.
- \`xml\` — dump a raw OOXML part (default \`word/document.xml\`, switch via \`partName\`). Use as the last resort before \`WordMutate(edit)\` so XPath matches the real structure.
- \`render\` — render page(s) to PNG in the session asset dir (libreoffice headless → pdf-lib → sharp). Use for visual verification.

Conventions:
- File paths: pass the existing \`.docx\`. Encrypted (\`.docx\` with write protection) documents return isProtected=true — handle gracefully.
- Do NOT rely on Read / DocPreview for edit planning. Read returns Markdown which hides rPr / pPr details you need.`,
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
    withCoords: z
      .boolean()
      .optional()
      .describe('For action=text: include per-paragraph section/page hint alongside plain text. Default false.'),
    extractImages: z
      .boolean()
      .optional()
      .describe('For action=images: when true, write PNGs to the session asset dir and return URLs; default false (metadata only).'),
    partName: z
      .string()
      .optional()
      .describe('For action=xml: ZIP entry path. Default "word/document.xml". Examples: "word/comments.xml", "word/styles.xml", "word/header1.xml".'),
    scale: z
      .number()
      .min(0.5)
      .max(6)
      .optional()
      .describe('For action=render: scale factor (≈ 72*scale DPI). Default 2 (≈144 DPI).'),
    withRender: z
      .boolean()
      .optional()
      .describe('For action=summary / outline / tables: also render the first (or requested) page and return PNG URLs alongside, so you can visually verify the structured result in one round-trip.'),
    sampleSize: z
      .number()
      .min(1)
      .max(20)
      .optional()
      .describe('For action=summary: number of pages to sample for detail counting. Default 3.'),
  }),
  needsApproval: false,
  component: null,
} as const

// ---------------------------------------------------------------------------
// WordMutate — 9-action write surface
// ---------------------------------------------------------------------------

export const wordMutateToolDef = {
  id: 'WordMutate',
  readonly: false,
  name: 'Mutate Word',
  description:
    `Write operations on DOCX — 9 actions. Pick the one that matches the user's intent:

GENERATION
- \`create\` — build a new DOCX from structured \`content\` (heading / paragraph / table / bullet-list / numbered-list / image / page-break / toc / footnote-ref / hyperlink) plus optional top-level \`documentSettings\` (page size / orientation / margins / columns / default font / header / footer). CJK works natively (eastAsia font auto-injected). NO Unicode sub/superscript — use TextRun \`superscript\` / \`subscript\` flags.

HIGH-LEVEL EDITS (prefer these over \`edit\`)
- \`replace-text\` — literal or regex find/replace that survives being split across multiple w:r runs. Pass \`find\`, \`replace\`, optional \`regex\` / \`matchCase\` / \`wholeWord\`.
- \`add-image\` — insert an image at an anchor (\`anchor.paragraphXPath\` or \`anchor.position: 'end'\`). Registers rels + content-types + media entry.
- \`update-toc\` — regenerate the Table of Contents field values (requires libreoffice headless). Call after headings change.
- \`set-page-settings\` — update sectPr (page size / orientation / margins / columns) without touching body content.

REVIEW WORKFLOW
- \`comment\` — add a new comment anchored at \`anchor.xpath\` with the given \`text\`. Set \`parentId\` to post a reply to an existing comment. Writes the 5-file comment set (comments.xml / commentsExtended.xml / commentsIds.xml / people.xml + document.xml anchors).
- \`add-tracked-change\` — insert a tracked insertion / deletion. Pass \`changeType: 'insert' | 'delete' | 'replace'\` and the text payload. Preserves source rPr.
- \`resolve-changes\` — accept or reject tracked changes. \`decision: 'accept' | 'reject'\`, optional \`ids: []\` to target specific changes (omit = all). Prefers libreoffice headless; falls back to JS.

ESCAPE HATCH
- \`edit\` — XPath + XML op array (replace / insert / remove / write / delete). Use ONLY when no high-level action fits. Engine runs a light syntactic validation (well-formed XML + namespace) before writing back. Always call WordInspect(xml) first to see real node names.

Conventions:
- File paths: \`create\` writes a NEW file at \`filePath\`; every other action mutates the existing \`filePath\` in place.
- Measurements: twips (1/1440 inch), half-points for font size (22 = 11pt), hex RGB without #. EMUs only for \`image.width\`.
- Run formatting: \`TextRun\` carries all character-level options; paragraph-level options (alignment / spacing / indent / pageBreakBefore / style) live on the paragraph block.
- Protected / password documents: not supported for write. Use DocConvert to produce an unprotected copy first.`,
  parameters: z.object({
    action: z.enum([
      'create',
      'replace-text',
      'add-image',
      'update-toc',
      'set-page-settings',
      'comment',
      'add-tracked-change',
      'resolve-changes',
      'edit',
    ]),
    filePath: z
      .string()
      .min(1)
      .describe(
        'For create: new file path. For every other action: existing .docx path that will be mutated in place.',
      ),

    // --- create --------------------------------------------------------------
    content: z
      .preprocess(jsonArrayPreprocess, z.array(contentItemSchema).optional())
      .describe(
        'Required for create. Array of block-level ContentItems (heading / paragraph / table / bullet-list / numbered-list / image / page-break / toc / footnote-ref / hyperlink).',
      ),
    documentSettings: documentSettingsSchema
      .optional()
      .describe(
        'For create: optional top-level page / columns / default font / header / footer. OMIT unless overriding defaults (A4 portrait, 2.54cm margins, Calibri 11pt, single column, no header/footer).',
      ),

    // --- replace-text --------------------------------------------------------
    find: z
      .string()
      .optional()
      .describe('For replace-text: literal string or regex source (when regex=true).'),
    replace: z
      .string()
      .optional()
      .describe('For replace-text: replacement text. Supports $1, $2 backrefs when regex=true.'),
    regex: z
      .boolean()
      .optional()
      .describe('For replace-text: interpret `find` as a regex. Default false.'),
    matchCase: z
      .boolean()
      .optional()
      .describe('For replace-text: case-sensitive match. Default true.'),
    wholeWord: z
      .boolean()
      .optional()
      .describe('For replace-text: word-boundary match. Default false.'),

    // --- add-image / anchors --------------------------------------------------
    imageSource: z
      .string()
      .optional()
      .describe('For add-image: local path or http(s) URL. The engine embeds bytes into word/media/ and registers rels.'),
    imageWidthPx: z
      .number()
      .optional()
      .describe('For add-image: display width in pixels (96 DPI). Omit to use natural size.'),
    imageHeightPx: z
      .number()
      .optional()
      .describe('For add-image: display height in pixels. Omit to preserve aspect ratio.'),
    imageAlt: z
      .string()
      .optional()
      .describe('For add-image: alt text (w:docPr descr).'),
    anchor: z
      .object({
        xpath: z
          .string()
          .optional()
          .describe('XPath of an existing w:p / w:r / w:tc to anchor at.'),
        position: z
          .enum(['before', 'after', 'end'])
          .optional()
          .describe('Placement relative to the xpath target, or "end" to append to body.'),
      })
      .optional()
      .describe('For add-image / comment: where to attach. Default "end" of body.'),

    // --- set-page-settings ---------------------------------------------------
    pageSettings: pageSettingsSchema
      .optional()
      .describe('For set-page-settings: new page size / orientation / margins to apply to the document\'s default section.'),
    columns: columnsSettingsSchema
      .optional()
      .describe('For set-page-settings: new column layout. Omit to keep existing.'),

    // --- comment -------------------------------------------------------------
    commentText: z
      .string()
      .optional()
      .describe('For comment: the comment body text.'),
    commentAuthor: z
      .string()
      .optional()
      .describe('For comment: author display name. Default "OpenLoaf AI".'),
    parentId: z
      .string()
      .optional()
      .describe('For comment: existing comment id to reply to (from WordInspect(comments)). Omit for a top-level comment.'),

    // --- tracked-change ------------------------------------------------------
    changeType: z
      .enum(['insert', 'delete', 'replace'])
      .optional()
      .describe('For add-tracked-change: kind of revision.'),
    changeText: z
      .string()
      .optional()
      .describe('For add-tracked-change: inserted text (insert / replace) or expected text to delete (delete / replace).'),
    changeReplace: z
      .string()
      .optional()
      .describe('For add-tracked-change changeType=replace: replacement text.'),
    changeAuthor: z
      .string()
      .optional()
      .describe('For add-tracked-change: author display name. Default "OpenLoaf AI".'),

    // --- resolve-changes -----------------------------------------------------
    decision: z
      .enum(['accept', 'reject'])
      .optional()
      .describe('For resolve-changes: how to handle the targeted tracked changes.'),
    ids: z
      .preprocess(jsonArrayPreprocess, z.array(z.string()).optional())
      .describe('For resolve-changes: specific change ids (from WordInspect(tracked-changes)). Omit to target ALL changes.'),

    // --- edit (escape hatch) -------------------------------------------------
    edits: z
      .preprocess(jsonArrayPreprocess, z.array(officeEditSchema).optional())
      .describe('Required for edit. XPath+XML ops. Engine runs lightweight syntactic validation before commit.'),
  }),
  needsApproval: true,
  component: null,
} as const
