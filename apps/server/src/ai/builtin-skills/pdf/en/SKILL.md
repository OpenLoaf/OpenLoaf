---
name: pdf-skill
description: >
  All-in-one PDF read / write / convert / OCR. Trigger scenarios: summarize a PDF, extract text or tables, fill an AcroForm, render pages as images, merge, split, add a watermark, rotate, encrypt/decrypt, create a new PDF (invoice / report / receipt), convert between PDF and docx/md/txt. Typical phrasings: "summarize this PDF", "fill out this PDF form", "merge these PDFs", "add a watermark to the PDF", "convert PDF to Word", "OCR this scan", "show me what page 3 of the PDF looks like". Load this skill whenever the user mentions a .pdf file, needs to produce a PDF, or wants to make any change to a PDF.
---

# PDF Skill

Read with `PdfInspect`; **all write / modify / create operations use `JsSandbox`** to run Node scripts via `pdf-lib` / `pdfkit` / `pdf-parse` and similar pre-installed libraries; format conversion uses `DocConvert`; scanned PDFs go through `CloudImageUnderstand`.

## Tool List

| Tool | Responsibility | Read-only |
|------|----------------|-----------|
| `PdfInspect` | Read: summary / text / tables / form-fields / form-structure / images / annotations / render | Yes |
| `JsSandbox` | **All write operations**: create new PDF, merge, watermark, rotate, fill forms, decrypt… implemented with `pdf-lib` / `pdfkit` code | No |
| `DocConvert` | Format conversion: pdf ↔ docx / html / md / txt / xlsx | No |
| `CloudImageUnderstand` | OCR entry point for scanned PDFs (cloud, consumes credits) | No |

> **Loading (two steps, both required)**:
> 1. `LoadSkill pdf-skill` — only pulls this skill doc into context.
> 2. `ToolSearch(query: "select:PdfInspect,JsSandbox,DocConvert")` — activates the tool schemas.
>
> `Read` on a .pdf gives only a lightweight summary; **any analysis / summarization / fill / edit / convert / OCR of a PDF must go through `PdfInspect` + `JsSandbox`**.

---

## 1. Read: `PdfInspect` is the only entry point

When you don't know what the PDF looks like, run `summary` first:

```
PdfInspect { action: "summary", filePath: "…" }
```

Returns `pageCount / fileSize / characterCount / hasForm / encryption / textType`. Branch on `textType`:

| textType | Next step |
|---|---|
| `extractable` | `PdfInspect(text)` — direct full-text extraction |
| `scanned` / `cid-encoded` | `PdfInspect(render, pageRange)` → `CloudImageUnderstand` on each PNG for OCR |
| `isEncrypted: true` | Decrypt with `JsSandbox` + `pdf-lib`, or call `PdfInspect(password)` |

**Large PDFs must pass `pageRange`** (e.g. `"1-5"`), otherwise output will be truncated.

AcroForm forms: call `PdfInspect(form-fields)` to get `checkedValue / radioOptions` before filling.

---

## 2. Write: `JsSandbox` + `pdf-lib` / `pdfkit`

**Prefer `pdf-lib`** (edit existing PDFs / merge / watermark / rotate / fill forms / decrypt);
**use `pdfkit` from scratch** when you need complex layouts (vector + text + images).

### 2.1 Demo: Create an invoice PDF from scratch (`pdfkit`)

```js
import PDFDocument from 'pdfkit'
import fs from 'node:fs'

const doc = new PDFDocument({ size: 'A4', margin: 48 })
doc.pipe(fs.createWriteStream('invoice.pdf'))

doc.fontSize(22).text('INVOICE', { align: 'right' })
doc.moveDown()
doc.fontSize(10).text('Acme Corp', { align: 'right' })
doc.text('Invoice #2026-042   Date: 2026-04-20', { align: 'right' })
doc.moveDown()

// Simple table
const rows = [
  ['Widget', 1, 50.00],
  ['Gadget', 2, 30.00],
]
doc.fontSize(12).text('Description     Qty     Unit     Total')
doc.moveTo(48, doc.y).lineTo(547, doc.y).stroke()
let total = 0
for (const [name, qty, unit] of rows) {
  const line = qty * unit
  total += line
  doc.text(`${name.padEnd(14)} ${qty}       $${unit.toFixed(2)}   $${line.toFixed(2)}`)
}
doc.moveDown().fontSize(14).text(`Total: $${total.toFixed(2)}`, { align: 'right' })

doc.end()
await new Promise(r => doc.on('end', r))
console.log('invoice.pdf written')
```

