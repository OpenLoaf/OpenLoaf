---
name: xlsx-skill
description: >
  Excel / CSV（.xlsx / .xlsm / .csv / .tsv）读/写/统计/重算/图表一体化。触发场景：阅读单元格、汇总分组、判断谁最高谁最低、总收入是多少、改单元格值或公式、加行列、加合计行、插入图表（bar/line/pie）、冻结首行、加筛选、条件格式（数据条 / 色阶 / 公式）、CSV ↔ XLSX 互转、新建花名册 / 销售表 / 财务模型、排查 #REF! / #DIV/0! 等公式错误、触发公式重算。典型说法："这表里谁销量最高"、"Q1 总收入"、"把 B2 改成 500"、"加一行合计"、"新建花名册"、"csv 转 xlsx"、"冻结首行"、"给 A 列的负数标红"、"有没有公式错误"。用户提到 .xlsx / .csv 文件，或最终产出是表格，都加载本技能。
tools: [ExcelInspect, ExcelMutate]
---

# XLSX 技能

本技能提供 2 个工具，按 **看 → 写** 组织：

| 工具 | 职责 | 只读 |
|------|------|------|
| `ExcelInspect` | **所有读操作**（5 action）：summary / read / tables / images / render | 是 |
| `ExcelMutate` | **所有写操作**（8 action）：create / update / structure / layout / format-rules / add-chart / add-image / recalc | 否 |

> **加载（两步，缺一不可）**：
> 1. `LoadSkill xlsx-skill` —— 把本 SKILL.md 拉进上下文。此时工具 schema 还没激活，直接调用会 `InputValidationError`。
> 2. `ToolSearch(query: "select:ExcelInspect,ExcelMutate")` —— 激活工具 schema。
>
> 🚨 **LoadSkill 后必须立刻 ToolSearch**：LoadSkill 只把文档拉进来，**没激活任何工具**。先 LoadSkill → ToolSearch → 再调用，三步缺一都算没干完。
>
> **按意图选工具**：
> - **简单读 / 预览 / 格式转换**（例如"看下这个表"、"xlsx 转 csv"、"把表总结一下"）：优先 `DocPreview` 或 `Read`；xlsx → csv / txt / md / pdf / docx 的转换用 `DocConvert`。这些路径最快，且满足纯读 / 纯转格式的需求。
> - **结构化分析 / 单元格级编辑 / 创建**（涉及公式、样式、合并、数据验证、图表、条件格式、多 sheet）：走 `ExcelInspect` / `ExcelMutate`。`Read` 会丢公式和样式。
>
> 🚫 **禁止用 `Bash` + `openpyxl` / `pandas` / `xlrd` / Python / Node 脚本读写电子表格**。上面注册的工具已经覆盖全部支持的场景。绕到 Bash 会跳过审批闸门、预览 UI，以及 session 资源目录解析。

---

## 意图 → action 速查表（关键章节）

