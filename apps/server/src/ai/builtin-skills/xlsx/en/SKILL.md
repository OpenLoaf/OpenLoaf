---
name: xlsx-skill
description: >
  Unified read/write/stats/recalc/chart capability for Excel / CSV (.xlsx / .xlsm / .csv / .tsv). Triggers: reading cells, summarizing, grouping, finding highest/lowest, "what's the total Q1 revenue", editing cell values or formulas, inserting rows/columns, adding total rows, inserting charts (bar/line/pie), freezing panes, auto-filter, conditional formatting (data bars / color scales / formula), CSV ↔ XLSX conversion, building rosters / sales sheets / financial models, diagnosing #REF! / #DIV/0! formula errors, recalculating formulas. Typical phrasings: "who has the highest sales", "total Q1 revenue", "change B2 to 500", "add a total row", "create a roster", "convert csv to xlsx", "freeze the first row", "highlight negatives in column A red", "check for formula errors". Whenever the user mentions an .xlsx / .csv file or the final deliverable is a spreadsheet, load this skill.
---

# XLSX Skill

This skill provides 2 tools, organized as **read → write**:

| Tool | Responsibility | Read-only |
|------|------|------|
| `ExcelInspect` | **All reads** (5 actions): summary / read / tables / images / render | Yes |
| `ExcelMutate` | **All writes** (8 actions): create / update / structure / layout / format-rules / add-chart / add-image / recalc | No |

> **Loading (two steps, both required)**:
> 1. `LoadSkill xlsx-skill` — pulls this SKILL.md into context. Tool schemas are NOT yet active; calling them will fail with `InputValidationError`.
> 2. `ToolSearch(query: "select:ExcelInspect,ExcelMutate")` — activates the tool schemas.
>
> 🚨 **LoadSkill must be immediately followed by ToolSearch**: LoadSkill only brings in the doc, **no tool is activated by it**. LoadSkill → ToolSearch → call — all three steps are mandatory.
>
> `Read` / `DocPreview` on .xlsx only return a Markdown-level text view (losing formulas / styles / merges / validations / charts / conditional formatting). **Any "analyze / summarize / edit / create .xlsx" request must go through `ExcelInspect` / `ExcelMutate`. Do NOT fall back to `Read` for spreadsheets.**

---

## Intent → action lookup (critical section)

| User intent (typical phrasing) | First call | Notes |
|---|---|---|
| "Who has the highest sales / summarize this sheet" | `ExcelInspect(summary)` → `ExcelInspect(read)` | summary for the overview, then read the target sheet to judge |
| "What's the total Q1 revenue / what's the sum" | `ExcelInspect(read, scope:"range", range:"…")` | Read the needed columns; formula cells include `computed` |
| "Change B2 to 500" | `ExcelMutate(update)` | Single-cell write: `cells: { B2: { value: 500 } }` |
| "Add a total row" | `ExcelMutate(update)` | With formula: `cells: { B11: { formula: "=SUM(B2:B10)", style: "TOTAL" } }` |
| "Create a roster / sales sheet / financial model" | `ExcelMutate(create)` | Multi-sheet + formulas + charts + validations all in one call |
| "Convert csv to xlsx / add stuff to a csv" | `ExcelMutate(update or create)` | Auto-upgrades to xlsx when formulas / multi-sheet / charts appear (§7) |
| "Are there any formula errors / check #REF!" | `ExcelInspect(summary)` → if `errorCount > 0`, `ExcelMutate(recalc)` | summary samples up to 5; recalc returns full errors |
| "Add a bar / line / pie chart" | `ExcelMutate(add-chart)` | bar / line / pie single-axis only |
| "Freeze the first row / first two columns" | `ExcelMutate(layout, freeze)` | `freeze: { rows: 1 }` or `freeze: { cols: 2 }` |
| "Bold + light-grey background for the total row" | `ExcelMutate(update, style: "TOTAL")` | Or `style: { font:{bold:true}, fill:"EEEEEE" }` |
| "Insert a new sheet called Q2" | `ExcelMutate(structure, op:"insert", target:"sheet", to:"Q2")` | — |
| "Delete column D / delete Sheet2" | `ExcelMutate(structure, op:"delete", target:"col"\|"sheet")` | — |
| "Highlight negatives in column A red / data bar viz" | `ExcelMutate(format-rules)` | `rules:[{ type:"formula", range:"A2:A100", formula:"A2<0", style:{font:{color:"FF0000"}} }]` |
| "Add a dropdown to this column" | `ExcelMutate(update)` + `validation` | `cells:{ C2:{ validation:{ type:"list", values:["Yes","No"] } } }` |
| "Export to pdf" | `DocConvert` (not part of this skill, but the standard answer) | `DocConvert { filePath, outputFormat:"pdf" }` |

