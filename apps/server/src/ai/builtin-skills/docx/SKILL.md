---
name: docx-skill
description: >
  当用户要求对 Word 文档（.docx）做任何操作时触发：总结正文、提取段落 / 表格、改标题、插段落、替换片段、从数据生成报告 / 备忘录 / 合同 / 简历 / 业务文档，以及 docx 与 pdf / html / md / txt 之间的互转。典型说法："帮我总结这份 Word"、"这份 docx 讲了什么"、"把第二段改成 XXX"、"写一份销售报告"、"把这些要点整理成 Word"、"把合同里的表格抽出来"。任何涉及 .docx / .doc 文件或以 Word 文档为产出目标的请求都应加载本技能。
---

# DOCX (Word) 读取、预览与写入

本技能覆盖 Word 文档的**三条路径**：

- **读取** — 用统一的 `Read(file_path)` 或 `DocPreview` 拿到 Markdown 化正文和元信息
- **写入** — 用 `WordMutate` 从零创建或 XPath 编辑已有文件
- **转换** — 用 `DocConvert` 在 docx / pdf / html / md / txt 之间互转

> **旧版 `.doc` 不支持写入**：需先让用户另存为 `.docx` 再处理。读取有限支持，必要时先 `DocConvert` 转 `.docx`。

## 触发条件

- **读取/分析**："总结这份 Word"、"这份 docx 在讲什么"、"把这份合同的关键条款提出来"
- **创建**："帮我生成一份 Word 报告"、"写一份季度汇报 docx"、"把这些要点整理成 Word"
- **编辑**："把标题改一下"、"在第二段后加一段说明"、"删掉那个表格"、"把 X 替换成 Y"
- **从数据生报告**：用户粘贴一段数据或让你先分析 Excel 再输出 Word 报告
- **生成 CJK PDF**：要产出中文 PDF 时，**先 `WordMutate create` 生成 docx，再 `DocConvert` 转 PDF**（PdfMutate 的 create 不支持 CJK）

## 第零步：定位目标文件

用户说"编辑这份文档"、"打开这个 Word"时，**先确认操作哪个文件**：

1. 检查 `pageContext` — 当前页面是否已关联某个文件？
2. 没有就用 `Glob` 搜 `**/*.docx` / `**/*.doc`
3. 多个候选时列出让用户确认
4. 仍不确定就 `AskUserQuestion`

## 读取：Read 与 DocPreview

**默认先用预览扫一遍，内容不够再全量读。**

| 场景 | 工具 |
|------|------|
| 小文档或只想快速看大纲 | `Read(file_path)` — 返回 Markdown 正文 + `<meta>`（页数、段落数） |
| 大文档或只想先看结构 | `DocPreview { filePath, mode: 'preview' }` — 返回标题大纲、首段、统计信息 |
| 需要完整 Markdown 正文 | `DocPreview { filePath, mode: 'full' }` — 全文展开 |
| XPath 编辑前核对原始 OOXML | `Bash unzip -p file.docx word/document.xml` |

> `Read` / `DocPreview` 返回的是 Markdown，**看不到 XPath 需要的 `w:p` / `w:r` / `w:t` 节点**；要 `edit` 必须 `unzip -p`。

## 写入工具：`WordMutate`

唯一入口。`needsApproval: true`——调用后会弹出审批对话框，确认后才落盘。两个 action：

| action | 用途 | 必填字段 |
|--------|------|---------|
| `create` | 从零创建新 `.docx` | `filePath`, `content`（结构化数组） |
| `edit`   | 修改已有 `.docx` | `filePath`, `edits`（XPath + XML 数组） |

## 创建 Word 文档（`create`）

传入结构化 `content` 数组，每一项是以下类型之一：

| type | 字段 | 说明 |
|------|------|------|
| `heading` | `text`, `level` (1–6，默认 1) | 标题 |
| `paragraph` | `text`, `bold?`, `italic?` | 普通段落 |
| `table` | `headers: string[]`, `rows: string[][]` | 表格 |
| `bullet-list` | `items: string[]` | 无序列表 |
| `numbered-list` | `items: string[]` | 有序列表 |
| `page-break` | — | 分页 |

**重要优势**：`WordMutate` 的 `create` **完整支持中日韩字符**（不像 `PdfMutate create` 只支持标准字体）。**任何 CJK 报告都应优先走 WordMutate 创建**，需要 PDF 时再 `DocConvert` 转一遍。

### 示例：从数据生成销售报告

```json
{
  "action": "create",
  "filePath": "/project/reports/销售报告_2026Q1.docx",
  "content": [
    { "type": "heading", "text": "2026 Q1 销售报告", "level": 1 },
    { "type": "paragraph", "text": "本季度总体表现超预期，同比增长 23%。" },
    { "type": "heading", "text": "各区域业绩", "level": 2 },
    {
      "type": "table",
      "headers": ["区域", "销售额（万元）", "同比"],
      "rows": [
        ["华东", "1240", "+28%"],
        ["华北", "980",  "+15%"],
        ["华南", "1105", "+22%"]
      ]
    },
    { "type": "heading", "text": "下季度重点", "level": 2 },
    {
      "type": "bullet-list",
      "items": ["拓展东南亚市场", "推出企业版", "优化客服响应"]
    }
  ]
}
```

