---
name: xlsx-skill
description: >
  Excel / CSV（.xlsx / .xlsm / .csv / .tsv）读/写/统计/重算/图表一体化。触发场景：阅读单元格、汇总分组、谁最高谁最低、总收入、改单元格或公式、加行列、加合计行、插入图表（bar/line/pie）、冻结首行、加筛选、条件格式、CSV ↔ XLSX 互转、新建花名册/销售表/财务模型、排查 #REF!/#DIV/0! 公式错误、触发重算。典型说法："这表里谁销量最高"、"Q1 总收入"、"把 B2 改成 500"、"加一行合计"、"新建花名册"、"csv 转 xlsx"、"冻结首行"、"A 列负数标红"。用户提到 .xlsx / .csv 文件或最终产出是表格都加载本技能。
---

# XLSX 技能

读用 `ExcelInspect`；**写 / 改 / 创建用 `JsSandbox`**（库首选 `exceljs`，比 `xlsx/SheetJS` 多支持样式 / 图表 / 图像）；格式互转（csv ↔ xlsx 也可 `DocConvert`）。

## 工具清单

| 工具 | 做什么 | 只读 |
|------|------|------|
| `ExcelInspect` | 读：summary / values / formulas / style / range / chart-list / defined-names | 是 |
| `JsSandbox` | **所有写**：create / update / insert / formula / chart / image / structure / recalc …… 用 `exceljs` 代码实现 | 否 |
| `DocConvert` | csv ↔ xlsx ↔ html / md | 否 |

> **加载（两步）**：
> 1. `LoadSkill xlsx-skill`
> 2. `ToolSearch(query: "select:ExcelInspect,JsSandbox,DocConvert")`
>
> `Read` 对 .xlsx 只会出轻量摘要；**分析 / 统计 / 改 / 建表一律走 `ExcelInspect` + `JsSandbox`**。

---

## 1. 读：`ExcelInspect(summary)` 先行

```
ExcelInspect { action: "summary", filePath: "…" }
```

返回 `sheets[{name, rows, cols, hasFormula, hasChart}]`，再按需：

- 读数据 → `ExcelInspect(action="values", sheetName, range)`
- 读公式 → `action="formulas"`
- 读样式 → `action="style", range`
- 查错 → `action="errors"` 列 #REF! / #DIV/0! / #NAME? 等

大表传 `range`（如 `"A1:D100"`），避免全表 preview 截断。

---

## 2. 写：`JsSandbox` + `exceljs`

`exceljs` 支持样式 / 合并 / 公式 / 图表 / 图片 / 数据验证。处理规模到几万行没问题。

### 2.1 Demo：创建中文销售数据表（含公式合计行 + 冻结首行 + 数字格式）

```js
import ExcelJS from 'exceljs'
const wb = new ExcelJS.Workbook()
const ws = wb.addWorksheet('Q1 销售')

// 表头
ws.columns = [
  { header: '产品名称', key: 'name',  width: 20 },
  { header: '区域',     key: 'area',  width: 10 },
  { header: '销量',     key: 'qty',   width: 10 },
  { header: '单价（元）', key: 'price', width: 14, style: { numFmt: '¥#,##0.00' } },
  { header: '收入（元）', key: 'total', width: 14, style: { numFmt: '¥#,##0.00' } },
]
const rows = [
  { name: '智能音箱',  area: '华东', qty: 1240, price: 300 },
  { name: '扫地机器人', area: '华南', qty: 410,  price: 3000 },
  { name: '无线耳机',   area: '华北', qty: 860,  price: 150 },
]
rows.forEach((r, i) => {
  const excelRow = ws.addRow({ ...r, total: null })
  // F 列公式：total = qty * price
  const rowNum = excelRow.number
  ws.getCell(`E${rowNum}`).value = { formula: `C${rowNum}*D${rowNum}` }
})

// 合计行
const totalRow = ws.addRow({
  name: '合计', area: '',
  qty: { formula: `SUM(C2:C${rows.length + 1})` },
  price: null,
  total: { formula: `SUM(E2:E${rows.length + 1})` },
})
totalRow.font = { bold: true }

// 冻结首行 + 表头加粗 + 筛选
ws.views = [{ state: 'frozen', ySplit: 1 }]
ws.getRow(1).font = { bold: true }
ws.autoFilter = { from: 'A1', to: `E${rows.length + 1}` }

await wb.xlsx.writeFile('sales_q1.xlsx')
console.log('sales_q1.xlsx written')
```