> **CJK note**: pdfkit's default fonts have no CJK glyphs. For Chinese output, call `doc.registerFont('cn', '/path/to/NotoSansCJK.ttf')` first, then `doc.font('cn')`. System fallback fonts are not guaranteed to cover CJK.

### 2.2 Demo: Add a `CONFIDENTIAL` watermark to an existing PDF (`pdf-lib`)

```js
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib'
import fs from 'node:fs/promises'

const src = await fs.readFile(process.argv[2] ?? 'input.pdf')
const pdf = await PDFDocument.load(src)
const font = await pdf.embedFont(StandardFonts.HelveticaBold)

for (const page of pdf.getPages()) {
  const { width, height } = page.getSize()
  page.drawText('CONFIDENTIAL', {
    x: width / 2 - 140,
    y: height / 2,
    size: 64,
    font,
    color: rgb(0.9, 0.1, 0.1),
    opacity: 0.25,
    rotate: degrees(-30),
  })
}

const out = await pdf.save()
await fs.writeFile('watermarked.pdf', out)
console.log(`watermarked ${pdf.getPageCount()} pages`)
```

### 2.3 Demo: Merge PDFs (`pdf-lib`)

```js
import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs/promises'

const merged = await PDFDocument.create()
for (const p of ['a.pdf', 'b.pdf', 'c.pdf']) {
  const src = await PDFDocument.load(await fs.readFile(p))
  const pages = await merged.copyPages(src, src.getPageIndices())
  pages.forEach(pg => merged.addPage(pg))
}
await fs.writeFile('merged.pdf', await merged.save())
console.log(`merged → ${merged.getPageCount()} pages`)
```

### 2.4 Demo: Fill an AcroForm (run `PdfInspect(form-fields)` first to get `checkedValue`)

```js
import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs/promises'

const pdf = await PDFDocument.load(await fs.readFile('form.pdf'))
const form = pdf.getForm()
form.getTextField('full_name').setText('John Smith')
form.getCheckBox('agree').check()          // use setValue('Y') if PdfInspect gives checkedValue='Y'
form.getRadioGroup('gender').select('M')
// form.flatten()  // call this to lock the form
await fs.writeFile('filled.pdf', await pdf.save())
console.log('form filled')
```

### 2.5 Demo: Decrypt / rotate / extract pages

```js
// Decrypt
import { PDFDocument } from 'pdf-lib'
const pdf = await PDFDocument.load(buf, { password: 'secret', ignoreEncryption: false })
await fs.writeFile('unlocked.pdf', await pdf.save())

// Rotate page 1 by 90°
pdf.getPage(0).setRotation(degrees(90))

// Extract pages 3 and 5 into a new PDF
const out = await PDFDocument.create()
const [p3, p5] = await out.copyPages(pdf, [2, 4])
out.addPage(p3); out.addPage(p5)
```

---

## 3. OCR (scanned PDFs)

```
PdfInspect(summary)              // textType == 'scanned'
PdfInspect(render, pageRange)    // yields [<asset>/render-p1.png, ...]
CloudImageUnderstand(image=<each png>, question='Extract all text accurately')
```

---

## 4. Format Conversion

```
DocConvert(from="pdf", to="docx", sourcePath="…")   # PDF → Word for editing
DocConvert(from="docx", to="pdf", sourcePath="…")   # Word → PDF for distribution
```

`DocConvert` is faster and better at preserving layout than `JsSandbox + pdf-lib`; **prefer it for format conversion**.

---

## 5. Common Error Fallbacks

| Symptom | Cause | Fix |
|---|---|---|
| Garbled / square characters with `pdfkit` | Default font has no CJK glyphs | Call `registerFont('cn', '/path/to/NotoSansCJK.ttf')` first |
| `pdf-lib` throws `EncryptedPDFError` on load | File is encrypted | `PDFDocument.load(buf, { password: '…' })` |
| Watermark uneven across pages | Pages have different sizes | Loop `page.getSize()` and compute x/y per page |
| Merged PDF has font rendering differences | Source PDFs have incomplete embedded fonts | Rewrite with `pdf-lib`'s `useObjectStreams: false` |
| `TypeError: Cannot read properties of undefined (reading 'save')` | `pdfkit` has no `doc.save()` / `doc.restore()` (those are Canvas 2D APIs) | Switch colors / sizes directly via `doc.fillColor()` / `doc.fontSize()` — no save/restore stack needed. Finish the document with `doc.pipe(fs.createWriteStream(...)); doc.end()` |

To patch a script: `JsSandbox(action="edit-and-run", scriptPath=<previous path>, edits=[{find,replace}])` — only pass the diff.
