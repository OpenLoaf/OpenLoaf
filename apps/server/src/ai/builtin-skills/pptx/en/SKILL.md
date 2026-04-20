---
name: pptx-skill
description: >
  Triggers whenever the user asks to do anything with PowerPoint slides (.pptx): summarize a deck, extract key points per slide, change titles or subtitles, edit body text or speaker notes, insert / remove / reorder slides, generate a report / pitch / training deck from scratch, or turn bullet points discussed in the conversation into slides. Typical phrasings: "summarize this PPT", "what is this deck about", "pull out the key points of each slide", "make me a Q4 report deck", "change the title of slide 3", "add a slide to the PPT", "turn these points into slides". Load this skill whenever the user mentions a deck / slide / presentation / reporting deliverable.
---

# PPTX Skill

**Create PPT with `JsSandbox` + `pptxgenjs`** (most friendly API); read / analyze existing deck content via `DocConvert(from="pptx", to="md")` → `Read` the markdown; format conversion uses `DocConvert`.

## Tool List

| Tool | Responsibility | Read-only |
|------|----------------|-----------|
| `JsSandbox` | **All write & read**: create decks / edit slides / insert slides — all via `pptxgenjs`; use `adm-zip` + XML parsing to analyze an existing deck | No |
| `DocConvert` | pptx ↔ pdf / html; convert old deck to md for reading | No |

> **Loading (two steps)**:
> 1. `LoadSkill pptx-skill`
> 2. `ToolSearch(query: "select:JsSandbox,DocConvert")`

---

## 1. Read: Convert to markdown first, then deep-dive with JsSandbox if needed

Simple case:

```
DocConvert(from="pptx", to="md", sourcePath="deck.pptx")  // outputs deck.md
Read(file_path="<asset>/deck.md")                          // body text + page boundaries
```

When you need precise structure (shape coordinates / theme colors / speaker notes), parse the XML with JsSandbox:

```js
import AdmZip from 'adm-zip'
import fs from 'node:fs/promises'

const zip = new AdmZip(await fs.readFile('deck.pptx'))
const slides = zip.getEntries()
  .filter(e => e.entryName.startsWith('ppt/slides/slide'))
  .sort((a, b) => a.entryName.localeCompare(b.entryName))

for (const e of slides) {
  const xml = e.getData().toString('utf-8')
  const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1])
  console.log(`=== ${e.entryName} ===`)
  console.log(texts.join('\n'))
}
```

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
> - `pptxgenjs` API is fully **object-based** (`{x, y, w, h, fontSize, ...}`) — no JSON string concatenation needed.
> - **CJK requires `fontFace`** (e.g. `'Microsoft YaHei'` / `'Noto Sans CJK SC'`), otherwise the default English font may substitute or mangle CJK characters.
> - `addChart` natively supports bar / line / pie / doughnut; for "image-feel" charts, use `chartjs-node-canvas` to render a PNG and `addImage` it.

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

// Cover
const cover = pres.addSlide()
cover.addText('V6 Commercial — Shot List', {
  x: 0.5, y: 2.8, w: 12.3, h: 1.3, align: 'center',
  fontSize: 40, bold: true, color: '0F172A', fontFace: 'Calibri',
})

// One slide per scene
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

`pptxgenjs` is generation-only; it cannot read existing files. To edit an old deck, use `adm-zip` to patch the XML:

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

> This is a hard XML patch; it fails when runs are split. The robust approach is to regenerate the whole deck with `pptxgenjs`.

---

## 3. Format Conversion

```
DocConvert(from="pptx", to="pdf", sourcePath="…")    // for external distribution
DocConvert(from="pptx", to="md",  sourcePath="…")    // extract body text / summarize
```

---

## 4. Common Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| CJK shows as squares / replaced by letters | `fontFace` not set | Pass `fontFace: 'Microsoft YaHei'` on every `addText` / `addChart` |
| Chart axis labels appear in wrong font | `catAxisLabelFontFace` not set | Always add this for mixed-language charts |
| `writeFile` output can't be opened | Path traversal / permission issue | Use a relative path — files land in the session cwd (asset dir) |
| Generating many slides is slow | Repeated `addText` calls per slide | Put common elements in `defineSlideMaster`; only put differences on each slide |

To patch a script: `JsSandbox(action="edit-and-run", scriptPath=…, edits=[…])` — fewer tokens transferred.
