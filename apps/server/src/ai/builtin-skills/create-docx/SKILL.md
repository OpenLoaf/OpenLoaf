---
name: create-docx-skill
description: >
  当用户需要**创建**或**编辑** Word 文档（.docx）时触发：生成报告、写一份 Word、在 docx 里改标题、插段落、替换表格等。典型中文说法包括「帮我生成一份 Word 文档」、「写一份 docx 报告」、「修改这个 Word 文件的标题」、「在 Word 里插一段」、「把这份 docx 的某段改成…」。**本技能仅用于写入（authoring）**，不用于读取——读取 Word 内容请直接用 `Read` 工具，它会返回 Markdown 化正文与元信息。
---

# DOCX (Word) 创建与编辑

本技能聚焦在 `.docx` 的**创建**与**编辑**两条写入路径。读取（看内容/总结/提取表格）请直接用 `Read(file_path)`，不在本技能覆盖范围内。

> **旧版 `.doc` 不支持**：需先让用户另存为 `.docx` 再处理。

## 触发条件

- 用户说「帮我生成/写一份 Word 文档/docx/报告/合同/纪要」
- 用户说「改一下这个 Word 里的某段/标题/表格」
- 用户给了一份数据/Excel/JSON，要求产出结构化的 Word 报告
- 用户要求在已有 docx 中插入段落、替换文字、删除某个表格
- 用户要求生成中文报告并最终导出 PDF（推荐先 `WordMutate` 创建再 `DocConvert` 转 PDF）

## 核心工具：`WordMutate`

唯一入口。两种 `action`：

| action | 用途 | 必填字段 |
|--------|------|---------|
| `create` | 从零创建新 `.docx` | `filePath`, `content`（结构化数组） |
| `edit`   | 修改已有 `.docx` | `filePath`, `edits`（XPath + XML 数组） |

> `WordMutate` 是写入工具，`needsApproval: true`——调用后用户会看到审批对话框，确认后才真正落盘。

## 创建 Word 文档（`create`）

传入结构化的 `content` 数组，每一项是以下类型之一：

| type | 字段 | 说明 |
|------|------|------|
| `heading` | `text`, `level` (1–6，默认 1) | 标题 |
| `paragraph` | `text`, `bold?`, `italic?` | 普通段落 |
| `table` | `headers: string[]`, `rows: string[][]` | 表格 |
| `bullet-list` | `items: string[]` | 无序列表 |
| `numbered-list` | `items: string[]` | 有序列表 |
| `page-break` | — | 分页 |

**重要优势**：`WordMutate` 的 `create` **完整支持中日韩字符**（不像 `PdfMutate` 的 create 只支持标准字体）。**任何中文/CJK 报告都应优先走 WordMutate 创建**，需要 PDF 时再用 `DocConvert` 转一遍。

### 示例：生成一份销售报告

```json
{
  "action": "create",
  "filePath": "/project/reports/销售报告_2026Q1.docx",
  "content": [
    { "type": "heading", "text": "2026 Q1 销售报告", "level": 1 },
    { "type": "paragraph", "text": "本季度总体表现超预期，同比增长 23%。", "bold": false },
    { "type": "heading", "text": "各区域业绩", "level": 2 },
    {
      "type": "table",
      "headers": ["区域", "销售额（万元）", "同比"],
      "rows": [
        ["华东", "1240", "+28%"],
        ["华北", "980",  "+15%"],
        ["华南", "1105", "+22%"]
      ]
    }
  ]
}
```

**命名与覆盖**：默认与源文件同目录；`create` 会覆写同名文件，建议追加 `_v2`、`_edited` 等后缀避免误覆盖。

**经验法则**：如果改动涉及文档内容的 30% 以上，**直接重新 `create` 一份比逐条 `edit` 更可靠**。XPath 编辑只适合精确的小改动。

## 编辑已有 Word 文档（`edit`）

Word 的主文档 XML 位于 ZIP 内的 `word/document.xml`。编辑 docx = 对这份 XML 做节点级的 XPath 修改。

### 第一步：核对原始 XML 结构

`Read` 返回的是 Markdown 正文，**看不到 XPath 需要的真实节点名**。外科手术式的编辑必须先拿到原始 OOXML：

```bash
unzip -p /project/reports/销售报告.docx word/document.xml
```

逐个节点确认要改的位置，找到命中的 `w:p` / `w:r` / `w:t` / `w:tbl` 等节点的准确 XPath。Word 的 OOXML 主要命名空间前缀是 `w:`。

### 第二步：构造 `edits` 数组

每个 edit 项的字段：

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

### 示例：在某个标题后插入新段落

```json
{
  "op": "insert",
  "path": "word/document.xml",
  "xpath": "//w:p[w:pPr/w:pStyle[@w:val='Heading2']][1]",
  "position": "after",
  "xml": "<w:p xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:r><w:t>补充说明：数据截至 3 月 31 日。</w:t></w:r></w:p>"
}
```

### 示例：删除一个表格

```json
{
  "op": "remove",
  "path": "word/document.xml",
  "xpath": "//w:tbl[1]"
}
```

## 常见陷阱

1. **XPath 必须精确**——表达式写错时工具不会报错，只会静默命中 0 个节点，文件看起来没动。务必先用 `unzip -p` 把目标 XML 拉出来，对着节点结构写 XPath。
2. **`xml` 载荷必须良构**——`replace` / `insert` 的 `xml` 要包含正确的命名空间（`xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`），缺少命名空间或标签不闭合会导致打开文档时损坏。Word 的常用前缀：`w:p`（段落）、`w:r`（run）、`w:t`（文本）、`w:tbl`（表格）、`w:tr`（行）、`w:tc`（单元格）。
3. **审批对话框**——`WordMutate` 需要用户审批（`needsApproval: true`），每次调用用户都会看到确认弹窗，不要期待"静默写入"。
4. **大改动用重建，不要堆叠 edit**——超过文档 30% 的改动，直接 `Read` 看正文 → 重新用 `create` 生成，比写十几条 edit 稳得多，也更易调试。
5. **中文报告首选 docx**——要产出 CJK 内容的 PDF，**先 `WordMutate create` 生成 docx，再 `DocConvert` 转 PDF**，不要直接用 `PdfMutate create`（标准字体不支持 CJK）。
6. **覆盖保护**——`create` 会覆写同名文件，当 `filePath` 指向已存在的文件时，先和用户确认或改用新文件名（如加 `_v2` / `_edited` 后缀）。
