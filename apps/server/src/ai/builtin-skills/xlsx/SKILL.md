---
name: xlsx-skill
description: >
  当用户要求对电子表格（.xlsx / .xls / .csv）做任何操作时触发：阅读单元格、统计汇总、筛选、透视、判断谁最高谁最低、改单元格、加 / 删行列、从结构化数据生成新表、csv ↔ xlsx 互转。典型说法："这份 Excel 里谁销量最高"、"总结这张表"、"Q1 总收入是多少"、"把 B2 改成 500"、"给这个表加一行"、"新建一个花名册"、"把 csv 转成 xlsx"。用户只要提到表格文件或把结果落成 Excel，哪怕没说 "xlsx"，也应加载本技能。
---

# XLSX (Excel) 读取、预览与写入

本技能覆盖电子表格的**三条路径**：

- **读取** — 用统一的 `Read(file_path)` 或 `DocPreview` 拿到 Markdown 化的表格内容用于阅读、总结、统计分析
- **写入** — 用 `ExcelMutate` 从零创建或 XPath 编辑已有文件
- **转换** — 用 `DocConvert` 在 xlsx / xls / csv / json / html 之间互转

## 触发条件

- **读取/分析**："总结这张表"、"谁销量最高"、"这个 sheet 有多少行"、"把 Q1 的总收入算一下"
- **创建**："做一张销售表"、"生成一份月度报表"、"把这组数据整理成 Excel"、"新建一个考勤表"
- **编辑**："把 B2 改成 500"、"在这张表加一行"、"更新 Q1 数据"、"把第三列删掉"
- **转换**："把 csv 转成 xlsx"、"这个 xlsx 拆成 csv"

## 第零步：定位目标文件

用户说"编辑这个表格"、"打开这个文档"这种模糊指令时，**先确认操作哪个文件**：

1. 检查 `pageContext` — 当前页面是否已关联某个文件？
2. 没有就用 `Glob` 在项目目录搜 `**/*.xlsx`、`**/*.xls`、`**/*.csv`
3. 匹配到多个候选时，列出让用户确认
4. 仍然不确定，直接 `AskUserQuestion` 让用户给路径

不要在未确认文件的情况下执行任何读取或写入操作。

## 读取：Read 与 DocPreview

**默认先用预览扫一遍，内容不够再全量读。**

| 场景 | 工具 |
|------|------|
| 小表格（< 几百行）或只想快速看结构 | `Read(file_path)` — 返回 Markdown 表格 + `<meta>`（sheet 列表、总行列数） |
| 大文件或只想先看 sheet/列结构 | `DocPreview { filePath, mode: 'preview' }` — 返回每个 sheet 的表头、前几行、总行数 |
| 需要完整 Markdown 正文用于统计/汇总 | `DocPreview { filePath, mode: 'full' }` — 展开全部行，代价较高 |
| 需要 XPath 编辑前核对原始 XML | `Bash unzip -p file.xlsx xl/worksheets/sheet1.xml` |

> `Read` 与 `DocPreview` 返回的是 Markdown，**不是真正的 OOXML 节点**；要写 XPath 编辑必须走 `unzip -p`。

## 写入工具：`ExcelMutate`

唯一入口，`needsApproval: true`（所有写入必须经用户确认）。两个 action：

| action | 用途 | 关键字段 |
|--------|------|---------|
| `create` | 从零生成新 `.xlsx` | `filePath`, `sheetName?`, `data`（二维数组） |
| `edit` | 修改已有 `.xlsx` | `filePath`, `edits`（XPath 操作数组） |

> 工具定义只暴露 `sheetName + data`（单 sheet 创建）。要创建多 sheet 工作簿，先 `create` 建主 sheet，再 `edit` 通过 `write` op 追加其他 sheet 的 XML。

## 创建 Excel（`create`）

最简单的路径：把二维数组扔进去。字符串、数字、布尔、`null` 都支持；CJK（中日韩）完全支持不会乱码。

**示例：销售汇总表**

```json
{
  "action": "create",
  "filePath": "/path/to/销售报告_2026Q1.xlsx",
  "sheetName": "Q1 销售明细",
  "data": [
    ["产品", "区域", "销量", "收入（元）", "达成率"],
    ["智能音箱", "华东", 1240, 372000, 1.03],
    ["智能音箱", "华南", 980, 294000, 0.89],
    ["扫地机器人", "华东", 560, 1680000, 1.12],
    ["扫地机器人", "华南", 410, 1230000, 0.95],
    ["合计", null, 3190, 3576000, null]
  ]
}
```

**经验法则**：

- 大数据量（≥ 1000 行）直接走 `create` 重建，不要用 `edit` 逐格写
- 默认文件名追加 `_v2` / `_edited` 后缀，避免覆盖源文件
- 改动超过文件 30% 的内容时，用 `Read`/`DocPreview` 拿到现有数据 → 在内存里整合 → 用 `create` 重建一份新文件，比逐条 `edit` 可靠

## 编辑已有 Excel（`edit`）

Excel 编辑走 **XPath + XML** 流程。`.xlsx` 本质是一个 ZIP 包，关键路径：

| ZIP 内路径 | 内容 |
|-----------|------|
| `xl/worksheets/sheet1.xml` | 第一张 sheet 的单元格、行列结构 |
| `xl/worksheets/sheet2.xml` | 第二张 sheet（以此类推） |
| `xl/sharedStrings.xml` | 所有字符串单元格的共享字符串池 |
| `xl/workbook.xml` | sheet 列表、命名范围 |