**Rule of thumb**: when you don't know what the file looks like, **always summary first**. summary returns the sheets list, hasFormulas, errorCount, isProtected, hasMergedCells, hasValidations, and `suggestedNextTool` — follow the hint.

---

## 1. Step 1: always `ExcelInspect(summary)` first

```json
{ "action": "summary", "filePath": "Q1_sales.xlsx" }
```

Returns:

- `sheetCount` + `sheets[{ name, rows, cols, hasFormulas, isProtected, hasMergedCells }]`
- Global flags: `hasFormulas / hasCharts / hasMergedCells / hasValidations / isProtected`
- **Error sampling**: `errorCount` (full count) + `errorSamples[]` (up to 5: {sheet, cell, error, formula})
- `suggestedNextTool`: the recommended next step

Common routing:

| summary signal | Next step |
|---|---|
| `isProtected: true` | Stop. Ask the user to unprotect or supply the password before writing — direct writes will throw `PROTECTED_WORKBOOK` |
| `errorCount > 0` | `ExcelMutate(recalc)` to get the full error list, then fix formulas cell by cell |
| `hasMergedCells: true` and you need to write | Run `ExcelInspect(read)` first to see merge ranges; writing a non-top-left cell of a merged region throws `MERGED_CELL_WRITE` |
| `hasCharts: true` | Read with `ExcelInspect(images)`; don't touch the chart anchor area when changing structure |
| `sheetCount > 1` | Process per-sheet — every read / update must carry `sheetName` |

---

## 2. Reads: summary / read / tables / images / render

### 2.1 `ExcelInspect(read)` — unified read

```json
{ "action": "read", "filePath": "…", "scope": "sheet", "sheetName": "Sales" }
```

- `scope`:
  - `"outline"`: only returns sheet counts (fast topology, no cell read)
  - `"sheet"`: reads the entire sheet (default `limit: 500` rows, surplus marked `truncated: true`; `all: true` unlocks full read)
  - `"range"`: must include `range: "A1:D100"`
- Optional: `where` / `groupBy` (lightweight aggregation hint; raw return for now)
- Each cell returns `{ value, formula?, computed?, error? }` — **`computed` on formula cells is cached; exceljs does not recalc on its own. Use `ExcelMutate(recalc)` for latest values.**

### 2.2 `ExcelInspect(tables)` — Excel Table + named range + data validation

Returns `{ tables, namedRanges, validations }`. Use it for "how many Table objects are there / does this sheet have dropdowns".

### 2.3 `ExcelInspect(images)` — image inventory

By default returns only metadata (sheet / index / extension). For addressable PNG URLs, pass `extractImages: true`; files land in the current session asset directory. Chart objects (bar/line/pie) are counted as images too.

### 2.4 `ExcelInspect(render)` — render a sheet to PNG

```json
{ "action": "render", "filePath": "…", "sheetName": "Sales", "range": "A1:E20" }
```

