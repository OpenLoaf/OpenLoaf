---
name: xlsx-skill
description: >
  Triggers whenever the user asks to do anything with a spreadsheet (.xlsx / .xls / .csv): reading cells, computing summaries, filtering, pivoting, identifying highest/lowest values, editing cells, adding/removing rows or columns, generating a new sheet from structured data, or converting between csv ↔ xlsx. Typical phrasings: "who has the highest sales in this Excel", "summarize this sheet", "what's the total Q1 revenue", "change B2 to 500", "add a row to this sheet", "create a new roster", "convert csv to xlsx". As long as the user mentions a spreadsheet file or wants the result materialized as Excel — even without saying "xlsx" — load this skill.
---

# Excel (XLSX) Skill

This skill involves 4 tools, organized as **read → write → convert**:

| Tool | Responsibility | Read-only |
|------|----------------|-----------|
| `Read` | Default entry point for reading XLSX. Returns Markdown tables + `<meta>` (sheet list, total rows/columns) | Yes |
| `DocPreview` | Two modes: `preview` (each sheet's header + first few rows + total row count) / `full` (expand all rows) | Yes |
| `ExcelMutate` | The only write tool. 2 actions: `create` / `edit` | No |
| `DocConvert` | Format conversion: xlsx ↔ csv / json / xls / html / txt, etc. | No |

> **Tools load on demand**: `DocPreview`, `ExcelMutate`, and `DocConvert` must be loaded via `ToolSearch(names: "<tool name>")` before being called. `Read` is always available.

---

## 1. Reading XLSX

### 1.1 Quick look with `Read`

Just call `Read(file_path)`. Returns a Markdown table + `<meta>` (sheet list, total rows/columns). Suitable for small sheets or quick browsing.

### 1.2 Fine-grained reading with `DocPreview`

| Parameter | Description |
|-----------|-------------|
| `mode: 'preview'` | Each sheet's header, first few rows, total row count (default) |
| `mode: 'full'` | Expand all rows (expensive on large files) |
| `sheetName` | Specify sheet name (available in both modes) |

For large files, prefer `preview` first to inspect structure and column names, then do a `full` read on the target sheet.

> **Read / DocPreview return Markdown, not OOXML**. To do XPath edits you must first run `Bash unzip -p file.xlsx xl/worksheets/sheet1.xml` to inspect the raw XML structure.

---

## 2. ExcelMutate — Writing XLSX

The `action` field distinguishes between 2 operations. `needsApproval: true` — an approval dialog pops up after the call.

### 2.1 create — Build from scratch

Pass a 2D array `data`, supporting string / number / boolean / null. CJK is fully supported.

```json
{
  "action": "create",
  "filePath": "/work/sales.xlsx",
  "sheetName": "Q1 Sales",
  "data": [
    ["Product", "Region", "Units Sold", "Revenue (USD)"],
    ["Smart Speaker", "East China", 1240, 372000],
    ["Robot Vacuum", "South China", 410, 1230000],
    ["Total", null, 1650, 1602000]
  ]
}
```

- `sheetName` is optional, defaults to "Sheet1"
- To create a multi-sheet workbook: first `create` the main sheet, then `edit` with a `write` op to append XML for additional sheets

### 2.2 edit — Modify an existing file

`.xlsx` is essentially a ZIP archive. Key internal paths:

| ZIP path | Content |
|----------|---------|
| `xl/worksheets/sheet1.xml` | Cells and rows/columns of the 1st sheet |
| `xl/sharedStrings.xml` | Shared string pool for all string cells |
| `xl/workbook.xml` | Sheet list, named ranges |

**You must inspect the raw XML before editing**:
```bash
unzip -p /work/report.xlsx xl/worksheets/sheet1.xml
unzip -p /work/report.xlsx xl/sharedStrings.xml
```

The `edits` array; each element:

| op | Purpose | Required fields |
|----|---------|-----------------|
| `replace` | Replace the node matched by xpath | `path`, `xpath`, `xml` |
| `insert` | Insert before/after the xpath node | `path`, `xpath`, `xml`, `position` (`before`/`after`) |
| `remove` | Delete the node matched by xpath | `path`, `xpath` |
| `write` | Write a new file into the ZIP | `path`, `source` (file path or URL) |
| `delete` | Delete a file inside the ZIP | `path` |

Example of modifying a cell:
```json
{
  "action": "edit",
  "filePath": "/work/report.xlsx",
  "edits": [{
    "op": "replace",
    "path": "xl/worksheets/sheet1.xml",
    "xpath": "//*[local-name()='c' and @r='B2']",
    "xml": "<c r=\"B2\"><v>500</v></c>"
  }]
}
```

### The sharedStrings trap (the most common failure mode)

Text in string cells is usually *not* in the sheet XML — it's stored as an index into `xl/sharedStrings.xml`:

- `<c r="B2" t="s"><v>3</v></c>` — `t="s"` means the value is the 4th string in sharedStrings (0-indexed), **not the literal text**
- Forgetting to check the `t` attribute and directly modifying `<v>` = pointing the cell at the wrong shared string entry

**The correct way to edit a string cell**: convert the entire cell to an inline string:
```xml
<c r="B2" t="inlineStr"><is><t>new text</t></is></c>
```

**Storage format for each cell type**:

| Type | XML | Description |
|------|-----|-------------|
| Number | `<c r="B2"><v>123</v></c>` | No `t` attribute, `<v>` is the literal value |
| Boolean | `<c r="B2" t="b"><v>1</v></c>` | `1`=true, `0`=false |
| Shared string | `<c r="B2" t="s"><v>3</v></c>` | `<v>` is the sharedStrings index |
| Inline string | `<c r="B2" t="inlineStr"><is><t>text</t></is></c>` | Recommended when editing strings |
| Formula | `<c r="B2"><f>SUM(A1:A5)</f><v>15</v></c>` | Editing only `<v>` will be overwritten when Excel reopens and recalculates |

---

## 3. DocConvert — Format Conversion

```json
{ "filePath": "/work/data.csv", "outputPath": "/work/data.xlsx", "outputFormat": "xlsx" }
```

Supported outputFormat: `pdf`, `docx`, `html`, `md`, `txt`, `csv`, `xls`, `xlsx`, `json`

**xlsx → csv is a lossy conversion**: only the first sheet is preserved; additional sheets, formulas, and formatting are all lost. You must inform the user before converting.

---

## 4. Key Constraints

1. **Always `unzip -p` and inspect the XML before editing**. The Markdown returned by Read/DocPreview hides the real node structure; writing XPath blindly = file corruption.
2. **Check the `t` attribute before editing strings**. `t="s"` is a shared-string index, not a literal value. Prefer converting to `t="inlineStr"` format.
3. **Cell references ≠ XPath**. `A1`, `B2` are spreadsheet coordinates; XPath must be written as `//*[local-name()='c' and @r='B2']`.
4. **Use create for large changes, edit for small ones**. When changes exceed 30% or touch ≥1000 rows, recreating the file via `create` is more reliable than issuing edits one by one.
5. **Batch all edits into a single call**. Reduces approval popups and intermediate state.
6. **create overwrites files with the same name**. Use a new filename or confirm with the user first.
7. **Warn the user before lossy conversions**. xlsx → csv only preserves the first sheet.
