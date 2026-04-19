---
name: docx-skill
description: >
  Triggered whenever the user asks to do anything with a Word document (.docx): summarize the body, extract paragraphs / tables, change headings, insert paragraphs, replace fragments, generate reports / memos / contracts / resumes / business documents from data, and convert between docx and pdf / html / md / txt. Typical phrasings: "summarize this Word doc for me", "what is this docx about", "change the second paragraph to XXX", "write a sales report", "turn these bullet points into a Word doc", "pull the tables out of the contract". Any request that touches a .docx / .doc file, or that targets a Word document as the deliverable, should load this skill.
---

# Word (DOCX) Skill

This skill covers 4 tools, organized as **read → write → convert**:

| Tool | Responsibility | Read-only |
|------|------|------|
| `Read` | Default entry point for reading a DOCX. Returns Markdown body + `<meta>` (page count, paragraph count). | Yes |
| `DocPreview` | Two modes: `preview` (heading outline + first paragraph + stats) / `full` (complete Markdown body + extracted images) | Yes |
| `WordMutate` | The only write tool. 2 actions: `create` / `edit` | No |
| `DocConvert` | Format conversion: docx ↔ pdf / html / md / txt, etc. | No |

> **Tools are loaded on demand**: `DocPreview`, `WordMutate`, and `DocConvert` must be loaded via `ToolSearch(names: "tool name")` before calling. `Read` is always available.

---

## 1. Reading a DOCX

### 1.1 Quick overview with `Read`

Just call `Read(file_path)`. It returns the body in Markdown form plus `<meta>` (page count, paragraph count, etc.). Good for quickly judging the content.

### 1.2 Fine-grained reading with `DocPreview`

| Parameter | Description |
|------|------|
| `mode: 'preview'` | Heading outline, first paragraph, statistics (default) |
| `mode: 'full'` | Full Markdown body + embedded images extracted to the asset directory |

For large documents, use `preview` first to see the structure, then switch to `full` as needed.

> **Read / DocPreview returns Markdown, not OOXML.** To do XPath edits you must first run `Bash unzip -p file.docx word/document.xml` to inspect the raw XML structure.

---

## 2. WordMutate — Writing DOCX

The `action` field distinguishes the 2 operations. `needsApproval: true` — an approval dialog pops up after the call.

### 2.1 create — Create from scratch

`content` is an array of structured blocks supporting 5 types:

| type | Fields |
|------|------|
| `heading` | `text`, `level?` (1-6, defaults to 1) |
| `paragraph` | `text`, `bold?`, `italic?` |
| `table` | `headers: string[]`, `rows: string[][]` |
| `bullet-list` | `items: string[]` |
| `numbered-list` | `items: string[]` |

```json
{
  "action": "create",
  "filePath": "/work/report.docx",
  "content": [
    { "type": "heading", "text": "2026 Q1 Sales Report", "level": 1 },
    { "type": "paragraph", "text": "Overall performance this quarter exceeded expectations, up 23% year-over-year." },
    { "type": "table", "headers": ["Region", "Revenue", "YoY"], "rows": [["East China", "12.4M", "+28%"]] },
    { "type": "bullet-list", "items": ["Expand into Southeast Asia", "Launch enterprise edition"] }
  ]
}
```

**Full CJK support**: WordMutate's create can write Chinese / Japanese / Korean characters directly. PdfMutate and DocConvert now also support Chinese PDF output.

### 2.2 edit — Modify an existing file

Word's main document XML lives inside the ZIP at `word/document.xml`. Editing = applying XPath modifications to that XML.

**You must inspect the raw XML before editing**:
```bash
unzip -p /work/report.docx word/document.xml
```

`edits` is an array; each element has:

| op | Purpose | Required fields |
|----|------|---------|
| `replace` | Replace the node matched by xpath | `path`, `xpath`, `xml` |
| `insert` | Insert before/after the xpath node | `path`, `xpath`, `xml`, `position` (`before`/`after`) |
| `remove` | Delete the node matched by xpath | `path`, `xpath` |
| `write` | Write a new file into the ZIP (e.g. an image) | `path`, `source` (file path or URL) |
| `delete` | Delete a file inside the ZIP | `path` |

Example of replacing a paragraph:
```json
{
  "action": "edit",
  "filePath": "/work/report.docx",
  "edits": [{
    "op": "replace",
    "path": "word/document.xml",
    "xpath": "//w:p[w:r/w:t[contains(text(), 'exceeded expectations')]]",
    "xml": "<w:p xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:r><w:t>This quarter hit 118% of target.</w:t></w:r></w:p>"
  }]
}
```

Common OOXML nodes: `w:p` (paragraph), `w:r` (run), `w:t` (text), `w:tbl` (table), `w:tr` (row), `w:tc` (cell), `w:pPr/w:pStyle` (paragraph style). The namespace prefix is `w:`, with URI `http://schemas.openxmlformats.org/wordprocessingml/2006/main`.

---

## 3. DocConvert — Format Conversion

```json
{ "filePath": "/work/report.docx", "outputPath": "/work/report.pdf", "outputFormat": "pdf" }
```

Supported outputFormat values: `pdf`, `docx`, `html`, `md`, `txt`, `csv`, `xls`, `xlsx`, `json`

**pdf → docx is a lossy conversion**: complex layouts, tables, and image positions may be lost or displaced. Warn the user before converting.

---

## 4. Key Constraints

1. **Chinese PDFs can be created directly.** PdfMutate and DocConvert already support Chinese fonts — no need to go through a docx intermediary.
2. **Always `unzip -p` to inspect the XML before editing.** The Markdown returned by Read/DocPreview does not reveal the actual node names XPath needs; writing XPath blind = silently no-op.
3. **`xml` payloads must be well-formed.** The xml in replace/insert must include the correct namespace declarations — missing namespaces or unclosed tags = corrupted document.
4. **Use create for big changes, edit for small ones.** When the change affects more than 30% of the content, re-running create is more reliable than chaining edits.
5. **create overwrites files with the same name.** Prefer a new file name or confirm with the user first.
6. **Warn the user about lossy conversions.** Explain the risks before pdf → docx.
7. **Legacy `.doc` does not support writing.** Convert to `.docx` via `DocConvert` first before processing.