Requires libreoffice headless (missing soffice throws `LIBREOFFICE_UNAVAILABLE`). Pipeline: soffice → PDF → pdfium → sharp. `range` is currently a hint — the full sheet page is rendered. Use for visual verification of layout / chart output.

---

## 3. Create new — `ExcelMutate(create)`

One call delivers: **multi-sheet + formulas + charts + data validation + conditional formatting + comments**.

```json
{
  "action": "create",
  "filePath": "Q1_sales.xlsx",
  "sheets": [
    {
      "name": "Sales",
      "cells": {
        "A1": { "value": "Product", "style": "HEADER" },
        "B1": { "value": "Region", "style": "HEADER" },
        "C1": { "value": "Units", "style": "HEADER" },
        "D1": { "value": "Revenue", "style": "HEADER", "numberFormat": "$#,##0" },
        "A2": { "value": "iPhone 17" },
        "B2": { "value": "East", "validation": { "type": "list", "values": ["East","North","South","West"] } },
        "C2": { "value": 120 },
        "D2": { "formula": "=C2*799", "numberFormat": "$#,##0" },
        "A6": { "value": "Total", "style": "TOTAL" },
        "C6": { "formula": "=SUM(C2:C5)", "style": "TOTAL" },
        "D6": { "formula": "=SUM(D2:D5)", "style": "TOTAL", "numberFormat": "$#,##0" }
      },
      "freeze": { "rows": 1 },
      "columnWidths": { "A": 18, "B": 10, "C": 10, "D": 14 },
      "conditionalFormats": [
        { "type": "dataBar", "range": "C2:C5", "color": "4472C4" }
      ]
    },
    {
      "name": "Assumptions",
      "cells": {
        "A1": { "value": "Unit price", "style": "ASSUMPTION" },
        "B1": { "value": 799, "style": "INPUT" }
      }
    }
  ],
  "charts": [
    {
      "sheetName": "Sales",
      "type": "bar",
      "dataRange": "Sales!A1:C5",
      "anchor": "F2",
      "title": "Units by product"
    }
  ]
}
```

### 3.1 `cells` bag — A1 refs as keys

Each cell is a `CellSpec` (`value` / `formula` are mutually exclusive; the rest stack):

| Field | Description |
|---|---|
| `value` | Literal: string / number / boolean / null |
| `formula` | `"=SUM(B2:B9)"`, **mutually exclusive with value** (both throws `VALUE_FORMULA_CONFLICT`) |
| `style` | Preset `"HEADER"` / `"TOTAL"` / `"INPUT"` / `"ASSUMPTION"` or a full CellStyle object |
| `numberFormat` | Excel number-format string, e.g. `"$#,##0"` / `"0.0%"` |
| `comment` | Comment text |
| `validation` | Data validation, see §3.3 |

**StylePreset semantics**:
- `HEADER` — header row: dark-blue fill + white text + bold
- `TOTAL` — total row: light-grey fill + bold + top border
- `INPUT` — input cell: light-yellow fill + blue font (hint "editable")
- `ASSUMPTION` — assumption parameter: light-green fill + italic

### 3.2 Charts (`charts`) — bar / line / pie single-axis only

```json
{ "sheetName": "Sales", "type": "bar", "dataRange": "Sales!A1:C5", "anchor": "F2", "title": "…" }
```

- `type` is limited to `bar` / `line` / `pie`. Dual-axis / combo / scatter / area is **not supported** — tell the user "open in Excel and add it manually".
- `dataRange` supports cross-sheet syntax `"Sheet1!A1:D10"`.
- `anchor` is the top-left anchor cell (e.g. `"F2"`).

### 3.3 Data validation (`validation`)

```json
{ "type": "list", "values": ["Yes","No","Pending"] }
{ "type": "date", "min": "2024-01-01", "max": "2024-12-31" }
{ "type": "whole", "min": 0, "max": 100 }
{ "type": "decimal", "min": 0 }
{ "type": "custom", "formula": "=LEN(A1)<=20" }
```

