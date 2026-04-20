---
name: xlsx-skill
description: >
  Unified read / write / stats / recalc / chart capability for Excel / CSV (.xlsx / .xlsm / .csv / .tsv). Trigger scenarios: reading cells, summarizing, grouping, highest/lowest values, total revenue, editing cell values or formulas, inserting rows/columns, adding total rows, inserting charts (bar/line/pie), freezing panes, auto-filter, conditional formatting, CSV ↔ XLSX conversion, building rosters / sales sheets / financial models, diagnosing #REF! / #DIV/0! formula errors, triggering recalculation. Typical phrasings: "who has the highest sales in this sheet", "total Q1 revenue", "change B2 to 500", "add a total row", "create a new roster", "convert csv to xlsx", "freeze the first row", "highlight negatives in column A red". Load this skill whenever the user mentions an .xlsx / .csv file or the final deliverable is a spreadsheet.
---

# XLSX Skill

Read with `ExcelInspect`; **all write / modify / create operations use `JsSandbox`** (preferred library: `exceljs`, which has broader support for styles / charts / images compared to `xlsx/SheetJS`); format conversion (including csv ↔ xlsx) can also use `DocConvert`.

## Tool List

| Tool | Responsibility | Read-only |
|------|----------------|-----------|
| `ExcelInspect` | Read: summary / values / formulas / style / range / chart-list / defined-names | Yes |
| `JsSandbox` | **All writes**: create / update / insert / formula / chart / image / structure / recalc… implemented with `exceljs` | No |
| `DocConvert` | csv ↔ xlsx ↔ html / md | No |

> **Loading (two steps)**:
> 1. `LoadSkill xlsx-skill`
> 2. `ToolSearch(query: "select:ExcelInspect,JsSandbox,DocConvert")`
>
> `Read` on a .xlsx returns only a lightweight summary; **all analysis / stats / edit / creation must go through `ExcelInspect` + `JsSandbox`**.

---

## 1. Read: Start with `ExcelInspect(summary)`

```
ExcelInspect { action: "summary", filePath: "…" }
```

Returns `sheets[{name, rows, cols, hasFormula, hasChart}]`. Then as needed:

- Read data → `ExcelInspect(action="values", sheetName, range)`
- Read formulas → `action="formulas"`
- Read styles → `action="style", range`
- Check errors → `action="errors"` — lists #REF! / #DIV/0! / #NAME? etc.

For large sheets, pass `range` (e.g. `"A1:D100"`) to avoid full-sheet preview truncation.

---

## 2. Write: `JsSandbox` + `exceljs`

`exceljs` supports styles / merges / formulas / charts / images / data validation. Handles tens of thousands of rows without issue.

### 2.1 Demo: Create a sales data sheet (formula total row + frozen header + number format)

```js
import ExcelJS from 'exceljs'
const wb = new ExcelJS.Workbook()
const ws = wb.addWorksheet('Q1 Sales')

// Headers
ws.columns = [
  { header: 'Product',  key: 'name',  width: 20 },
  { header: 'Region',   key: 'area',  width: 10 },
  { header: 'Units',    key: 'qty',   width: 10 },
  { header: 'Price ($)', key: 'price', width: 14, style: { numFmt: '$#,##0.00' } },
  { header: 'Revenue ($)', key: 'total', width: 14, style: { numFmt: '$#,##0.00' } },
]
const rows = [
  { name: 'Smart Speaker', area: 'East',  qty: 1240, price: 300 },
  { name: 'Robot Vacuum',  area: 'South', qty: 410,  price: 3000 },
  { name: 'Wireless Earbuds', area: 'North', qty: 860, price: 150 },
]
rows.forEach((r, i) => {
  const excelRow = ws.addRow({ ...r, total: null })
  const rowNum = excelRow.number
  ws.getCell(`E${rowNum}`).value = { formula: `C${rowNum}*D${rowNum}` }
})

// Total row
const totalRow = ws.addRow({
  name: 'Total', area: '',
  qty: { formula: `SUM(C2:C${rows.length + 1})` },
  price: null,
  total: { formula: `SUM(E2:E${rows.length + 1})` },
})
totalRow.font = { bold: true }

// Freeze header + bold header + auto-filter
ws.views = [{ state: 'frozen', ySplit: 1 }]
ws.getRow(1).font = { bold: true }
ws.autoFilter = { from: 'A1', to: `E${rows.length + 1}` }

await wb.xlsx.writeFile('sales_q1.xlsx')
console.log('sales_q1.xlsx written')
```

