---
name: create-xlsx-skill
description: >
  当用户想要创建、生成或编辑电子表格（.xlsx / .xls / .csv）时触发。典型说法："帮我做一个 Excel 表"、"生成一份销售数据表"、"把这些数据整理成 xlsx"、"新建一个员工花名册"、"修改这个表格的某个单元格"、"把 B2 的值改成 500"、"给这个 Excel 加一行"。**不用于读取**：读表格内容请用统一的 `Read` 工具，本 skill 只负责写入。
---

# XLSX (Excel) 创建与编辑

## 触发条件

用户意图属于以下任一种，即激活本 skill：

- **从零创建** — "做一张销售表"、"生成一份月度报表"、"把这组数据整理成 Excel"、"新建一个考勤表"
- **修改已有** — "把这个表的某个单元格改成 X"、"在这张表加一行"、"更新 Q1 数据"
- **数据落地** — 用户提供了一组结构化数据（对话里粘贴的表格、分析结果），希望落地为 `.xlsx` 文件

> **读取表格不走这里**：用户说"这份 Excel 里谁销量最高"、"总结这张表"时，直接用 `Read(file_path)`，它会把 XLSX 解析成 Markdown table 返回。

## 核心工具：`ExcelMutate`

唯一的写入工具，`needsApproval: true`（所有写入必须经用户确认）。两个 action：

| action | 用途 | 关键字段 |
|--------|------|---------|
| `create` | 从零生成新 `.xlsx` 文件 | `filePath`, `sheetName?`, `data`（二维数组） |
| `edit` | 修改已有 `.xlsx` 文件 | `filePath`, `edits`（XPath 操作数组） |

> 当前工具定义只暴露 `sheetName + data`（单 sheet 创建）。要创建多 sheet 工作簿，先用 `create` 建主 sheet，再用 `edit` 通过 `write` 操作追加其他 sheet 的 XML。

## 创建 Excel 文件（`create`）

最简单的路径：把二维数组扔进去。字符串、数字、布尔、`null` 都支持；CJK（中日韩）字符完全支持，不会乱码。

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

返回后文件即可打开。表头自动加粗由客户端渲染决定，这里只关心数据。

**建议**：

- 文件名用描述性中文或英文都行，避免覆盖源文件 — 默认追加 `_v2`、`_edited` 等后缀
- 大数据量（≥1000 行）直接走 `create` 重建，不要用 `edit` 逐格写

## 编辑已有 Excel 文件（`edit`）

Excel 编辑走 **XPath + XML** 流程。`.xlsx` 本质是一个 ZIP 包，关键路径：

| ZIP 内路径 | 内容 |
|-----------|------|
| `xl/worksheets/sheet1.xml` | 第一张 sheet 的单元格、行列结构 |
| `xl/worksheets/sheet2.xml` | 第二张 sheet（以此类推） |
| `xl/sharedStrings.xml` | 所有字符串单元格的共享字符串池 |
| `xl/workbook.xml` | sheet 列表、命名范围 |

### Step 1：先看原始 XML

`Read(file_path)` 返回的是 Markdown 表格，**看不到真正的 OOXML 节点**。必须用 `Bash unzip -p` 把原始 XML 拉出来：

```bash
unzip -p report.xlsx xl/worksheets/sheet1.xml
unzip -p report.xlsx xl/sharedStrings.xml
```

确认要改的单元格对应哪个节点、是字符串还是数值、用了 sharedStrings 索引还是内联值。

### Step 2：构造 `edits` 数组

每个 edit 是一个操作对象：`{op, path, xpath?, xml?, position?}`。

| op | 作用 | 必填字段 |
|----|------|---------|
| `replace` | 用 `xml` 替换 `xpath` 匹配的节点 | `path`, `xpath`, `xml` |
| `insert` | 在 `xpath` 节点前/后插入 `xml` | `path`, `xpath`, `xml`, `position`（`before`/`after`） |
| `remove` | 删除 `xpath` 匹配的节点 | `path`, `xpath` |
| `write` | 把 `xml`（任意文本）写入 ZIP 内的 `path` | `path`, `xml` |
| `delete` | 删除 ZIP 内 `path` 对应的文件 | `path` |

**示例：把 B2 单元格的数值从旧值改成 123**

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

## 常见陷阱

1. **Shared strings vs inline strings** — 文本单元格通常 **不** 把文字存在 sheet XML 里，而是存 `xl/sharedStrings.xml` 的索引。sheet 里看到的是 `<c r="B2" t="s"><v>3</v></c>`，`3` 是 sharedStrings 里的第 4 个字符串（0-indexed）。改字符串要么在 sharedStrings 里新增一项并更新索引，要么直接把单元格改成内联字符串 `<c r="B2" t="inlineStr"><is><t>新文本</t></is></c>`。

2. **单元格引用 vs XPath** — `A1`、`B2` 是电子表格的坐标系统，**不是 XPath**。XPath 定位的是 XML 节点，需要写成 `//*[local-name()='c' and @r='B2']`。两套地址系统不能混。

3. **`t="s"` 的含义** — `<c r="B2" t="s">` 的 `t="s"` 表示 value 是 sharedStrings 索引，**不是字面文本**。忘记看 `t` 属性就直接改 `<v>` 会把字符串指向错误的字符串池项。

4. **公式单元格** — 公式存在 `<f>` 元素，计算结果缓存在 `<v>` 里。只改 `<v>` 打开后看起来没变化（Excel 会重新计算覆盖），必须同时改 `<f>` 或者干脆删掉 `<v>` 让 Excel 重算。

5. **Mutate 需要用户批准** — `ExcelMutate` 的 `needsApproval` 为 `true`，每次写入都会弹出确认。批量修改先在一次调用里合并所有 `edits`，不要分多次调。

6. **大改用 create** — 当改动超过文件 30% 的内容时，用 `edit` 补丁式修 XML 非常脆弱（sharedStrings 索引漂移、行号冲突）。直接 `Read` 拿到现有数据 → 在内存里整合 → 用 `create` 重建一份新文件，远比 edit 可靠。

## 铁律

1. **编辑前必须 `unzip -p` 看 XML** — 没有例外。猜 XPath 写出去 = 破坏文件。
2. **改字符串先看 `t` 属性** — `t="s"` 走 sharedStrings，其他走内联。
3. **大改重建、小改补丁** — 改动 >30% 直接 `create`。
4. **一次调用合并所有 edits** — 减少审批弹窗和中间状态。
5. **不覆盖源文件** — 默认给输出加后缀，避免用户手里的原始数据被写坏。