| 用户意图（典型说法） | 第一步调哪个 | 备注 |
|---|---|---|
| "这表里谁销量最高 / 总结一下这张表" | `ExcelInspect(summary)` → `ExcelInspect(read)` | summary 拿全貌，再 read 目标 sheet 做判定 |
| "Q1 总收入是多少 / 合计是多少" | `ExcelInspect(read, scope:"range", range:"…")` | 直接 read 需要的列；公式 cell 会带 `computed` 结果 |
| "把 B2 改成 500" | `ExcelMutate(update)` | 单 cell 写入：`cells: { B2: { value: 500 } }` |
| "加一行合计" | `ExcelMutate(update)` | 带 formula：`cells: { B11: { formula: "=SUM(B2:B10)", style: "TOTAL" } }` |
| "新建花名册 / 新建销售表 / 新建财务模型" | `ExcelMutate(create)` | 一次塞齐多 sheet + 公式 + 图表 + 验证 |
| "csv 转 xlsx / 加东西到 csv" | `ExcelMutate(update 或 create)` | 引入公式 / 多 sheet / 图表时自动升级为 xlsx（见 §7） |
| "有没有公式错误 / 帮我查 #REF!" | `ExcelInspect(summary)` → 若 `errorCount > 0` 再 `ExcelMutate(recalc)` | summary 已采样 5 条；recalc 返回全量 errors |
| "给这表加个柱状图 / 折线图 / 饼图" | `ExcelMutate(add-chart)` | 仅 bar / line / pie 单轴 |
| "冻结首行 / 冻结前两列" | `ExcelMutate(layout, freeze)` | `freeze: { rows: 1 }` 或 `freeze: { cols: 2 }` |
| "合计行加粗 + 浅灰底 / 改表头样式" | `ExcelMutate(update, style: "TOTAL")` | 或 `style: { font:{bold:true}, fill:"EEEEEE" }` |
| "插入一个新 sheet 叫 Q2" | `ExcelMutate(structure, op:"insert", target:"sheet", to:"Q2")` | — |
| "删除 D 列 / 删 Sheet2" | `ExcelMutate(structure, op:"delete", target:"col"\|"sheet")` | — |
| "给 A 列的负数标红 / 数据条可视化" | `ExcelMutate(format-rules)` | `rules:[{ type:"formula", range:"A2:A100", formula:"A2<0", style:{font:{color:"FF0000"}} }]` |
| "给列加下拉选项" | `ExcelMutate(update)` + `validation` | `cells:{ C2:{ validation:{ type:"list", values:["是","否"] } } }` |
| "导出为 pdf" | `DocConvert`（不属于本技能，但这是标准回答） | `DocConvert { filePath, outputFormat:"pdf" }` |

**通用原则**：不知道文件长啥样时，**永远先 summary**。summary 会告诉你 sheets 列表、hasFormulas、errorCount、isProtected、hasMergedCells、hasValidations、suggestedNextTool —— 下一步跟着 hint 走。

---

## 1. 第一步：永远先 `ExcelInspect(summary)`

```json
{ "action": "summary", "filePath": "Q1_sales.xlsx" }
```

返回包含：

- `sheetCount` + `sheets[{ name, rows, cols, hasFormulas, isProtected, hasMergedCells }]`
- 全局标志：`hasFormulas / hasCharts / hasMergedCells / hasValidations / isProtected`
- **错误采样**：`errorCount`（全量）+ `errorSamples[]`（最多 5 条：{sheet, cell, error, formula}）
- `suggestedNextTool`：下一步建议

常见分派：

| summary 特征 | 下一步 |
|---|---|
| `isProtected: true` | 停下。写入前告诉用户解保护或提供密码，直写会抛 `PROTECTED_WORKBOOK` |
| `errorCount > 0` | `ExcelMutate(recalc)` 拿到全量 errors 列表，按 cell 逐一修公式 |
| `hasMergedCells: true` 且要写入 | 写入前先 `ExcelInspect(read)` 看合并范围；直接写合并单元格的**非左上格**会抛 `MERGED_CELL_WRITE` |
| `hasCharts: true` | 读用 `ExcelInspect(images)`；改结构不要动图表锚点区 |
| `sheetCount > 1` | 分 sheet 处理，每次 read / update 都显式带 `sheetName` |

---

## 2. 读：summary / read / tables / images / render

### 2.1 `ExcelInspect(read)` — 统一读

```json
{ "action": "read", "filePath": "…", "scope": "sheet", "sheetName": "Sales" }
```

- `scope`：
  - `"outline"`：只返回 sheet 计数（快速拓扑，不读 cell）
  - `"sheet"`：读整 sheet（默认 `limit: 500` 行，多余 `truncated: true`；`all: true` 解锁全量）
  - `"range"`：必须带 `range: "A1:D100"`
- 可选：`where` / `groupBy`（轻量聚合 hint，目前以 raw 返回为主）
- 每个 cell 返回 `{ value, formula?, computed?, error? }` —— **公式 cell 的 `computed` 是缓存结果，exceljs 不自己重算；要最新值用 `ExcelMutate(recalc)`**。

### 2.2 `ExcelInspect(tables)` — Excel 结构化 Table + 命名区域 + 数据验证

返回 `{ tables, namedRanges, validations }`。用来做"这张表有几个 Table 对象 / 有没有下拉列表"。

### 2.3 `ExcelInspect(images)` — 图片清单

