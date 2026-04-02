---
name: office-document-guide
description: Office 文档操作指南：Excel、Word、PPTX、PDF 的查询、编辑与格式���换。当用户消息涉及任何办公文档格式时必须加载本技能，包括但不限于：Excel/xlsx/xls/csv/spreadsheet/电子表格/表格数据、Word/docx/doc/文档编辑/排版、PowerPoint/pptx/ppt/slides/幻灯片/演示文稿/做个PPT/做个报告、PDF/pdf/合并PDF/拆分PDF/水印/表单填写/pdf转换/读取PDF、以及 convert/导出/格式转换/打开这个文档/编辑这个表格/table/chart data/form/fill form 等场景。只要用户的请求涉及读取、创建、编辑、转换上述任意文件格式，均应触���。
---

# Office 文档操作指南

## 核心心智模型

Office 文档操作分两条路径：**创建（从零生成）** 和 **编辑（修改已有文件）**。创建用结构化 API（简单直接），编辑用 XPath + XML（强大但需要先读取结构）。选错路径 = 事倍功半。

## 第零步：定位目标文件

当用户说"编辑这个表格"、"打开这个文档"等模糊指令时，**必须先确认操作哪个文件**：
1. 检查 `pageContext` — 当前页面是否已关联某个文件？
2. 如果没有，用 `Glob` 或 `Grep` 在项目目录中搜索匹配的文件
3. 找到多个候选时，列出并询问用户确认
4. 仍然不确定时，直接 `AskUserQuestion` 让用户提供路径

不要在未确认文件的情况下执行任何读取或编辑操作。

## 第一个决策：用户要操作什么格式？

```
用户的文件是什么格式？
├─ Excel (.xlsx/.xls) → ExcelQuery / ExcelMutate
├─ Word (.docx) → WordQuery / WordMutate
├─ PowerPoint (.pptx) → PptxQuery / PptxMutate
├─ PDF (.pdf) → PdfQuery / PdfMutate
├─ 需要格式转换 → DocConvert
└─ CSV/HTML/TXT → 先用 DocConvert 转成目标格式，再用对应工具
```

## 第二个决策：创建 vs 编辑 vs 只读？

```
用户想做什么？
├─ 只是读取/分析内容 → *-query（read-structure 或 read-text）
├─ 从零创建新文件 → *-mutate { action: "create" }
├─ 修改已有文件 → *-mutate { action: "edit" }（XPath 编辑，需先 read-xml）
└─ PDF 专属操作 → PdfMutate 的 fill-form / merge / add-text
```

## 输出文件命名与保存

- **默认保存位置**：与源文件同目录；无源文件时保存在项目根目录。
- **命名建议**：使用描述性文件名（如 `销售报告_2026Q1.docx`），避免覆盖源文件。建议默认追加后缀（`_edited`、`_v2`）。
- **覆盖保护**：`create` 会覆写同名文件。当 outputPath 与源文件相同时，**必须先确认用户意图**。
- **格式转换输出**：保持同目录，仅改扩展名（如 `report.docx` → `report.pdf`）。

## Excel：最常用的格式

**读取**：`ExcelQuery` 有三种模式——
- `read-structure`：看工作簿有哪些 sheet、每个 sheet 的单元格数据。**绝大多数场景用这个**。
- `read-text`：纯文本提取，丢失结构但适合快速概览。
- `read-xml`：看 ZIP 内的原始 XML。**只在需要 XPath 编辑时才用**。

**创建**：`ExcelMutate { action: "create" }` 传入二维数组，简单直接。

**编辑已有文件**——关键规则：**必须先 `read-xml` 再编辑**。Excel 的 XML 结构不是你以为的那样——单元格值可能存在 sharedStrings.xml 里而非 sheet XML 中，行列编号有自己的规则。盲写 XPath = 破坏文件。

正确流程：
1. `ExcelQuery { mode: "read-xml", xmlPath: "*" }` — 列出 ZIP 内所有文件
2. `ExcelQuery { mode: "read-xml", xmlPath: "xl/worksheets/sheet1.xml" }` — 读目标 sheet
3. 分析 XML 结构，确认要修改的节点的准确 XPath
4. `ExcelMutate { action: "edit", edits: [...] }` — 用确认过的 XPath 执行修改

编辑操作类型：`replace`（替换节点）、`insert`（before/after 插入）、`remove`（删除节点）、`write`（写入新文件到 ZIP）、`delete`（删除 ZIP 内文件）。

## Word：结构化创建最强

**创建是 Word 的优势场景**。`WordMutate { action: "create" }` 支持丰富的内容类型：heading（1-6 级）、paragraph（可 bold/italic）、table（headers + rows）、bullet-list、numbered-list。适合从数据生成报告。

**编辑已有 Word**：同 Excel 的 XPath 流程——先 `read-xml` 看结构，再 `edit`。Word 的主文档在 `word/document.xml`。

**经验法则**：如果要改的内容超过文档的 30%，用 `create` 重建比 `edit` 修补更可靠。XPath 编辑适合精确的小改动（改个标题、换个日期），不适合大面积重写。

