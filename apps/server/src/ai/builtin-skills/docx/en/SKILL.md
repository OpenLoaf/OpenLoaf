---
name: docx-skill
description: >
  All-in-one Word document (.docx) read / write / convert / review. Trigger scenarios: summarize a docx, read paragraphs / outline / tables / images / comments / tracked changes, replace body text, insert images, change page settings, rebuild table of contents, add comments or replies, add tracked changes (insert/delete/replace), accept/reject revisions, convert docx ↔ pdf/html/md/txt. Typical phrasings: "summarize this Word doc", "change the second paragraph to XXX", "replace all 'Company A' with 'Company B'", "add a tracked change comment", "accept all revisions", "convert docx to pdf", "generate a sales report from these bullet points". Load this skill whenever the user mentions a .docx / .doc file or targets a Word document as the deliverable.
---

# DOCX Skill

Read with `WordInspect`; **all write / modify / create operations use `JsSandbox`** to run Node scripts (preferred library: `docx`); format conversion uses `DocConvert`.

## Tool List

| Tool | Responsibility | Read-only |
|------|----------------|-----------|
| `WordInspect` | Read: summary / outline / text / tables / images / comments / tracked-changes / xml / render | Yes |
| `JsSandbox` | **All writes**: create / replace-text / add-image / comment / resolve-changes… implemented with `docx` + `adm-zip` | No |
| `DocConvert` | docx ↔ pdf / html / md / txt | No |
| `CloudImageUnderstand` | OCR entry point for scanned docx files | No |

> **Loading (two steps)**:
> 1. `LoadSkill docx-skill`
> 2. `ToolSearch(query: "select:WordInspect,JsSandbox,DocConvert")`
>
> `Read` / `DocPreview` on a .docx returns only Markdown-level body text (losing rPr / pPr / table merges / tracked changes / comments); **any "analyze / summarize / edit / create / review Word" task must go through `WordInspect` + `JsSandbox`**.

---

## 1. Read: Start with `WordInspect(summary)`

```
WordInspect { action: "summary", filePath: "…" }
```

Returns `pageCount / wordCount / headingCount / hasTrackedChanges / hasComments / isProtected / availableStyles`. Branch accordingly:

| Signal | Next step |
|---|---|
| `isProtected: true` | Writes not supported; use `DocConvert` to produce an unprotected copy first |
| `hasTrackedChanges` | `WordInspect(tracked-changes)` → resolve with the script in §2.4 |
| `hasComments` | `WordInspect(comments)` to get the parent/reply tree |
| `wordCount === 0 && pageCount >= 1` | Likely scanned; `WordInspect(render)` + `CloudImageUnderstand` |

---

## 2. Write: `JsSandbox` + `docx`

