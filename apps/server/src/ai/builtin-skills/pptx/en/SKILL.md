---
name: pptx-skill
description: >
  Triggers whenever the user asks to do anything with PowerPoint slides (.pptx): read, summarize, extract, edit, create, or convert. Key insight: PPTX files are visually structured — charts, diagrams, and layouts cannot be reliably captured by text extraction alone. The correct approach for understanding slide content is to render the target slide(s) as PNG images (via PptxInspect render) and pass them to a vision model (CloudImageUnderstand), not to rely solely on text/outline extraction. Use text tools (outline / text / shapes) only as supplementary context. Typical phrasings: "summarize this PPT", "what is this deck about", "what's on slide 3", "describe page 5", "make me a Q4 report deck", "change the title of slide 3". Load this skill whenever the user mentions a .pptx file, deck, slides, or presentation.
---

# PPTX Skill

Read with `PptxInspect`; **write / edit / create with `JsSandbox`** running Node scripts (preferred library: `pptxgenjs`); format conversion with `DocConvert`; visual OCR with `CloudImageUnderstand`.

## Tool List

| Tool | Responsibility | Read-only |
|------|----------------|-----------|
| `PptxInspect` | Read: summary / outline / text / notes / tables / shapes / images / xml / render | Yes |
| `JsSandbox` | **All write**: create / edit / generate from scratch — use `pptxgenjs` for new decks, `adm-zip` to patch existing XML | No |
| `DocConvert` | pptx ↔ pdf / html / md | No |
| `CloudImageUnderstand` | OCR / chart understanding on rendered slides | No |

> **Loading (two steps)**:
> 1. `LoadSkill pptx-skill`
> 2. `ToolSearch(query: "select:PptxInspect,JsSandbox,DocConvert")`
>
> `Read` / `DocPreview` on a .pptx return only Markdown-level body text (losing shape coordinates, speaker notes, table structure, and XML detail). **Any task that involves analyzing, summarizing, editing, or reviewing a deck goes through `PptxInspect` + `JsSandbox`.**

---

## 1. Read: Start with `PptxInspect(summary)`

```
PptxInspect { action: "summary", filePath: "…" }
```

Returns `slideCount / layoutCount / masterCount / hasNotes / hasCharts / hasSmartArt / creator / modifiedAt / fileSize` plus a `suggestedNextTool` hint. Decision table:

| Situation | Next step |
|---|---|
| Don't know the deck's shape | `summary` → `outline` to scan titles |
| Need slide content | `text` (body text) / `notes` (speaker notes) |
| Need to locate anomalous visuals | `shapes` to get the shape tree, then `render` on suspicious slides |
| Need visual verification | `render` with `slideNumbers` filter |
| Need to export embedded images | `images` with `extractImages=true` |
| Need to plan XML-level edits | `xml` with `partName` for the target part |

### 1.1 Render notes

`render` uses **node-pptx-png** (skia-canvas-based, pure Node) — **no LibreOffice dependency**.

Known limitations:
- SmartArt, custom DrawingML charts (non-OpenXML), and WMF/EMF vector backgrounds may degrade.
- When fidelity matters: fallback to `DocConvert(from="pptx", to="pdf")` + `PdfInspect(render)` (LibreOffice rendering chain), or use `render` + `CloudImageUnderstand` for OCR.

---

## 2. Write: `JsSandbox` + `pptxgenjs`

### 2.1 Demo: Generate a quarterly business review deck