**经验法则（30% 阈值铁律）**：如果改动涉及文档内容的 30% 以上，**直接重新 `create` 一份比逐条 `edit` 更可靠**。XPath 编辑只适合精确的小改动（改标题、换日期、补一行）。大面积重写强行用 edit 拼补丁会非常脆弱。

**命名与覆盖**：默认与源文件同目录；`create` 会覆写同名文件，建议追加 `_v2` / `_edited` 后缀。指向已存在文件时先与用户确认。

## 编辑已有 Word 文档（`edit`）

Word 的主文档 XML 位于 ZIP 内的 `word/document.xml`。编辑 docx = 对这份 XML 做节点级的 XPath 修改。

### 第一步：核对原始 XML 结构

`Read` / `DocPreview` 返回的是 Markdown，**看不到 XPath 需要的真实节点名**。外科手术式的编辑必须先拿到原始 OOXML：

```bash
unzip -p /project/reports/销售报告.docx word/document.xml
```

Word 的 OOXML 主要命名空间前缀是 `w:`。常用节点：`w:p`（段落）、`w:r`（run）、`w:t`（文本）、`w:tbl`（表格）、`w:tr`（行）、`w:tc`（单元格）、`w:pPr/w:pStyle`（段落样式）。

### 第二步：构造 `edits` 数组

| 字段 | 说明 |
|------|------|
| `op` | `replace` / `insert` / `remove` / `write` / `delete` |
| `path` | ZIP 内文件路径，一般是 `word/document.xml` |
| `xpath` | 命中目标节点的 XPath 表达式 |
| `xml` | `replace` / `insert` 时的新节点内容（必须是良构 XML） |
| `position` | `insert` 时指定 `before` / `after` |
| `source` | `write` 时的新文件内容（向 ZIP 写入新条目） |

### 示例：替换一个段落

```json
{
  "action": "edit",
  "filePath": "/project/reports/销售报告.docx",
  "edits": [
    {
      "op": "replace",
      "path": "word/document.xml",
      "xpath": "//w:p[w:r/w:t[contains(text(), '超预期')]]",
      "xml": "<w:p xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:r><w:t>本季度完成目标 118%，同比增长 23%。</w:t></w:r></w:p>"
    }
  ]
}
```

### 示例：在某个 Heading2 后插入新段落

```json
{
  "op": "insert",
  "path": "word/document.xml",
  "xpath": "//w:p[w:pPr/w:pStyle[@w:val='Heading2']][1]",
  "position": "after",
  "xml": "<w:p xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:r><w:t>补充说明：数据截至 3 月 31 日。</w:t></w:r></w:p>"
}
```

### 示例：删除第一个表格

```json
{
  "op": "remove",
  "path": "word/document.xml",
  "xpath": "//w:tbl[1]"
}
```

## 端到端工作流示例

### "分析这份 Excel 并生成 Word 报告"

1. `DocPreview { filePath: 'sales.xlsx', mode: 'preview' }` — 看 sheet 结构
2. `DocPreview { filePath: 'sales.xlsx', mode: 'full' }` — 拿全部数据
3. 对话里或 `Bash` 做数据分析
4. `WordMutate { action: "create" }` — 生成 Word 报告
5. 用户要 PDF 的话再 `DocConvert` → PDF

### "把这份 Word 里的 2025 全部改成 2026"

1. `Read('contract.docx')` 看正文确认要替换的段落
2. `Bash unzip -p contract.docx word/document.xml` 找到命中的 `w:t` 节点
3. `WordMutate { action: "edit" }` 用 `replace` 精确改每一处
4. 改动点 > 10 处或超过 30% 内容时，直接 `create` 一份全新的

## 格式转换：DocConvert

| 源格式 | 可转为 | 质量提示 |
|--------|--------|---------|
| docx | html, md, txt, pdf | 高保真 |
| pdf | txt, html, md, docx | ⚠ pdf→docx 有损：复杂排版、表格、图片位置可能丢失或错位 |
| txt | docx, html, pdf | 高保真 |

**有损转换前必须告知用户**：pdf→docx 会丢排版，让用户确认后再转。

## 常见陷阱

1. **XPath 必须精确**：表达式写错不会报错，只会静默命中 0 个节点，文件看起来没动。务必先 `unzip -p` 看节点结构。
2. **`xml` 载荷必须良构**：`replace` / `insert` 的 `xml` 要包含正确的命名空间（`xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`），缺少命名空间或标签不闭合 = 打开文档时损坏。
3. **审批对话框**：每次调用用户都会看到确认弹窗，不要期待"静默写入"。批量 edit 合并到一次调用里。
4. **中文报告首选 docx**：CJK 内容要产出 PDF，走 `WordMutate create → DocConvert → PDF`，不要用 `PdfMutate create`。

## 铁律

1. **先定位文件**。
2. **编辑前必须 `unzip -p` 看 XML**。没有例外。
3. **大改重建（create）、小改补丁（edit）**。30% 阈值。
4. **不覆盖源文件**。默认给输出加后缀。
5. **CJK PDF 走 docx 中转**。
6. **有损转换先告知用户**。