Use the [**docx** npm package](https://docx.js.org) (flumens/docx) to programmatically build docx OOXML. Broadest coverage for styles / tracked changes / comments.

### 2.1 Demo: Generate a meeting notes document

```js
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, PageOrientation,
} from 'docx'
import fs from 'node:fs/promises'

const title = new Paragraph({
  heading: HeadingLevel.HEADING_1,
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: 'Q2 Product Planning — Meeting Notes', bold: true, size: 36 })],
})

const meta = new Paragraph({
  children: [new TextRun({ text: 'Date: 2026-04-20   Attendees: Alice / Bob / Carol', size: 22 })],
})

const decisions = [
  ['Alice', 'Q2 feature schedule', '2026-05-10'],
  ['Bob', 'API documentation', '2026-04-30'],
]
const tbl = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({
      tableHeader: true,
      children: ['Owner', 'Item', 'Due Date'].map(
        t => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })],
        }),
      ),
    }),
    ...decisions.map(row => new TableRow({
      children: row.map(v => new TableCell({ children: [new Paragraph(v)] })),
    })),
  ],
})

const doc = new Document({
  creator: 'OpenLoaf',
  styles: {
    default: {
      document: { run: { font: 'Calibri' } },
    },
  },
  sections: [{
    properties: { page: { orientation: PageOrientation.PORTRAIT } },
    children: [title, meta, new Paragraph({ text: '' }), tbl],
  }],
})

await fs.writeFile('meeting_notes.docx', await Packer.toBuffer(doc))
console.log('meeting_notes.docx written')
```

> **CJK font**: set `styles.default.document.run.font` to `'Microsoft YaHei'` / `'SimSun'` / `'Noto Sans CJK SC'` to avoid rendering squares in Word.

### 2.2 Demo: Text replacement (simple find-replace)

In docx, `{{placeholder}}` tokens may be split across multiple `w:r` runs by Word. Use `WordInspect(xml)` to check the structure. When the placeholder lives in a single run:

```js
import AdmZip from 'adm-zip'
import fs from 'node:fs/promises'

const zip = new AdmZip(await fs.readFile('in.docx'))
let xml = zip.readAsText('word/document.xml')
xml = xml
  .replace(/\{\{date\}\}/g, '2026-04-20')
  .replace(/\{\{name\}\}/g, 'John Smith')
zip.updateFile('word/document.xml', Buffer.from(xml, 'utf-8'))
await fs.writeFile('out.docx', zip.toBuffer())
console.log('replaced')
```

When runs are split, rewriting the whole `new Document({...})` is more reliable.

### 2.3 Demo: Insert image + header logo

```js
import {
  Document, Packer, Paragraph, ImageRun, Header, AlignmentType,
} from 'docx'
import fs from 'node:fs/promises'

const logo = await fs.readFile('logo.png')

const doc = new Document({
  sections: [{
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new ImageRun({
            data: logo,
            transformation: { width: 80, height: 24 },
          })],
        })],
      }),
    },
    children: [
      new Paragraph({ text: 'Report body...' }),
      new Paragraph({
        children: [new ImageRun({
          data: await fs.readFile('chart.png'),
          transformation: { width: 500, height: 300 },
        })],
      }),
    ],
  }],
})
await fs.writeFile('report.docx', await Packer.toBuffer(doc))
```

### 2.4 Demo: Accept all tracked changes

No direct API; use `adm-zip` to edit `document.xml`:

```js
import AdmZip from 'adm-zip'
import fs from 'node:fs/promises'

const zip = new AdmZip(await fs.readFile('in.docx'))
let xml = zip.readAsText('word/document.xml')
// 1) Accept all w:ins (keep content, remove tags)
xml = xml.replace(/<w:ins [^>]*>([\s\S]*?)<\/w:ins>/g, '$1')
// 2) Accept all w:del (remove the deleted content)
xml = xml.replace(/<w:del [^>]*>[\s\S]*?<\/w:del>/g, '')
zip.updateFile('word/document.xml', Buffer.from(xml, 'utf-8'))
await fs.writeFile('out.docx', zip.toBuffer())
console.log('tracked changes accepted')
```

---

## 3. Format Conversion with `DocConvert`

```
DocConvert(from="docx", to="pdf",  sourcePath="…")
DocConvert(from="docx", to="md",   sourcePath="…")
DocConvert(from="docx", to="html", sourcePath="…")
```

Backed by LibreOffice headless; layout fidelity is superior to hand-coded conversion.

---

## 4. Common Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Chinese shows as squares | CJK font not set | `styles.default.document.run.font = 'Microsoft YaHei'` |
| Find-replace fails | Placeholder split across multiple runs | Use `WordInspect(xml)` to inspect structure, or rewrite with `docx` |
| `ImageRun` image distorted | `transformation.width/height` not provided | Always pass pixel dimensions |
| Word reports "document repaired" on open | Invalid XML / hand-edited OOXML | Use `docx` package to generate; don't manually edit OOXML |

To patch a script: `JsSandbox(action="edit-and-run", scriptPath=<previous path>, edits=[{find,replace}])` — only pass the diff.