```js
import pptxgen from 'pptxgenjs'

const pres = new pptxgen()
pres.layout = 'LAYOUT_16x9'
pres.defineSlideMaster({
  title: 'MAIN',
  background: { color: 'FFFFFF' },
  objects: [
    { rect: { x: 0, y: 7.0, w: 13.33, h: 0.5, fill: { color: '1F3A8A' } } },
    { text: {
      text: 'OpenLoaf · 2026 Q1 Business Review',
      options: { x: 0.5, y: 7.05, w: 12, h: 0.4, fontSize: 10, color: 'FFFFFF' },
    }},
  ],
})

// Cover slide
const s1 = pres.addSlide({ masterName: 'MAIN' })
s1.addText('2026 Q1 Business Review', {
  x: 0.5, y: 2.2, w: 12.3, h: 1.5,
  fontSize: 44, bold: true, color: '1F3A8A',
  fontFace: 'Calibri',
})
s1.addText('Product Team · John Smith   2026-04-20', {
  x: 0.5, y: 4.0, w: 12.3, h: 0.6,
  fontSize: 18, color: '475569', fontFace: 'Calibri',
})

// Key metrics
const s2 = pres.addSlide({ masterName: 'MAIN' })
s2.addText('Key Metrics', {
  x: 0.5, y: 0.4, w: 12.3, h: 0.8,
  fontSize: 28, bold: true, color: '1F3A8A', fontFace: 'Calibri',
})
const kpis = [
  { label: 'Revenue',      value: '+32%',   color: '16A34A' },
  { label: 'Paying Users', value: '12k',    color: '2563EB' },
  { label: 'NPS',          value: '42→51',  color: '9333EA' },
]
kpis.forEach((k, i) => {
  const x = 0.5 + i * 4.3
  s2.addShape(pres.ShapeType.roundRect, {
    x, y: 2.0, w: 4.0, h: 3.0, fill: { color: 'F1F5F9' }, line: { color: 'CBD5E1' },
  })
  s2.addText(k.value, {
    x, y: 2.4, w: 4.0, h: 1.0, align: 'center',
    fontSize: 40, bold: true, color: k.color, fontFace: 'Calibri',
  })
  s2.addText(k.label, {
    x, y: 3.6, w: 4.0, h: 0.6, align: 'center',
    fontSize: 18, color: '475569', fontFace: 'Calibri',
  })
})
s2.addNotes('All three Q1 KPIs significantly exceeded targets. Paying users up 46% QoQ.')

// Bar chart slide
const s3 = pres.addSlide({ masterName: 'MAIN' })
s3.addText('Monthly Revenue', {
  x: 0.5, y: 0.4, w: 12.3, h: 0.8,
  fontSize: 28, bold: true, color: '1F3A8A', fontFace: 'Calibri',
})
s3.addChart(pres.ChartType.bar, [{
  name: 'Revenue ($k)',
  labels: ['Jan', 'Feb', 'Mar'],
  values: [820, 1050, 1340],
}], {
  x: 1.0, y: 1.5, w: 11.3, h: 5.5,
  showTitle: false, showLegend: true, showValue: true,
})

// Q&A slide
const s4 = pres.addSlide({ masterName: 'MAIN' })
s4.addText('Q & A', {
  x: 0.5, y: 3.0, w: 12.3, h: 1.5, align: 'center',
  fontSize: 60, bold: true, color: '1F3A8A', fontFace: 'Calibri',
})

await pres.writeFile({ fileName: 'q1_review.pptx' })
console.log('q1_review.pptx written')
```

> **Key points**:
> - `pptxgenjs` API is fully **object-based** (`{x, y, w, h, fontSize, ...}`) — no JSON string concatenation.
> - **CJK content requires `fontFace`** (e.g. `'Microsoft YaHei'` / `'Noto Sans CJK SC'`); without it, the default Latin font may substitute or corrupt CJK characters.
> - `addChart` natively supports bar / line / pie / doughnut; for "image-feel" charts, render a PNG with `chartjs-node-canvas` then `addImage` it.

### 2.2 Demo: Generate N slides from a data array (one item per slide)

```js
import pptxgen from 'pptxgenjs'

const items = [
  { title: 'Scene 1: The Arrival', desc: 'City aerial opening → multi-angle road shots → pull into market' },
  { title: 'Scene 2: Loading Power', desc: 'Owner greeting → full-load unboxing → trunk 87% opening rate 1831mm' },
  { title: 'Scene 3: Superior Chassis', desc: '186mm ground clearance + fold-flat cargo + fixed tie-down anchors' },
]

const pres = new pptxgen()
pres.layout = 'LAYOUT_16x9'

const cover = pres.addSlide()
cover.addText('V6 Commercial — Shot List', {
  x: 0.5, y: 2.8, w: 12.3, h: 1.3, align: 'center',
  fontSize: 40, bold: true, color: '0F172A', fontFace: 'Calibri',
})

items.forEach((it, i) => {
  const s = pres.addSlide()
  s.addText(`${i + 1}. ${it.title}`, {
    x: 0.5, y: 0.5, w: 12.3, h: 0.8,
    fontSize: 26, bold: true, color: '1F3A8A', fontFace: 'Calibri',
  })
  s.addText(it.desc, {
    x: 0.5, y: 1.7, w: 12.3, h: 3.5,
    fontSize: 20, color: '334155', fontFace: 'Calibri',
    valign: 'top',
  })
})

await pres.writeFile({ fileName: 'storyboard.pptx' })
console.log(`storyboard.pptx — ${items.length + 1} slides`)
```