## PowerPoint：幻灯片创建

**创建**：`PptxMutate { action: "create" }` 传入 slides 数组，每个 slide 有 title、textBlocks、notes。

**内容建议**：
- **幻灯片数量**：5-15 页为宜。少于 5 页内容太密，超过 20 页考虑拆分主题。
- **每页文字量**：标题不超过 10 字，每个 textBlock 控制在 3-5 行、每行 15-20 字以内。
- **notes 字段**：演讲者备注，不显示在正文。适合放详细数据、补充说明、演讲提示词。

**编辑**：同 XPath 流程。PPTX 的 slide 在 `ppt/slides/slide1.xml` 等路径下。

**局限**：create 只支持文本和标题布局。需要复杂排版（图表、自定义形状）时，建议先 create 基础版，用户在 PowerPoint 中手动调整。

## PDF：四大专属能力

**1. 表单填写** — 两步流程，不能跳步：
1. `PdfQuery { mode: "read-form-fields" }` — 必须先看有哪些字段、字段名是什么
2. `PdfMutate { action: "fill-form", fields: { "字段名": "值" } }`

字段名是作者定义的，可能是 "name" 也可能是 "field_23_a"，猜不到。

**2. 合并** — `PdfMutate { action: "merge", sourcePaths: ["a.pdf", "b.pdf"] }`

**3. 叠加文字** — 水印、签章、批注
`PdfMutate { action: "add-text", overlays: [{ page: 1, x: 400, y: 50, text: "机密", fontSize: 24, color: "#FF0000" }] }`
x/y 坐标原点在页面左下角。需精确定位时先 `PdfQuery { mode: "read-structure" }` 获取页面尺寸。

**4. 创建** — `PdfMutate { action: "create" }` 的 content 格式与 Word 完全相同。

**读取大 PDF**：务必用 `pageRange` 参数分段读取（如 `"1-10"`），一次读取整个大 PDF 会超时。

## 格式转换：DocConvert

一个工具搞定所有转换。只需 `filePath`、`outputPath`、`outputFormat`。

支持的转换路径（注意质量差异）：

| 源格式 | 可转为 | 质量提示 |
|--------|--------|---------|
| docx | html, md, txt, pdf | 高保真 |
| pdf | txt, html, md, docx | ⚠ pdf→docx 有损：复杂排版、表格、图片位置可能丢失或错位 |
| xlsx/xls | csv, json, txt, html, xls↔xlsx | ⚠ xlsx→csv 只保留第一个 sheet，多 sheet 数据会丢失 |
| csv | xlsx, xls, json | 高保真 |
| html | md, txt, pdf | 高保真 |
| txt | pdf, docx, html | 高保真 |

转换前如有质量风险，**主动告知用户**可能的精度损失，让用户决定是否继续。

## 端到端工作流示例

### "分析这个 Excel 并生成报告"
1. `ExcelQuery { mode: "read-structure" }` — 读数据
2. 用 `JsRepl` 分析数据、计算统计指标
3. `WordMutate { action: "create" }` — 生成 Word 报告
4. `DocConvert` → PDF（如果用户要 PDF）

### "填这个 PDF 表单"
1. `PdfQuery { mode: "read-form-fields" }` — 看字段
2. 如果缺信息，`AskUserQuestion` 让用户补充
3. `PdfMutate { action: "fill-form" }` — 填写

### "把这些数据做成 PPT"
1. `ExcelQuery` 或 `DocConvert` 读取源数据
2. 分析并组织关键发现
3. `PptxMutate { action: "create" }` — 生成幻灯片

## 常见错误与恢复

**XPath 编辑后文件损坏？**
→ 几乎一定是因为没有先 `read-xml` 就猜着写 XPath。重新读取原文件，仔细看 XML 结构后再编辑。如果改动范围大，放弃 edit，用 `create` 重建。

**Excel 编辑后数值变了？**
→ Excel 把字符串存在 sharedStrings.xml、数值直接存在 sheet XML。修改字符串单元格需要同时更新 sharedStrings。先 `read-xml { xmlPath: "xl/sharedStrings.xml" }` 搞清楚映射关系。

**PDF 表单填写失败？**
→ 字段名不对。重新 `read-form-fields` 仔细核对。字段名区分大小写。
→ 如果 PDF 没有真正的表单字段（只是视觉上看起来像表单），用 `add-text` 在对应位置叠加文字。

## 铁律

1. **先定位文件**。用户说"编辑这个"时，确认到底是哪个文件。
2. **XPath 编辑前必须 read-xml**。没有例外。
3. **大改用 create，小改用 edit**。阈值：改动超过内容 30% 就用 create。
4. **PDF 表单先 read-form-fields**。字段名猜不到。
5. **大 PDF 分段读取**。用 pageRange，别一次全读。
6. **create 会覆盖同名文件**。操作前确认用户意图，建议用新文件名。
7. **有损转换先告知**。pdf→docx、xlsx→csv 转换前说明质量风险。
