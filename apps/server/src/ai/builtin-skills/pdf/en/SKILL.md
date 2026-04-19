---
name: pdf-skill
description: >
  All-in-one PDF read / write / convert / OCR. Trigger scenarios: summarize a PDF, extract text or tables, fill an AcroForm, fill a scanned or non-AcroForm form, render pages as images (for OCR / visual targeting), merge, split, add a watermark or confidentiality stamp, redact sensitive content, create a new PDF (invoice / report / receipt), convert between PDF and docx/md/txt. Typical phrasings: "summarize this PDF", "fill out this PDF form", "merge these PDFs", "add a watermark to the PDF", "convert PDF to Word", "OCR this scan", "show me what page 3 of the PDF looks like". Load this skill whenever the user mentions a .pdf file, needs to produce a PDF, or wants to make any change to a PDF.
---

# PDF Skill

A total of 4 tools, organized as **view → modify → convert → OCR**:

## Tool List

| Tool | Responsibility | Read-only |
|------|----------------|-----------|
| `PdfInspect` | **All read operations** (8 actions): summary / text / tables / form-fields / form-structure / images / annotations / render | Yes |
| `PdfMutate` | **All write operations** (12 actions): create / fill-form / fill-visual / add-text / merge / split / extract-pages / rotate / crop / watermark / decrypt / optimize | No |
| `DocConvert` | Format conversion: pdf ↔ docx / html / md / txt / xlsx / json, etc. | No |
| `CloudImageUnderstand` | **OCR entry point for scanned PDFs** (cloud, consumes credits) | No |