### 2.2 Demo: Add a YoY growth column + conditional formatting (red for negatives)

```js
import ExcelJS from 'exceljs'
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile('sales_q1.xlsx')
const ws = wb.getWorksheet('Q1 Sales')

const last = ws.rowCount
ws.getCell(`F1`).value = 'YoY Growth'
for (let r = 2; r < last; r++) {
  ws.getCell(`F${r}`).value = { formula: `(E${r}-E${r}*0.8)/(E${r}*0.8)` }
  ws.getCell(`F${r}`).numFmt = '0.0%'
}

// Conditional format: F column < 0 → red font
ws.addConditionalFormatting({
  ref: `F2:F${last - 1}`,
  rules: [{
    type: 'cellIs',
    operator: 'lessThan',
    formulae: ['0'],
    style: { font: { color: { argb: 'FFFF0000' } } },
    priority: 1,
  }],
})

await wb.xlsx.writeFile('sales_q1.xlsx')
console.log('YoY + conditional format added')
```

### 2.3 Demo: Embed a bar chart image

```js
import ExcelJS from 'exceljs'
import fs from 'node:fs/promises'

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile('sales_q1.xlsx')
const ws = wb.getWorksheet('Q1 Sales')

// exceljs doesn't support addChart natively — use office-chart extension, or
// render a PNG via chartjs-node-canvas and embed it with addImage.
// Example using addImage:

// Assume bar.png was generated by chartjs-node-canvas
const imgId = wb.addImage({ buffer: await fs.readFile('bar.png'), extension: 'png' })
ws.addImage(imgId, { tl: { col: 6, row: 1 }, ext: { width: 480, height: 280 } })
await wb.xlsx.writeFile('sales_q1.xlsx')
console.log('chart image embedded')
```

> For native OOXML charts, use `officegen` or hand-stitch chart XML — high complexity. For most use cases, "render chart as PNG → addImage" is sufficient.

### 2.4 Demo: CSV → XLSX with formatting

```js
import fs from 'node:fs/promises'
import ExcelJS from 'exceljs'

const csv = await fs.readFile(process.argv[2] ?? 'in.csv', 'utf-8')
const [headerLine, ...dataLines] = csv.trim().split(/\r?\n/)
const headers = headerLine.split(',')

const wb = new ExcelJS.Workbook()
const ws = wb.addWorksheet('Sheet1')
ws.addRow(headers).font = { bold: true }
for (const line of dataLines) {
  ws.addRow(line.split(',').map(v => (isNaN(+v) || v === '' ? v : Number(v))))
}
ws.columns.forEach(c => { c.width = 18 })
ws.views = [{ state: 'frozen', ySplit: 1 }]

await wb.xlsx.writeFile('out.xlsx')
console.log('csv → xlsx done')
```

Simple csv/xlsx conversion can also use `DocConvert(from="csv", to="xlsx")` without writing code.

### 2.5 Demo: Diagnose formula errors

```js
import ExcelJS from 'exceljs'
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile('in.xlsx')
const errs = []
for (const ws of wb.worksheets) {
  ws.eachRow((row, rn) => {
    row.eachCell((cell, cn) => {
      // exceljs reads error cells as { error: '#REF!' }
      if (cell.value && typeof cell.value === 'object' && cell.value.error) {
        errs.push({ sheet: ws.name, cell: cell.address, error: cell.value.error, formula: cell.formula })
      }
    })
  })
}
console.log(JSON.stringify(errs, null, 2))
```

---

## 3. Format Conversion

```
DocConvert(from="csv",  to="xlsx", sourcePath="…")
DocConvert(from="xlsx", to="csv",  sourcePath="…")
DocConvert(from="xlsx", to="html", sourcePath="…")
```

---

## 4. Common Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Formula saved as a string | Using `cell.value = '=A1+B1'` | Use `{ formula: 'A1+B1' }` instead |
| CJK column width too narrow | Default width calculated in ASCII characters | Manually set `column.width = 20` |
| Numbers display in scientific notation after open | More than 11 digits | `cell.numFmt = '0'` or `'@'` (text) |
| File reports "damaged" on open | Formula syntax error / circular reference | Run `ExcelInspect(errors)` first; or write static values before substituting formulas |

To patch a script: `JsSandbox(action="edit-and-run", scriptPath=…, edits=[…])` — only pass the diff.