### 2.2 Demo：加一列 YoY 增长率 + 条件格式（负值标红）

```js
import ExcelJS from 'exceljs'
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile('sales_q1.xlsx')
const ws = wb.getWorksheet('Q1 销售')

const last = ws.rowCount
ws.getCell(`F1`).value = 'YoY 增长率'
for (let r = 2; r < last; r++) {
  ws.getCell(`F${r}`).value = { formula: `(E${r}-E${r}*0.8)/(E${r}*0.8)` }
  ws.getCell(`F${r}`).numFmt = '0.0%'
}

// 条件格式：F 列 < 0 标红（exceljs 条件格式语法）
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

### 2.3 Demo：嵌一张柱状图

```js
import ExcelJS from 'exceljs'
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile('sales_q1.xlsx')
const ws = wb.getWorksheet('Q1 销售')

// exceljs 原生不支持 addChart —— 通常用扩展包 office-chart；
// 若需求只是"让人看个图"，更实用的办法：用 sharp/chartjs-node 画 PNG 再 addImage。
// 下面演示 addImage 方案：
import fs from 'node:fs/promises'

// 假设你已经用 chartjs-node-canvas 生成了 bar.png
const imgId = wb.addImage({ buffer: await fs.readFile('bar.png'), extension: 'png' })
ws.addImage(imgId, { tl: { col: 6, row: 1 }, ext: { width: 480, height: 280 } })
await wb.xlsx.writeFile('sales_q1.xlsx')
console.log('chart image embedded')
```

> 要原生 OOXML chart 可引入 `officegen` 或手贴 chart XML，但复杂度高。优先用"图表渲染成 PNG → addImage"，对大多数用户场景足够。

### 2.4 Demo：CSV → XLSX 并格式化

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

简单 csv/xlsx 互转也能走 `DocConvert(from="csv", to="xlsx")`，不用写代码。

### 2.5 Demo：排查公式错误

```js
import ExcelJS from 'exceljs'
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile('in.xlsx')
const errs = []
for (const ws of wb.worksheets) {
  ws.eachRow((row, rn) => {
    row.eachCell((cell, cn) => {
      // exceljs 读出 cell.value 若为 { error: '#REF!' } 形式
      if (cell.value && typeof cell.value === 'object' && cell.value.error) {
        errs.push({ sheet: ws.name, cell: cell.address, error: cell.value.error, formula: cell.formula })
      }
    })
  })
}
console.log(JSON.stringify(errs, null, 2))
```

---

## 3. 格式互转

```
DocConvert(from="csv",  to="xlsx", sourcePath="…")
DocConvert(from="xlsx", to="csv",  sourcePath="…")
DocConvert(from="xlsx", to="html", sourcePath="…")
```

---

## 4. 常见陷阱

| 症状 | 原因 | 处理 |
|---|---|---|
| 公式保存后变字符串 | 误用 `cell.value = '=A1+B1'` | 用 `{ formula: 'A1+B1' }` |
| 中文字符宽度不对 | 默认 width 以英文字符算 | 手动设 `column.width = 20` |
| xlsx 打开后数字变科学计数 | 超过 11 位 | `cell.numFmt = '0'` 或 `'@'`（文本） |
| 打开提示"文件损坏" | 公式语法错 / 循环引用 | 先 `ExcelInspect(errors)` 查；或先写静态值再替公式 |

修脚本：`JsSandbox(action="edit-and-run", scriptPath=…, edits=[…])` 只传改动点。