默认只返回元数据（sheet / index / extension）。要拿到可引用 PNG URL，加 `extractImages: true`，文件写到当前 session asset 目录。图表本身（bar/line/pie）也计入 images。

### 2.4 `ExcelInspect(render)` — 渲染 sheet 为 PNG

```json
{ "action": "render", "filePath": "…", "sheetName": "Sales", "range": "A1:E20" }
```

依赖 libreoffice headless（无 soffice 抛 `LIBREOFFICE_UNAVAILABLE`）。链路：soffice → PDF → pdfium → sharp。`range` 目前是 hint，会渲染整 sheet 页面。用于视觉校验表格排版 / 图表效果。

---

## 3. 新建 — `ExcelMutate(create)`

一次塞齐：**多 sheet + 公式 + 图表 + 数据验证 + 条件格式 + 批注**。

```json
{
  "action": "create",
  "filePath": "Q1_sales.xlsx",
  "sheets": [
    {
      "name": "Sales",
      "cells": {
        "A1": { "value": "产品", "style": "HEADER" },
        "B1": { "value": "区域", "style": "HEADER" },
        "C1": { "value": "销量", "style": "HEADER" },
        "D1": { "value": "收入", "style": "HEADER", "numberFormat": "¥#,##0" },
        "A2": { "value": "iPhone 17" },
        "B2": { "value": "华东", "validation": { "type": "list", "values": ["华东","华北","华南","西南"] } },
        "C2": { "value": 120 },
        "D2": { "formula": "=C2*7999", "numberFormat": "¥#,##0" },
        "A6": { "value": "合计", "style": "TOTAL" },
        "C6": { "formula": "=SUM(C2:C5)", "style": "TOTAL" },
        "D6": { "formula": "=SUM(D2:D5)", "style": "TOTAL", "numberFormat": "¥#,##0" }
      },
      "freeze": { "rows": 1 },
      "columnWidths": { "A": 18, "B": 10, "C": 10, "D": 14 },
      "conditionalFormats": [
        { "type": "dataBar", "range": "C2:C5", "color": "4472C4" }
      ]
    },
    {
      "name": "假设",
      "cells": {
        "A1": { "value": "客单价", "style": "ASSUMPTION" },
        "B1": { "value": 7999, "style": "INPUT" }
      }
    }
  ],
  "charts": [
    {
      "sheetName": "Sales",
      "type": "bar",
      "dataRange": "Sales!A1:C5",
      "anchor": "F2",
      "title": "各产品销量"
    }
  ]
}
```

### 3.1 `cells` bag — 用 A1 ref 作 key

每个 cell 是 `CellSpec`（`value` / `formula` 互斥，其余可叠加）：

| 字段 | 说明 |
|---|---|
| `value` | 字面量：string / number / boolean / null |
| `formula` | `"=SUM(B2:B9)"`，**与 value 互斥**（同传抛 `VALUE_FORMULA_CONFLICT`） |
| `style` | `"HEADER"` / `"TOTAL"` / `"INPUT"` / `"ASSUMPTION"` 预设 或完整 CellStyle 对象 |
| `numberFormat` | Excel 数字格式字符串，如 `"¥#,##0"` / `"0.0%"` |
| `comment` | 批注文本 |
| `validation` | 数据验证，见 §3.3 |

**StylePreset 用途**：
- `HEADER` — 表头：深蓝底 + 白字 + 加粗
- `TOTAL` — 合计行：浅灰底 + 加粗 + 上边框
- `INPUT` — 输入项：浅黄底 + 蓝字（提示用户可以改）
- `ASSUMPTION` — 假设参数：浅绿底 + 斜体

### 3.2 图表（`charts`）— 仅 bar / line / pie 单轴

```json
{ "sheetName": "Sales", "type": "bar", "dataRange": "Sales!A1:C5", "anchor": "F2", "title": "…" }
```

- `type` 只能是 `bar` / `line` / `pie`。双轴 / 组合图 / 散点 / 面积图不支持——告诉用户"用 Excel 打开后手动加"。
- `dataRange` 支持跨 sheet 语法 `"Sheet1!A1:D10"`。
- `anchor` 是图表左上锚点 cell（例如 `"F2"`）。