### Step 1：先看原始 XML

`Read` / `DocPreview` 返回的是 Markdown 表格，**看不到真正的 OOXML 节点**。必须用 `Bash unzip -p` 把原始 XML 拉出来：

```bash
unzip -p report.xlsx xl/worksheets/sheet1.xml
unzip -p report.xlsx xl/sharedStrings.xml
```

确认要改的单元格对应哪个节点、是字符串还是数值、用了 sharedStrings 索引还是内联值。**盲写 XPath = 破坏文件**，没有例外。

### Step 2：构造 `edits` 数组

每个 edit 是一个操作对象：`{op, path, xpath?, xml?, position?}`。

| op | 作用 | 必填字段 |
|----|------|---------|
| `replace` | 用 `xml` 替换 `xpath` 匹配的节点 | `path`, `xpath`, `xml` |
| `insert` | 在 `xpath` 节点前/后插入 `xml` | `path`, `xpath`, `xml`, `position`（`before`/`after`） |
| `remove` | 删除 `xpath` 匹配的节点 | `path`, `xpath` |
| `write` | 把 `xml`（任意文本）写入 ZIP 内的 `path` | `path`, `xml` |
| `delete` | 删除 ZIP 内 `path` 对应的文件 | `path` |

**示例：把 B2 单元格的数值改成 123**

```json
{
  "action": "edit",
  "filePath": "/path/to/report.xlsx",
  "edits": [
    {
      "op": "replace",
      "path": "xl/worksheets/sheet1.xml",
      "xpath": "//*[local-name()='c' and @r='B2']",
      "xml": "<c r=\"B2\"><v>123</v></c>"
    }
  ]
}
```

## sharedStrings 陷阱（最常见的翻车点）

Excel 的 XML 结构不是你以为的那样——**字符串单元格的文字通常不存在 sheet XML 里，而是存在 `xl/sharedStrings.xml` 的索引位**：

- sheet 里看到的是 `<c r="B2" t="s"><v>3</v></c>`，`3` 是 sharedStrings 里第 4 个字符串（0-indexed）
- `t="s"` 表示 value 是 sharedStrings 索引，**不是字面文本**
- 忘记看 `t` 属性直接改 `<v>` = 把单元格指向错误的共享字符串项

**改字符串单元格的两种正确做法**：

1. 在 `sharedStrings.xml` 里新增一项并记下索引，再把 sheet 里的 `<v>` 指向新索引
2. 把整个单元格改成内联字符串：`<c r="B2" t="inlineStr"><is><t>新文本</t></is></c>`

**数值 vs 字符串的存储差异**：

- 数值单元格：`<c r="B2"><v>123</v></c>`（没有 `t` 属性，`<v>` 就是字面数值）
- 布尔：`<c r="B2" t="b"><v>1</v></c>`
- 共享字符串：`<c r="B2" t="s"><v>3</v></c>`（`<v>` 是索引）
- 内联字符串：`<c r="B2" t="inlineStr"><is><t>文本</t></is></c>`
- 公式单元格：`<c r="B2"><f>SUM(A1:A5)</f><v>15</v></c>`，只改 `<v>` 打开后 Excel 会重算覆盖；要么同时改 `<f>`，要么删掉 `<v>` 让 Excel 重算

**单元格引用 vs XPath**：`A1`、`B2` 是电子表格的坐标系统，**不是 XPath**。XPath 定位的是 XML 节点，必须写成 `//*[local-name()='c' and @r='B2']`。两套地址系统不能混。

## 端到端工作流示例

### "分析这个 Excel 并生成 Word 报告"

1. `DocPreview { filePath, mode: 'preview' }` — 看 sheet 结构、列名、前几行
2. `DocPreview { filePath, mode: 'full' }` 或 `Read(file_path)` — 拿全部数据
3. 对话里做数据分析，或用 `Bash` 跑 node/python 计算统计指标
4. `WordMutate { action: "create" }` — 生成 Word 报告（CJK 友好）
5. 用户要 PDF 的话再 `DocConvert` → PDF

### "把 csv 转成 xlsx 并追加一个汇总行"

1. `DocConvert { filePath: 'data.csv', outputPath: 'data.xlsx', outputFormat: 'xlsx' }`
2. `Read` 看一下转换结果
3. `ExcelMutate { action: "edit" }` 追加汇总行（或直接 `create` 一份带汇总的新文件）

## 格式转换：DocConvert

| 源格式 | 可转为 | 质量提示 |
|--------|--------|---------|
| xlsx / xls | csv, json, txt, html, xls↔xlsx | ⚠ xlsx→csv 只保留第一个 sheet，多 sheet 数据、公式、格式会丢失 |
| csv | xlsx, xls, json | 高保真 |

**有损转换前必须告知用户**：xlsx → csv 会丢掉其他 sheet、公式、格式信息，让用户确认后再转。

## 铁律

1. **先定位文件**。用户说"编辑这个"时确认到底是哪个文件。
2. **编辑前必须 `unzip -p` 看 XML**。没有例外。猜 XPath = 破坏文件。
3. **改字符串先看 `t` 属性**。`t="s"` 走 sharedStrings，其他走内联。
4. **大改重建、小改补丁**。改动 > 30% 直接 `create`。
5. **一次调用合并所有 edits**。减少审批弹窗和中间状态。
6. **不覆盖源文件**。默认给输出加后缀。
7. **有损转换先告知**。xlsx→csv、xlsx→txt 转换前说明风险。