### 3.4 Conditional formatting (`conditionalFormats` on sheet)

```json
{ "type": "dataBar", "range": "C2:C100", "color": "4472C4" }
{ "type": "colorScale", "range": "C2:C100", "min": "FF0000", "mid": "FFFF00", "max": "00B050" }
{ "type": "formula", "range": "A2:A100", "formula": "A2<0", "style": { "font": { "color": "FF0000" } } }
```

`iconSet` is not supported.

### 3.5 create landmines

- **Use a bare filename or relative path for `filePath`**: `"Q1_sales.xlsx"` or `"reports/q1.xlsx"`. Do not hand-build absolute paths like `/Users/.../OpenLoafData/…`. Runtime resolves to the session asset dir `<chat-history>/<sessionId>/asset/` (or project root).
- **Use `style: "HEADER"` for header rows** — one field covers it. Don't copy `{font:{bold:true,color:"FFFFFF"}, fill:"2E5A88"}` onto every header cell.
- **CJK doesn't need a special font**: the engine handles it automatically.
- **Pack charts + validation + conditionalFormats in one call**: create is atomic; splitting into create → update reopens the file multiple times for I/O.

---

## 4. Edit existing docs — update / structure / layout / format-rules / add-chart / add-image

### 4.1 `update` — unified cell writes (most common)

```json
{
  "action": "update",
  "filePath": "Q1_sales.xlsx",
  "sheetName": "Sales",
  "cells": {
    "B2": { "value": 500 },
    "D2": { "formula": "=B2*C2" },
    "A6": { "value": "Total", "style": "TOTAL" },
    "B6": { "formula": "=SUM(B2:B5)", "style": "TOTAL" }
  },
  "merges": ["A10:D10"],
  "unmerges": ["A12:D12"]
}
```

- **A single cell can set value/formula/style/numberFormat/comment/validation at once.**
- **value and formula are mutually exclusive**: supplying both throws `VALUE_FORMULA_CONFLICT`.
- **Writing into a merged region**: only the top-left cell is writable; non-top-left throws `MERGED_CELL_WRITE`. Either unmerge first, or target the top-left.
- **Protected workbook**: writes throw `PROTECTED_WORKBOOK`.

### 4.2 `structure` — insert / delete / rename (6-in-1)

```json
{ "action": "structure", "op": "insert", "target": "row",   "sheetName": "Sales", "at": 5, "count": 1 }
{ "action": "structure", "op": "delete", "target": "col",   "sheetName": "Sales", "at": 3, "count": 1 }
{ "action": "structure", "op": "rename", "target": "sheet", "from": "Sheet1", "to": "Q2" }
{ "action": "structure", "op": "insert", "target": "sheet", "to": "Q3" }
{ "action": "structure", "op": "delete", "target": "sheet", "sheetName": "Draft" }
```

- `target: row|col` requires `sheetName` + `at` (index).
- For `target: sheet`: `insert` needs `to` (new name); `delete` needs `sheetName`; `rename` needs `from` + `to`.
- Missing args throw `STRUCTURE_OP_INVALID`.

### 4.3 `layout` — freeze / filter / sort / column widths / print area

```json
{
  "action": "layout", "filePath": "…", "sheetName": "Sales",
  "freeze": { "rows": 1 },
  "autoFilter": { "range": "A1:D100" },
  "sort": [{ "column": "C", "order": "desc" }],
  "columnWidths": { "A": 18, "B": 10 },
  "rowHeights": { "1": 22 },
  "printArea": "A1:D50"
}
```

Every field is optional; only supplied fields are applied.

### 4.4 `format-rules` — conditional formatting in isolation

```json
{
  "action": "format-rules", "filePath": "…", "sheetName": "Sales",
  "rules": [
    { "type": "formula", "range": "A2:A100", "formula": "A2<0", "style": { "font": { "color": "FF0000" } } }
  ]
}
```