### 3.3 数据验证（`validation`）

```json
{ "type": "list", "values": ["是","否","待定"] }           // 下拉
{ "type": "date", "min": "2024-01-01", "max": "2024-12-31" }  // 日期范围
{ "type": "whole", "min": 0, "max": 100 }                      // 整数
{ "type": "decimal", "min": 0 }                                // 小数
{ "type": "custom", "formula": "=LEN(A1)<=20" }                // 自定义公式
```

### 3.4 条件格式（`conditionalFormats` on sheet）

```json
{ "type": "dataBar", "range": "C2:C100", "color": "4472C4" }          // 数据条
{ "type": "colorScale", "range": "C2:C100", "min": "FF0000", "mid": "FFFF00", "max": "00B050" }   // 色阶
{ "type": "formula", "range": "A2:A100", "formula": "A2<0", "style": { "font": { "color": "FF0000" } } }  // 公式条件
```

不支持 `iconSet`。

### 3.5 create 的硬雷区

- **`filePath` 用裸文件名或相对路径**：`"Q1_sales.xlsx"` 或 `"reports/q1.xlsx"`，不要拼 `/Users/.../OpenLoafData/…` 这种绝对路径。运行时会解析到会话 asset 目录 `<chat-history>/<sessionId>/asset/`（或项目根）。
- **表头用 `style: "HEADER"` 预设**，一行搞定；不要手写 `{font:{bold:true,color:"FFFFFF"}, fill:"2E5A88"}` 每个表头 cell 都抄一遍。
- **CJK 不需要特殊字体**：引擎自动处理。
- **一次性塞齐 charts + validation + conditionalFormats**：create 是原子操作，分步 create → update 会重开文件多次 I/O。

---

## 4. 编辑现有文档 — update / structure / layout / format-rules / add-chart / add-image

### 4.1 `update` — 统一写单元格（最常用）

```json
{
  "action": "update",
  "filePath": "Q1_sales.xlsx",
  "sheetName": "Sales",
  "cells": {
    "B2": { "value": 500 },
    "D2": { "formula": "=B2*C2" },
    "A6": { "value": "合计", "style": "TOTAL" },
    "B6": { "formula": "=SUM(B2:B5)", "style": "TOTAL" }
  },
  "merges": ["A10:D10"],
  "unmerges": ["A12:D12"]
}
```

- **一个 cell 可以同时改 value/formula/style/numberFormat/comment/validation**。
- **value 和 formula 互斥**：同传抛 `VALUE_FORMULA_CONFLICT`，必须二选一。
- **写入合并单元格**：只能往左上格写；往非左上格写抛 `MERGED_CELL_WRITE`。先 unmerge 或改写左上格。
- **受保护工作簿**：写入抛 `PROTECTED_WORKBOOK`。

### 4.2 `structure` — insert / delete / rename（6 合 1）

```json
{ "action": "structure", "op": "insert", "target": "row",   "sheetName": "Sales", "at": 5, "count": 1 }
{ "action": "structure", "op": "delete", "target": "col",   "sheetName": "Sales", "at": 3, "count": 1 }
{ "action": "structure", "op": "rename", "target": "sheet", "from": "Sheet1", "to": "Q2" }
{ "action": "structure", "op": "insert", "target": "sheet", "to": "Q3" }
{ "action": "structure", "op": "delete", "target": "sheet", "sheetName": "Draft" }
```

- `target: row|col` 必带 `sheetName` + `at`（位置索引）。
- `target: sheet` 下：`insert` 需要 `to`（新 sheet 名），`delete` 需要 `sheetName`，`rename` 需要 `from` + `to`。
- 操作缺参抛 `STRUCTURE_OP_INVALID`。

### 4.3 `layout` — 冻结 / 筛选 / 排序 / 列宽 / 打印区

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

所有字段都是可选的，传什么改什么。

### 4.4 `format-rules` — 单独改条件格式

```json
{
  "action": "format-rules", "filePath": "…", "sheetName": "Sales",
  "rules": [
    { "type": "formula", "range": "A2:A100", "formula": "A2<0", "style": { "font": { "color": "FF0000" } } }
  ]
}
```