> **Loading (two steps, both required)**:
> 1. `LoadSkill pdf-skill` — only pulls this skill doc (the SKILL.md you're reading) into context; **tool schemas are not yet loaded, calling them directly will hit `InputValidationError`**.
> 2. `ToolSearch(query: "select:PdfInspect,PdfMutate,DocConvert")` — actually activates the tool schemas, after which these three tools can be called.
>
> `CloudImageUnderstand` is loaded through `cloud-media-skill`. `Read` is always available — for .pdf files it only does a lightweight summary (text volume / page count estimate, no guarantee of full extraction). **Whenever the user asks you to "analyze / summarize / fill / edit / convert / OCR a PDF", always go through `PdfInspect`/`PdfMutate`; do not try to get by with `Read`.**

---

## 1. Step One: Always start with `PdfInspect(summary)`

When you don't know what the PDF looks like, **don't** jump straight to `text` / `form-fields`; summary it first to get the full picture:

```
PdfInspect { action: "summary", filePath: "…" }
```

The returned `textType` has three branches that determine your next step:

| textType | Meaning | Next step |
|---|---|---|
| `extractable` | Normal text stream, directly extractable | `PdfInspect(text)` or `tables` |
| `scanned` | Pages are images, no text stream | `PdfInspect(render)` → `CloudImageUnderstand` for OCR |
| `cid-encoded` | Characters use CID encoding (extraction produces garbled text) | Same as `scanned`, go OCR route |
| `empty` | No text, no images (rare, usually corrupted file) | Inform the user, stop |

summary also returns `suggestedNextTool` — just follow its recommendation. Example:

```
suggestedNextTool: {
  tool: 'CloudImageUnderstand',
  precedingAction: 'render',
  reason: 'PDF pages contain no extractable text stream...'
}
```

⚠️ **Encrypted PDFs**: if summary returns `isEncrypted: true, needsPassword: true`, you **must** get the password from the user and re-run summary with the `password` parameter; otherwise all subsequent actions will return `error: 'PDF_ENCRYPTED'`.

---

## 2. Reading text / tables / images

### 2.1 `PdfInspect(text)` — default text extraction

```
PdfInspect { action: "text", filePath: "…", pageRange: "1-20" }
```

- **Large PDFs must be chunked**: `pageRange` ≤ 20 pages per call.
- When coordinates are needed for positioning, add `withCoords: true`; each text item will include `{ x, y, width, height }`.
- Coordinate system: **PDF points, origin at bottom-left**. A4 is roughly 595 × 842 pt.

### 2.2 `PdfInspect(tables)` — structured tables

Currently a simplified algorithm (`heuristic: 'simple-grid'`); complex tables may not be fully extracted. When extraction fails, fall back to `text` or ask the user to spell things out.

### 2.3 `PdfInspect(images)` — embedded image list

By default only metadata is returned (`page / indexInPage / width / height`). To get referenceable PNG URLs, add `extractImages: true`; images will be written to the current session's asset directory.

### 2.4 `PdfInspect(annotations)` — annotations

Highlight / Text / FreeText / Stamp / Link, etc. are all extractable with `subtype / rect / contents / url`.

---

## 3. Filling Forms — Two Paths, Always Probe First

### 3.1 AcroForm (true PDF forms)

**3-step workflow:**

```
Step 1  PdfInspect { action: "form-fields", filePath: "…", withRender: true }
        → returns fields[] + a rendered PNG per page (so the model can eyeball field positions)

Step 2  The model builds a { fieldName: value } mapping from user intent
        · checkbox: must use fields[i].checkedValue (e.g. "Yes" / "On"), don't guess "true" / "yes"
        · radio:    must use fields[i].radioOptions[j].value
        · dropdown: must use fields[i].choiceOptions[j].value

Step 3  PdfMutate { action: "fill-form", filePath: "…", fields: { … } }
        → returns { filledCount, skippedFields: [...] }
        A non-empty skippedFields means typos / wrong case; fix them against the Step 1 field list and retry.
```

### 3.2 Non-AcroForm (static forms / visual tables in scans)

**Prefer `fill-visual`** (it does bbox validation + automatic coordinate-system conversion); `add-text` is for single-point overlays only.

```
Step 1  PdfInspect { action: "form-structure", filePath: "…", pageRange: "1-3", withRender: true }
        → returns labels / lines / checkboxes / rowBoundaries + a rendered PNG per page

Step 2  The model derives each "fill-in point" entryBoundingBox from the label rect:
        · Text box:  x0 ≈ label.x1 + 5, y0..y1 from nearby rowBoundaries / horizontal lines
        · Checkbox:  use checkboxes[i].rect directly

Step 3  PdfMutate { action: "fill-visual", filePath: "…",
                     visualFields: [{
                       page, entryBoundingBox: [x0,y0,x1,y1],
                       text, fontSize?, coordSystem?: 'pdf' | 'image'
                     }, ...] }

        · coordSystem='pdf' (default): bbox in PDF points, origin bottom-left
        · coordSystem='image': bbox in pixels, origin top-left; must also pass imageWidth / imageHeight
          (dimensions of the rendered PNG); the tool auto-converts to PDF coordinates
        · When it returns 'BBOX_VALIDATION_FAILED', the errors array will clearly state
          which two boxes overlap / which box is too narrow for the text; fix accordingly and retry

Fallback: PdfMutate { action: "add-text", overlays: [...] } — for single-point overlays
          (stamps / watermarks / seals), coordinates provided by hand.
```

If you can't see clearly, just show the PNG URLs from Step 1's renders to the model as images (OpenLoaf supports multimodal). No need to crop — sending the full page image is enough.

---

## 4. OCR Workflow for Scanned PDFs (4-step loop)

```
Step 1  PdfInspect(summary) → textType: 'scanned'

Step 2  PdfInspect { action: "render", filePath: "…", pageRange: "1-12", scale: 2 }
        → returns pages: [{ page, url, width, height }, ...]
        Render multiple pages in one call; scale=2 default ≈144 DPI, sufficient for OCR.

Step 3  Call CloudImageUnderstand on each page PNG
        (If the user's tier allows parallelism, fire several concurrently; otherwise sequential.)

Step 4  Aggregate text from all pages; Write to .md / .txt if needed.
```

⚠️ `CloudImageUnderstand` consumes cloud credits. For large PDFs, render **the first 3 pages** and run OCR as a sample for the user first; run the full document only after confirmation.

---

## 5. Creating a PDF — `PdfMutate(create)`

```json
{
  "action": "create",
  "filePath": "invoice.pdf",
  "content": [
    { "type": "heading", "text": "Invoice #20260415", "level": 1 },
    { "type": "paragraph", "text": "To: ACME Corp", "bold": true },
    { "type": "table", "headers": ["Item", "Qty", "Price"], "rows": [["Widget", "3", "$30"]] },
    { "type": "paragraph", "text": "Total: $30" }
  ]
}
```

Supports 6 block types: `heading / paragraph / table / bullet-list / numbered-list / page-break`.

- **Write Chinese directly.** When CJK characters are detected, Noto Sans SC is embedded automatically.
- **Do not use Unicode subscript/superscript characters** (₀₁₂ / ⁰¹²). pdf-lib's WinAnsi standard fonts have no such glyphs and will render as black squares. Write chemical formulas like `H₂O` as `H2O` or split into two lines; structured support like `{ runs: [{ text, super: true }] }` will be added in phase 3.
- Mixed bold/italic within a paragraph is not yet supported (one style per paragraph). For rich-text layout, generate a DOCX and `DocConvert` to PDF.

---

## 6. Page-level Operations — split / extract-pages / rotate / crop

### 6.0 split — split

Two modes, pick one:

```json
// Split by group size
{ "action": "split", "filePath": "big.pdf", "outputDir": "./parts", "groupSize": 10 }
// → parts: [ "big-part1.pdf" (1-10), "big-part2.pdf" (11-20), ... ]

// Split at breakpoints
{ "action": "split", "filePath": "big.pdf", "outputDir": "./parts", "splitAt": [4, 8] }
// → parts: [ "big-part1.pdf" (1-3), "big-part2.pdf" (4-7), "big-part3.pdf" (8-end) ]
```

### 6.0 extract-pages — extract complex page ranges

```json
{ "action": "extract-pages", "filePath": "big.pdf", "outputPath": "subset.pdf",
  "pageRanges": "1,3-5,8,10-end" }
```

qpdf-style range syntax: single pages / ranges / `end` keyword / comma-separated combinations.

### 6.0 rotate — rotate pages

```json
{ "action": "rotate", "filePath": "scan.pdf",
  "rotations": [{ "page": 1, "degrees": 90 }, { "page": 3, "degrees": -90 }] }
```

`degrees` must be a multiple of 90 (negatives supported). The angle is **added to the existing rotation**, not a reset.

### 6.0 crop — crop visible area

```json
{ "action": "crop", "filePath": "doc.pdf",
  "crops": [{ "page": 1, "mediaBox": [50, 50, 500, 700] }] }
```

`mediaBox: [x, y, width, height]` in PDF points, origin bottom-left. Cropping only changes the visible area; it **does not delete** the original content (still visible on zoom out).

---

## 7. Merge / Watermark / Redaction

### 7.1 Merge — `PdfMutate(merge)`

```json
{ "action": "merge", "filePath": "out.pdf", "sourcePaths": ["cover.pdf", "body.pdf"] }
```

Concatenated in array order. If `filePath` matches a source filename it will overwrite; confirm with the user first.

### 7.2 Watermark — `PdfMutate(watermark)`

**Text watermark** (diagonal, semi-transparent):

```json
{ "action": "watermark", "filePath": "report.pdf",
  "watermarkType": "text", "watermarkText": "CONFIDENTIAL",
  "watermarkFontSize": 60, "watermarkColor": "#FF0000",
  "watermarkOpacity": 0.25, "watermarkAngle": -30,
  "watermarkPageRange": "1-10" }
```

**PDF watermark** (use a page from another PDF as the watermark):

```json
{ "action": "watermark", "filePath": "report.pdf",
  "watermarkType": "pdf", "watermarkPdfPath": "logo.pdf",
  "watermarkPdfPage": 1, "watermarkOpacity": 0.3 }
```

### 7.3 Single-point overlay / confidentiality stamp — `PdfMutate(add-text)`

Coordinate system: **PDF points, origin at bottom-left**. Larger y is higher up.

```json
{ "action": "add-text", "filePath": "report.pdf",
  "overlays": [{ "page": 1, "x": 400, "y": 780, "text": "APPROVED", "fontSize": 24, "color": "#FF0000" }] }
```

### 7.4 Redaction (visual cover-up)

Use the `background` field of `add-text` to put a white fill behind the text:

```json
{ "action": "add-text", "filePath": "doc.pdf",
  "overlays": [{ "page": 2, "x": 120, "y": 520, "text": "****", "fontSize": 12,
                 "background": { "color": "#FFFFFF", "padding": 2 } }] }
```

⚠️ **Redaction is only a visual cover-up; the underlying PDF text can still be extracted.** You must inform the user of this limitation.

---

## 8. Encrypt / Decrypt / Optimize

### 8.1 Decrypt — `PdfMutate(decrypt)`

```json
{ "action": "decrypt", "filePath": "locked.pdf", "outputPath": "unlocked.pdf", "password": "…" }
```

Note: **encrypted write-out is not supported** (by design). If the user wants to "add a password to a PDF", inform them that at this stage only decrypting existing encrypted files is supported.

### 8.2 Optimize / Linearize — `PdfMutate(optimize)`

```json
{ "action": "optimize", "filePath": "big.pdf", "outputPath": "small.pdf", "linearize": true }
```

- A default re-save performs basic compression
- `linearize: true` produces a web-friendly version (object streams disabled) for streaming PDF viewers

---

## 9. Format Conversion — `DocConvert`

```json
{ "filePath": "report.pdf", "outputPath": "report.docx", "outputFormat": "docx" }
```

- `pdf → docx` / `pdf → md` / `pdf → html`: **all are text-level conversions; complex layouts / image positions will be lost or misplaced.** Warn the user before converting.
- `docx → pdf` / `md → pdf` / `txt → pdf`: also text-level, with plain layout.

---

## 10. Hard Constraints Checklist (Pitfall Guide)

1. **summary before any action**: don't skip summary and go straight to text/form-fields; otherwise you waste a call when you hit an encrypted / scanned file.
2. **Encrypted PDFs must carry password**: check `summary.isEncrypted`; if no password, ask the user to provide one.
3. **Chunk large PDFs**: `pageRange` ≤ 20 pages per call.
4. **AcroForm values must come from the list**: checkbox uses `checkedValue`, radio uses `radioOptions[i].value`; don't guess "true"/"yes".
5. **Unicode super/subscript = black squares**: use ASCII substitutes when `create`-ing.
6. **Redaction is not true deletion**: underlying text is still extractable.
7. **`add-text` origin is bottom-left**: larger y is higher up.
8. **OCR consumes credits**: `CloudImageUnderstand` is a paid cloud API; sample large PDFs and confirm before running the full document.
9. **PDF render assets are session-scoped**: PNGs from `PdfInspect(render)` land in the current conversation's asset directory, **they don't exist in the next conversation**.
10. **CJK can be created directly**: Noto Sans SC is loaded automatically; don't convert Chinese to pinyin first.
