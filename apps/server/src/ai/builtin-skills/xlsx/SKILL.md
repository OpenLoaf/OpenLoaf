---
name: xlsx-skill
description: >
  当用户要求对电子表格（.xlsx / .xls / .csv）做任何操作时触发：阅读单元格、统计汇总、筛选、透视、判断谁最高谁最低、改单元格、加 / 删行列、从结构化数据生成新表、csv ↔ xlsx 互转。典型说法："这份 Excel 里谁销量最高"、"总结这张表"、"Q1 总收入是多少"、"把 B2 改成 500"、"给这个表加一行"、"新建一个花名册"、"把 csv 转成 xlsx"。用户只要提到表格文件或把结果落成 Excel，哪怕没说 "xlsx"，也应加载本技能。
---

# Excel (XLSX) 技能

本技能涉及 4 个工具，按**读 → 写 → 转**组织：

| 工具 | 职责 | 只读 |
|------|------|------|
| `Read` | 读 XLSX 时的默认入口。返回 Markdown 表格 + `<meta>`（sheet 列表、总行列数） | 是 |
| `DocPreview` | 两种模式：`preview`（每个 sheet 的表头 + 前几行 + 总行数）/ `full`（展开全部行） | 是 |
| `ExcelMutate` | 唯一写入工具。2 个 action：`create` / `edit` | 否 |
| `DocConvert` | 格式互转：xlsx ↔ csv / json / xls / html / txt 等 | 否 |

> **工具按需加载**：`DocPreview`、`ExcelMutate`、`DocConvert` 调用前须先 `ToolSearch(names: "工具名")` 加载 schema。`Read` 始终可用。

---

## 1. 读取 XLSX

### 1.1 用 `Read` 快速了解

直接 `Read(file_path)` 即可。返回 Markdown 表格 + `<meta>`（sheet 列表、总行列数）。适合小表格或快速浏览。

### 1.2 用 `DocPreview` 做精细读取

| 参数 | 说明 |
|------|------|
| `mode: 'preview'` | 每个 sheet 的表头、前几行、总行数（默认值） |
| `mode: 'full'` | 展开所有行（大文件代价较高） |
| `sheetName` | 指定 sheet 名称（两种 mode 均可用） |

大文件建议先 `preview` 看结构和列名，再对目标 sheet 做 `full` 读取。

> **Read / DocPreview 返回的是 Markdown，不是 OOXML**。要做 XPath 编辑必须先 `Bash unzip -p file.xlsx xl/worksheets/sheet1.xml` 查看原始 XML 结构。

---

## 2. ExcelMutate — 写入 XLSX

通过 `action` 字段区分 2 种操作。`needsApproval: true`——调用后弹出审批对话框。

### 2.1 create — 从零创建

传入二维数组 `data`，支持 string / number / boolean / null。CJK 完全支持。

```json
{
  "action": "create",
  "filePath": "/work/sales.xlsx",
  "sheetName": "Q1 销售",
  "data": [
    ["产品", "区域", "销量", "收入（元）"],
    ["智能音箱", "华东", 1240, 372000],
    ["扫地机器人", "华南", 410, 1230000],
    ["合计", null, 1650, 1602000]
  ]
}
```

- `sheetName` 可选，默认 "Sheet1"
- 要创建多 sheet 工作簿：先 `create` 建主 sheet，再 `edit` 通过 `write` op 追加其他 sheet 的 XML

### 2.2 edit — 修改已有文件

`.xlsx` 本质是 ZIP 包。关键内部路径：

| ZIP 路径 | 内容 |
|---------|------|
| `xl/worksheets/sheet1.xml` | 第 1 个 sheet 的单元格和行列 |
| `xl/sharedStrings.xml` | 所有字符串单元格的共享字符串池 |
| `xl/workbook.xml` | sheet 列表、命名范围 |

**编辑前必须先看原始 XML**：
```bash
unzip -p /work/report.xlsx xl/worksheets/sheet1.xml
unzip -p /work/report.xlsx xl/sharedStrings.xml
```

`edits` 数组，每个元素：

| op | 用途 | 必填字段 |
|----|------|---------|
| `replace` | 替换 xpath 命中的节点 | `path`, `xpath`, `xml` |
| `insert` | 在 xpath 节点前/后插入 | `path`, `xpath`, `xml`, `position`（`before`/`after`） |
| `remove` | 删除 xpath 命中的节点 | `path`, `xpath` |
| `write` | 向 ZIP 写入新文件 | `path`, `source`（文件路径或 URL） |
| `delete` | 删除 ZIP 内某个文件 | `path` |

修改单元格示例：
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

### sharedStrings 陷阱（最常见翻车点）

字符串单元格的文字通常不在 sheet XML 里，而是存在 `xl/sharedStrings.xml` 的索引位：

- `<c r="B2" t="s"><v>3</v></c>` — `t="s"` 表示 value 是 sharedStrings 第 4 个字符串（0-indexed），**不是字面文本**
- 忘记看 `t` 属性直接改 `<v>` = 把单元格指向错误的共享字符串项

**改字符串单元格的正确做法**：把整个单元格改成内联字符串：
```xml
<c r="B2" t="inlineStr"><is><t>新文本</t></is></c>
```

**各类型单元格的存储格式**：

| 类型 | XML | 说明 |
|------|-----|------|
| 数值 | `<c r="B2"><v>123</v></c>` | 无 `t` 属性，`<v>` 是字面数值 |
| 布尔 | `<c r="B2" t="b"><v>1</v></c>` | `1`=true, `0`=false |
| 共享字符串 | `<c r="B2" t="s"><v>3</v></c>` | `<v>` 是 sharedStrings 索引 |
| 内联字符串 | `<c r="B2" t="inlineStr"><is><t>文本</t></is></c>` | 改字符串时推荐用这种 |
| 公式 | `<c r="B2"><f>SUM(A1:A5)</f><v>15</v></c>` | 只改 `<v>` 打开后 Excel 会重算覆盖 |

---

## 3. DocConvert — 格式转换

```json
{ "filePath": "/work/data.csv", "outputPath": "/work/data.xlsx", "outputFormat": "xlsx" }
```

支持的 outputFormat：`pdf`, `docx`, `html`, `md`, `txt`, `csv`, `xls`, `xlsx`, `json`

**xlsx → csv 是有损转换**：只保留第一个 sheet，多 sheet 数据、公式、格式全部丢失。转换前必须告知用户。

---

## 4. 关键约束

1. **编辑前必须 `unzip -p` 看 XML**。Read/DocPreview 返回的 Markdown 看不到真实节点结构，盲写 XPath = 破坏文件。
2. **改字符串先看 `t` 属性**。`t="s"` 表示共享字符串索引，不是字面值。推荐改为 `t="inlineStr"` 格式。
3. **单元格引用 ≠ XPath**。`A1`、`B2` 是电子表格坐标，XPath 必须写成 `//*[local-name()='c' and @r='B2']`。
4. **大改用 create，小改用 edit**。改动超过 30% 或涉及 ≥1000 行时，直接重新 create 比逐条 edit 可靠。
5. **一次调用合并所有 edits**。减少审批弹窗和中间状态。
6. **create 会覆盖同名文件**。建议使用新文件名或先与用户确认。
7. **有损转换先告知用户**。xlsx → csv 只保留首个 sheet。