传入的 `rules` 会**追加**到现有规则；要清空请先用 libreoffice GUI，目前 API 不支持 remove。

### 4.5 `add-chart` — 追加图表

```json
{ "action": "add-chart", "filePath": "…", "sheetName": "Sales",
  "type": "bar", "dataRange": "Sales!A1:C5", "anchor": "F2", "title": "…" }
```

同 `create` 的 charts 章节。**`dataRange` 引用的 sheet 不存在**抛 `CHART_RANGE_INVALID`。

### 4.6 `add-image` — 追加图片

```json
{ "action": "add-image", "filePath": "…", "sheetName": "Sales",
  "source": "/tmp/logo.png", "anchor": "A1", "widthPx": 200, "heightPx": 60 }
```

`source` 支持本地路径或 http(s) URL。

---

## 5. 公式重算 + 体检 — `ExcelMutate(recalc)`

```json
{ "action": "recalc", "filePath": "Q1_sales.xlsx", "mode": "auto" }
```

- `mode: "auto"`（默认）→ 有 soffice 走 libreoffice，无则降级 simple
- `mode: "simple"` → 纯 JS `@formulajs/formulajs`，**只懂 shallow `=FN(range|args)` 形状**，跨 sheet 引用、嵌套函数、复杂 AST 可能算不对。适合单 sheet 小文件快速体检
- `mode: "libreoffice"` → headless soffice round-trip；支持 exceljs 能持久化的所有公式

返回：

```json
{ "ok": true, "mode": "libreoffice", "errorCount": 0, "errors": [], "warnings": [] }
// 或
{ "ok": false, "code": "FORMULA_ERRORS_FOUND",
  "data": { "errorCount": 2, "errors": [
    { "sheet": "Sales", "cell": "D6", "type": "#DIV/0!", "formula": "=C6/B6" }
  ], "warnings": ["CROSS_FILE_REF_IGNORED: G5"] } }
```

**跨文件引用** `='[Book2.xlsx]Sheet1'!A1` 不会被重算，只在 `warnings` 里标记 `CROSS_FILE_REF_IGNORED`。

---

## 6. 财务模型硬约束（颜色 / 数字格式 / 假设分离）

做"财务模型 / 销售模型 / 预算表"这类工作簿时，严格按：

- **蓝色字体 = 手工输入**（用 `style: "INPUT"` 或 `font.color: "0070C0"`）
- **黑色字体 = 本表公式**（默认就是黑色，不用特别设）
- **绿色字体 = 跨 sheet 引用**（例如 `='假设'!B1`；`font.color: "00B050"`）
- **红色字体 = 跨文件引用**（尽量避免；`font.color: "FF0000"`）
- **黄色背景 = 待更新 / 有疑问**（`fill: "FFFF00"`）
- **金额列统一 `numberFormat: "¥#,##0"`**，百分比用 `"0.0%"`，日期用 `"yyyy-mm-dd"`
- **假设 / 输入参数单独放一张 `假设` / `Inputs` sheet**，公式引用它，不要硬编码数字

---

## 7. CSV 自动升级（`meta.upgradedFrom: "csv"`）

- `.csv` / `.tsv` 读写时被当成单 sheet "Sheet1" workbook。
- **写入触发升级**：当你对 csv 做了以下任一操作：引入公式 / 多 sheet / 图表 / 条件格式 / 数据验证 / 合并 —— 工具会**自动产出 `.xlsx`**（同名，扩展名换掉），并在结果 `meta.upgradedFrom: "csv"` 里告知。
- 告诉用户 `data.filePath` 变了（从 `report.csv` 变成 `report.xlsx`），下一次引用要用新路径。
- 纯粹的"改 csv 里某个值 / 加一行"保持 `.csv` 输出，不升级。

---

## 8. 硬约束清单（12 条踩坑指南）