### 2.3 Demo: Edit the title of slide N in an existing deck

`pptxgenjs` is generation-only and cannot read existing files. To edit an old deck, patch the XML with `adm-zip`:

```js
import AdmZip from 'adm-zip'
import fs from 'node:fs/promises'

const zip = new AdmZip(await fs.readFile('deck.pptx'))
const target = 'ppt/slides/slide3.xml'
let xml = zip.readAsText(target)
// Simple replacement of the first a:t text node
xml = xml.replace(/<a:t>[^<]*<\/a:t>/, '<a:t>New Title</a:t>')
zip.updateFile(target, Buffer.from(xml, 'utf-8'))
await fs.writeFile('deck.pptx', zip.toBuffer())
console.log('slide 3 title updated')
```

> This is a hard XML patch and will fail if the run is split across multiple `a:r` elements. The reliable approach is to regenerate the whole deck with `pptxgenjs`.

---

## 2.4 Per-slide Visual Understanding (branch by model capability)

When the user asks "what's on slide N?" / "what does this chart mean?" / "how does slide 5 look?" — anything that needs **visual comprehension** — branch on the **current model's `native-inputs`** (see the `<system-tag type="msg-context">` at the end of each user turn):

**Branch A — vision-capable model (`native-inputs` includes `image`)**: render to PNG, then `Read` the image path. The runtime injects the image as a native part via a follow-up user message at the next step, so you observe the pixels directly.

```
PptxInspect { action: "render", filePath: "…", slideNumbers: [5], scale: 1.5 }
  → result.data.pages[0].imagePath = "<asset_dir>/slide5-scale1.5.png"
Read { file_path: "<pages[0].imagePath>" }
  → runtime injects the image as a user-role image part; describe what you see
```

**Branch B — non-vision model (`native-inputs` does not include `image`)**: use `CloudImageUnderstand` (requires `LoadSkill cloud-media-skill`).

```
CloudImageUnderstand {
  image: { path: "<pages[0].imagePath>" },
  prompt: "Describe this slide in detail: title, bullet points, chart data (if any), layout. If the page has no chart or data table, say 'no data chart on this page' explicitly."
}
```

> ⚠️ **Anti-hallucination hard rule (both branches)**: before writing your reply, ask "does every number, region, name, or axis value I'm about to mention come from an actual visual channel?" — Branch A requires the image part the runtime just injected; Branch B requires a `CloudImageUnderstand` response. When neither produced observable content, do NOT invent anything from the filename, slide title, or surrounding text — reply "image content not retrieved, please confirm" or re-dispatch through the correct branch.

Batch (visual summary of a whole deck): omit `slideNumbers` to render all PNGs, then loop the matching branch per slide. For decks >20 slides, run `outline` first and confirm with the user before rendering.

---

## 3. Format Conversion

```
DocConvert(from="pptx", to="pdf", sourcePath="…")    // for distribution / high-fidelity rendering via LibreOffice
DocConvert(from="pptx", to="md",  sourcePath="…")    // extract body text / generate summaries
```

---

## 4. Common Error Recovery

| Symptom | Cause | Fix |
|---|---|---|
| `PPT_LEGACY_FORMAT` | Binary `.ppt` format | `DocConvert(from="ppt", to="pptx")` to convert first |
| CJK shows as squares / replaced by letters | `fontFace` not set | Pass `fontFace: 'Microsoft YaHei'` on every `addText` / `addChart` |
| `render` result: SmartArt distorted | node-pptx-png does not support SmartArt | Fallback to `DocConvert(to="pdf")` + `PdfInspect(render)` |
| `writeFile` output can't be opened | Path traversal / permission issue | Use a relative path — files land in the session cwd (asset dir) |
| Generating many slides is slow | Repeated `addText` calls per slide | Put common elements in `defineSlideMaster`; only put differences on each slide |

To patch a script: `JsSandbox(action="edit-and-run", scriptPath=…, edits=[…])` — fewer tokens transferred.