Supplied `rules` are **appended** to the existing ruleset; to clear rules use the LibreOffice GUI — no remove API yet.

### 4.5 `add-chart` — append a chart

```json
{ "action": "add-chart", "filePath": "…", "sheetName": "Sales",
  "type": "bar", "dataRange": "Sales!A1:C5", "anchor": "F2", "title": "…" }
```

Same contract as the `create` charts section. A **non-existent sheet in `dataRange`** throws `CHART_RANGE_INVALID`.

### 4.6 `add-image` — append an image

```json
{ "action": "add-image", "filePath": "…", "sheetName": "Sales",
  "source": "/tmp/logo.png", "anchor": "A1", "widthPx": 200, "heightPx": 60 }
```

`source` accepts a local path or an http(s) URL.

---

## 5. Formula recalc + health check — `ExcelMutate(recalc)`

```json
{ "action": "recalc", "filePath": "Q1_sales.xlsx", "mode": "auto" }
```

- `mode: "auto"` (default) → use libreoffice if soffice is present, else fall back to simple
- `mode: "simple"` → pure JS `@formulajs/formulajs`; **only understands shallow `=FN(range|args)` shapes**. Cross-sheet refs, nested funcs, or complex ASTs may miscompute. Good for quick health checks on single-sheet small files
- `mode: "libreoffice"` → headless soffice round-trip; supports every formula exceljs can persist

Returns:

```json
{ "ok": true, "mode": "libreoffice", "errorCount": 0, "errors": [], "warnings": [] }
// or
{ "ok": false, "code": "FORMULA_ERRORS_FOUND",
  "data": { "errorCount": 2, "errors": [
    { "sheet": "Sales", "cell": "D6", "type": "#DIV/0!", "formula": "=C6/B6" }
  ], "warnings": ["CROSS_FILE_REF_IGNORED: G5"] } }
```

**Cross-file refs** like `='[Book2.xlsx]Sheet1'!A1` are never recalculated; they surface as `CROSS_FILE_REF_IGNORED` warnings only.

---

## 6. Financial-model hard constraints (colors / number formats / assumptions)

When building "financial model / sales model / budget sheet" workbooks, enforce:

- **Blue font = hand-input** (use `style: "INPUT"` or `font.color: "0070C0"`)
- **Black font = in-sheet formulas** (default — no extra style needed)
- **Green font = cross-sheet references** (e.g. `='Assumptions'!B1`; `font.color: "00B050"`)
- **Red font = cross-file references** (avoid when possible; `font.color: "FF0000"`)
- **Yellow fill = pending / uncertain** (`fill: "FFFF00"`)
- **Currency columns share `numberFormat: "$#,##0"`**; percentages `"0.0%"`; dates `"yyyy-mm-dd"`
- **Put assumptions / inputs on a dedicated `Assumptions` / `Inputs` sheet**; reference them from formulas — never hardcode numbers in formulas

---

## 7. CSV auto-upgrade (`meta.upgradedFrom: "csv"`)

- `.csv` / `.tsv` are modeled as a single-sheet "Sheet1" workbook on both read and write.
- **Writes trigger upgrade**: if an update introduces any of formulas / multi-sheet / charts / conditional formats / data validation / merges, the tool **auto-emits `.xlsx`** (same base name, extension swapped) and flags `meta.upgradedFrom: "csv"`.
- Tell the user `data.filePath` has changed (from `report.csv` to `report.xlsx`); subsequent references must use the new path.
- Plain "change one value / add one row" on a csv keeps `.csv` output without upgrading.

---

## 8. Hard-constraint checklist (12 landmines)