1. **先 `ExcelInspect(summary)` 再任何 action**：跳过 summary 读不到 sheets 列表 / errorCount / isProtected / hasMergedCells，后续会撞 `SHEET_NOT_FOUND` / `MERGED_CELL_WRITE` / `PROTECTED_WORKBOOK`。
2. **`value` 和 `formula` 互斥**：一个 cell 要么字面量要么公式。同传抛 `VALUE_FORMULA_CONFLICT`。
3. **合并单元格只能写左上格**：往非左上格写抛 `MERGED_CELL_WRITE`。先 `ExcelInspect(read)` 看合并范围，或者 `update` 里用 `unmerges: ["A10:D10"]` 先拆。
4. **受保护工作簿不能写**：`isProtected: true` 时写入抛 `PROTECTED_WORKBOOK`；先告知用户解保护。
5. **图表只支持 bar / line / pie 单轴**：双轴 / 组合图 / 散点 / 面积图一律告诉用户"用 Excel 打开手动加"。
6. **`dataRange` 指向不存在的 sheet** 抛 `CHART_RANGE_INVALID`：先 summary 确认 sheets 列表。
7. **structure 参数要匹配 op**：insert/delete 必须 `at`；rename 必须 `from` + `to`；sheet 操作的 `target: "sheet"` 不吃 `sheetName`。缺参抛 `STRUCTURE_OP_INVALID`。
8. **recalc simple 模式有形状限制**：只懂 `=FN(range|args)` 这种浅层公式。跨 sheet / 嵌套 / 复杂 AST 请用 `mode: "libreoffice"`（需 soffice），或告诉用户"在 Excel 里按 F9 重算"。
9. **CSV 升级路径变化**：引入公式 / 多 sheet / 图表后 `.csv` 自动变 `.xlsx`，**必须在回答里告知新的 `filePath`**，不然用户下次找不到文件。
10. **`filePath` 优先用相对路径 / 裸文件名**：`"report.xlsx"` 会解析到 session asset 目录（或项目根），用户也更容易找到。绝对路径允许但属于 out-of-scope 写入，会触发审批闸门让用户确认。
11. **大文件读要分页**：`ExcelInspect(read)` 默认 `limit: 500` 行，超了 `truncated: true`。别一次性 `all: true` 读 10 万行——模型上下文扛不住，先用 `summary` + 有针对性的 `range`。
12. **公式 cell 的 `computed` 是缓存值**：exceljs 不自己重算；写入新公式后 `computed` 是 `null`。要最新值必须 `ExcelMutate(recalc)`。

---

## 9. 错误码速查

| 错误码 | 触发 | 解法 |
|---|---|---|
| `VALUE_FORMULA_CONFLICT` | CellSpec 同时传 `value` + `formula` | 二选一 |
| `SHEET_NOT_FOUND` | `sheetName` 不存在 | 先 `ExcelInspect(summary)` 看 sheets 列表 |
| `MERGED_CELL_WRITE` | 往合并单元格的非左上格写 | 先 unmerge 或改写左上 cell |
| `PROTECTED_WORKBOOK` | 写入受保护 sheet / workbook | 告诉用户解保护或提供密码 |
| `CHART_RANGE_INVALID` | `add-chart` / `create.charts` 的 dataRange 指向不存在 sheet 或空 range | 先 update 填数据再加图表 |
| `STRUCTURE_OP_INVALID` | structure 的 op / target 组合不合法，或缺 at / from / to | 对照 §4.2 schema 补齐 |
| `IMAGE_READ_FAILED` | `add-image` 源无法加载（404 / 非图片 / data URI 坏掉） | 检查 source 路径或 URL |
| `LIBREOFFICE_UNAVAILABLE` | `render` / `recalc(mode:libreoffice)` 本机无 soffice | 降级 `mode:"simple"` 或让用户安装 libreoffice |
| `FORMULA_ERRORS_FOUND` | `recalc` 发现 `#REF!` / `#DIV/0!` / `#VALUE!` 等 | 结果 `errors[]` 里逐 cell 定位，update 修公式 |
| `CROSS_FILE_REF_IGNORED` | recalc 遇 `='[Book2]...'`（warning，不阻塞） | 提示用户跨文件引用不参与重算 |
| `InputValidationError` | zod 校验失败 | 对照 schema 补齐字段 |

---

本技能对应工具的 schema 来源：`packages/api/src/types/tools/excel.ts`。如果你观察到本文档和 schema 描述冲突，**以 schema 为准**，并告诉用户 SKILL.md 需要更新。
