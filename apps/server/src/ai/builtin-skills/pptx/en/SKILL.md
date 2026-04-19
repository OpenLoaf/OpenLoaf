---
name: pptx-skill
description: >
  Triggers whenever the user asks to do anything with PowerPoint slides (.pptx): summarize a deck, extract key points per slide, change titles or subtitles, edit body text or speaker notes, insert / remove / reorder slides, generate a report / pitch / training deck from scratch, or turn points discussed in the conversation into slides. Typical phrasings: "summarize this PPT", "what is this deck about", "pull out the key points of each slide", "make me a Q4 report deck", "change the title of slide 3", "add a slide to the PPT", "turn these points into slides". Load this skill whenever the user mentions a deck / slide / presentation / reporting deliverable.
---

# PowerPoint (PPTX) Skill

This skill involves 4 tools, organized as **read → write → convert**:

| Tool | Responsibility | Read-only |
|------|----------------|-----------|
| `Read` | Default entry point for reading a PPTX. Returns per-slide title + body summary | Yes |
| `DocPreview` | Two modes: `preview` (per-slide title + summary) / `full` (full text of every slide) | Yes |
| `PptxMutate` | The only write tool. 2 actions: `create` / `edit` | No |
| `DocConvert` | Format conversion: pptx → pdf, etc. | No |

> **Tools are loaded on demand**: `DocPreview`, `PptxMutate`, and `DocConvert` must be loaded via `ToolSearch(names: "tool name")` before calling. `Read` is always available.

---

## 1. Reading a PPTX

### 1.1 Quick overview with `Read`

Just `Read(file_path)`. Returns per-slide title + body summary. Good for getting a fast sense of the deck.

### 1.2 Fine-grained reading with `DocPreview`

| Parameter | Description |
|-----------|-------------|
| `mode: 'preview'` | Per-slide title + body summary (default) |
| `mode: 'full'` | Fully expanded text of every slide |

> **Read / DocPreview return Markdown, not OOXML**. To do XPath edits you must first run `Bash unzip -p file.pptx ppt/slides/slide1.xml` to inspect the raw XML structure.

---

## 2. PptxMutate — Writing to a PPTX

The `action` field distinguishes the 2 operations. `needsApproval: true` — an approval dialog pops up when called.

### 2.1 create — Build from scratch

`slides` is an array; each element has:

| Field | Type | Description |
|-------|------|-------------|
| `title` | string? | Slide title |
| `textBlocks` | string[]? | Array of body text blocks; each element is one paragraph |
| `notes` | string? | Speaker notes (not shown on the slide; good for detailed data and presentation cues) |

Full CJK support.

```json
{
  "action": "create",
  "filePath": "/work/2026Q1_report.pptx",
  "slides": [
    {
      "title": "2026 Q1 Business Review",
      "textBlocks": ["Presenter: Zhang San", "Date: 2026-04-15"],
      "notes": "Opening greeting, introduce today's agenda"
    },
    {
      "title": "Key Metrics",
      "textBlocks": ["Revenue +32% YoY", "12k new paying users", "NPS up from 42 to 51"],
      "notes": "NPS gain comes from support response optimization: first-response time dropped from 4h to 35min"
    },
    {
      "title": "Next Quarter Priorities",
      "textBlocks": ["Expand into Southeast Asia", "Launch enterprise edition", "Close Series B"]
    },
    { "title": "Q&A", "textBlocks": ["Thank you"] }
  ]
}
```

**Content design tips**:
- Keep each title ≤ 10 words; each textBlock 3-5 lines with ≤ 20 words per line
- Put detailed data and supplementary explanations in `notes`, keep the body concise
- `create` supports only text and title layouts — no charts, custom shapes, or SmartArt

### 2.2 edit — Modify an existing file

A PPTX is essentially a ZIP package. Key internal paths:

| ZIP path | Content |
|----------|---------|
| `ppt/slides/slide1.xml` | OOXML body of slide 1 |
| `ppt/presentation.xml` | Global index, includes `sldIdLst` (determines slide order) |
| `ppt/slides/_rels/slide1.xml.rels` | Reference relations for slide1 (images / hyperlinks) |
| `ppt/media/image1.png` | Embedded media file |

**You must inspect the raw XML before editing**:
```bash
unzip -p /work/deck.pptx ppt/slides/slide2.xml
```

`edits` array; each element:

| op | Purpose | Required fields |
|----|---------|-----------------|
| `replace` | Replace nodes matched by xpath | `path`, `xpath`, `xml` |
| `insert` | Insert before/after the xpath node | `path`, `xpath`, `xml`, `position` (`before`/`after`) |
| `remove` | Remove nodes matched by xpath | `path`, `xpath` |
| `write` | Write a new file into the ZIP (e.g. an image) | `path`, `source` (file path or URL) |
| `delete` | Delete a file inside the ZIP | `path` |

Text replacement example:
```json
{
  "action": "edit",
  "filePath": "/work/deck.pptx",
  "edits": [{
    "op": "replace",
    "path": "ppt/slides/slide2.xml",
    "xpath": "//a:t[text()='Old Title']",
    "xml": "<a:t xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\">New Title</a:t>"
  }]
}
```

PPTX text node structure: `p:sp → p:txBody → a:p → a:r → a:t`. Namespace `a:` = `http://schemas.openxmlformats.org/drawingml/2006/main`.

---

## 3. DocConvert — Format Conversion

```json
{ "filePath": "/work/deck.pptx", "outputPath": "/work/deck.pdf", "outputFormat": "pdf" }
```

Supported outputFormat: `pdf`, `docx`, `html`, `md`, `txt`, `csv`, `xls`, `xlsx`, `json`

---

## 4. Key Constraints

1. **Always `unzip -p` and inspect XML before editing**. The Markdown returned by Read/DocPreview hides the real node structure — blind XPath writes = silently no-op.
2. **Text runs may be split**. A single visible line of text may be composed of multiple `<a:r>` elements (any font/formatting change splits the run), so `//a:t[text()='the whole sentence']` may not match. Inspect the XML first to confirm run splitting, or use `contains()` with partial matches.
3. **Slide order is not determined by filename**. `slide5.xml` is not necessarily the 5th slide. The true order is defined by `<p:sldIdLst>` inside `ppt/presentation.xml`.
4. **Media references go through rels**. A slide's `r:embed="rId3"` maps to an entry in `_rels/slideN.xml.rels`. Replacing an image requires updating the rels entry and writing the new file with a `write` op.
5. **Use create for big changes, edit for small ones**. When changes exceed ~30% of the content, re-creating is more reliable than patching with XPath.
6. **Merge all edits into a single call**. Reduces approval dialogs and intermediate states.
7. **create overwrites files with the same name**. Prefer a new filename or confirm with the user first.