1. **Always `ExcelInspect(summary)` before any action**: skipping summary loses sheets / errorCount / isProtected / hasMergedCells, leading to `SHEET_NOT_FOUND` / `MERGED_CELL_WRITE` / `PROTECTED_WORKBOOK`.
2. **value and formula are mutually exclusive**: each cell is either a literal or a formula. Both throws `VALUE_FORMULA_CONFLICT`.
3. **Merged cells: only the top-left is writable**: non-top-left writes throw `MERGED_CELL_WRITE`. Run `ExcelInspect(read)` to map merges, or include `unmerges: ["A10:D10"]` in `update`.
4. **Protected workbook ≠ writable**: when `isProtected: true` writes throw `PROTECTED_WORKBOOK`; inform the user first.
5. **Charts: bar / line / pie single-axis only**: dual-axis / combo / scatter / area → tell the user "open in Excel and add manually".
6. **`dataRange` pointing at a non-existent sheet** throws `CHART_RANGE_INVALID`: confirm via summary first.
7. **structure args must match op**: insert/delete need `at`; rename needs `from` + `to`; `target: "sheet"` ignores `sheetName`. Missing args throw `STRUCTURE_OP_INVALID`.
8. **recalc simple mode has a shape limit**: only understands `=FN(range|args)`. Cross-sheet / nested / complex AST → use `mode: "libreoffice"` (requires soffice), or tell the user "press F9 in Excel".
9. **CSV upgrade changes the path**: once formulas / multi-sheet / charts sneak in, `.csv` becomes `.xlsx`. **You MUST tell the user the new `filePath`** — otherwise they won't find the file next time.
10. **Use relative paths / bare filenames for `filePath`**: `"report.xlsx"` not `/Users/.../OpenLoafData/...`; runtime resolves to session asset dir (or project root). Out-of-scope paths throw "filePath is outside the writable scope".
11. **Large reads must paginate**: `ExcelInspect(read)` defaults to `limit: 500`; overflow sets `truncated: true`. Don't `all: true` on a 100k-row sheet — context will blow up. Use `summary` + a targeted `range`.
12. **Formula cell `computed` is cached**: exceljs doesn't recalc; after writing a new formula `computed` is `null`. Call `ExcelMutate(recalc)` to get fresh values.

---

## 9. Error-code cheat sheet

| Code | Trigger | Fix |
|---|---|---|
| `VALUE_FORMULA_CONFLICT` | CellSpec has both `value` and `formula` | Pick one |
| `SHEET_NOT_FOUND` | `sheetName` doesn't exist | Run `ExcelInspect(summary)` for the sheets list |
| `MERGED_CELL_WRITE` | Writing a non-top-left cell of a merged region | Unmerge first, or target the top-left |
| `PROTECTED_WORKBOOK` | Writing to a protected sheet / workbook | Ask user to unprotect or supply a password |
| `CHART_RANGE_INVALID` | `add-chart` / `create.charts` `dataRange` points at a missing sheet or empty range | Fill data with update before adding the chart |
| `STRUCTURE_OP_INVALID` | structure op / target combo illegal, or missing at / from / to | Match §4.2 schema |
| `IMAGE_READ_FAILED` | `add-image` source unreadable (404 / not an image / broken data URI) | Check source path or URL |
| `LIBREOFFICE_UNAVAILABLE` | `render` / `recalc(mode:libreoffice)` and no local soffice | Fall back to `mode:"simple"` or have the user install libreoffice |
| `FORMULA_ERRORS_FOUND` | `recalc` found `#REF!` / `#DIV/0!` / `#VALUE!` etc. | Walk `errors[]` and fix formulas via update |
| `CROSS_FILE_REF_IGNORED` | recalc hit `='[Book2]...'` (warning, non-blocking) | Tell the user cross-file refs aren't recalculated |
| `InputValidationError` | zod schema validation failed | Match the schema |

---

The schema source of truth for this skill is `packages/api/src/types/tools/excel.ts`. If you observe a conflict between this doc and the schema, **the schema wins** — please tell the user SKILL.md needs updating.
