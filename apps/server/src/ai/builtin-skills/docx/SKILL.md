---
name: docx-skill
description: >
  当用户要求对 Word 文档（.docx）做任何操作时触发：总结正文、提取段落 / 表格、改标题、插段落、替换片段、从数据生成报告 / 备忘录 / 合同 / 简历 / 业务文档，以及 docx 与 pdf / html / md / txt 之间的互转。典型说法："帮我总结这份 Word"、"这份 docx 讲了什么"、"把第二段改成 XXX"、"写一份销售报告"、"把这些要点整理成 Word"、"把合同里的表格抽出来"。任何涉及 .docx / .doc 文件或以 Word 文档为产出目标的请求都应加载本技能。
---

# Word (DOCX) 技能

本技能涉及 4 个工具，按**读 → 写 → 转**组织：

| 工具 | 职责 | 只读 |
|------|------|------|
| `Read` | 读 DOCX 时的默认入口。返回 Markdown 正文 + `<meta>`（页数、段落数） | 是 |
| `DocPreview` | 两种模式：`preview`（标题大纲 + 首段 + 统计）/ `full`（完整 Markdown 正文 + 提取图片） | 是 |
| `WordMutate` | 唯一写入工具。2 个 action：`create` / `edit` | 否 |
| `DocConvert` | 格式互转：docx ↔ pdf / html / md / txt 等 | 否 |

> **工具按需加载**：`DocPreview`、`WordMutate`、`DocConvert` 调用前须先 `ToolSearch(names: "工具名")` 加载 schema。`Read` 始终可用。

---

## 1. 读取 DOCX

### 1.1 用 `Read` 快速了解

直接 `Read(file_path)` 即可。返回 Markdown 化正文 + `<meta>`（页数、段落数等）。适合快速判断内容。

### 1.2 用 `DocPreview` 做精细读取

| 参数 | 说明 |
|------|------|
| `mode: 'preview'` | 标题大纲、首段、统计信息（默认值） |
| `mode: 'full'` | 完整 Markdown 正文 + 嵌入图片提取到 asset 目录 |

大文档建议先 `preview` 看结构，再按需 `full` 读取。

> **Read / DocPreview 返回的是 Markdown，不是 OOXML**。要做 XPath 编辑必须先 `Bash unzip -p file.docx word/document.xml` 查看原始 XML 结构。

---

## 2. WordMutate — 写入 DOCX

通过 `action` 字段区分 2 种操作。`needsApproval: true`——调用后弹出审批对话框。

### 2.1 create — 从零创建

`content` 是结构化块数组，支持 5 种 type：

| type | 字段 |
|------|------|
| `heading` | `text`, `level?`（1-6，默认 1） |
| `paragraph` | `text`, `bold?`, `italic?` |
| `table` | `headers: string[]`, `rows: string[][]` |
| `bullet-list` | `items: string[]` |
| `numbered-list` | `items: string[]` |

```json
{
  "action": "create",
  "filePath": "/work/report.docx",
  "content": [
    { "type": "heading", "text": "2026 Q1 销售报告", "level": 1 },
    { "type": "paragraph", "text": "本季度总体表现超预期，同比增长 23%。" },
    { "type": "table", "headers": ["区域", "销售额", "同比"], "rows": [["华东", "1240万", "+28%"]] },
    { "type": "bullet-list", "items": ["拓展东南亚市场", "推出企业版"] }
  ]
}
```

**CJK 完整支持**：WordMutate 的 create 可以直接写中日韩字符，不像 PdfMutate create（仅限 StandardFonts）。**任何 CJK 内容需要产出 PDF 时，走 `WordMutate create` → `DocConvert` 转 PDF。**

### 2.2 edit — 修改已有文件

Word 的主文档 XML 位于 ZIP 内的 `word/document.xml`。编辑 = 对这份 XML 做 XPath 修改。

**编辑前必须先看原始 XML**：
```bash
unzip -p /work/report.docx word/document.xml
```

`edits` 数组，每个元素：

| op | 用途 | 必填字段 |
|----|------|---------|
| `replace` | 替换 xpath 命中的节点 | `path`, `xpath`, `xml` |
| `insert` | 在 xpath 节点前/后插入 | `path`, `xpath`, `xml`, `position`（`before`/`after`） |
| `remove` | 删除 xpath 命中的节点 | `path`, `xpath` |
| `write` | 向 ZIP 写入新文件（如图片） | `path`, `source`（文件路径或 URL） |
| `delete` | 删除 ZIP 内某个文件 | `path` |

替换段落示例：
```json
{
  "action": "edit",
  "filePath": "/work/report.docx",
  "edits": [{
    "op": "replace",
    "path": "word/document.xml",
    "xpath": "//w:p[w:r/w:t[contains(text(), '超预期')]]",
    "xml": "<w:p xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:r><w:t>本季度完成目标 118%。</w:t></w:r></w:p>"
  }]
}
```

OOXML 常用节点：`w:p`（段落）、`w:r`（run）、`w:t`（文本）、`w:tbl`（表格）、`w:tr`（行）、`w:tc`（单元格）、`w:pPr/w:pStyle`（段落样式）。命名空间前缀 `w:`，URI 为 `http://schemas.openxmlformats.org/wordprocessingml/2006/main`。

---

## 3. DocConvert — 格式转换

```json
{ "filePath": "/work/report.docx", "outputPath": "/work/report.pdf", "outputFormat": "pdf" }
```

支持的 outputFormat：`pdf`, `docx`, `html`, `md`, `txt`, `csv`, `xls`, `xlsx`, `json`

**pdf → docx 是有损转换**：复杂排版、表格、图片位置可能丢失或错位。转换前必须告知用户。

---

## 4. 关键约束

1. **CJK PDF 走 docx 中转**。PdfMutate create 不支持 CJK，必须 `WordMutate create` → `DocConvert` 转 PDF。
2. **编辑前必须 `unzip -p` 看 XML**。Read/DocPreview 返回的 Markdown 看不到 XPath 需要的真实节点名，盲写 XPath = 静默无效。
3. **`xml` 载荷必须良构**。replace/insert 的 xml 必须包含正确的命名空间声明，缺少命名空间或标签不闭合 = 文档损坏。
4. **大改用 create，小改用 edit**。改动超过 30% 内容时直接重新 create 比逐条 edit 可靠。
5. **create 会覆盖同名文件**。建议使用新文件名或先与用户确认。
6. **有损转换先告知用户**。pdf → docx 转换前说明风险。
7. **旧版 `.doc` 不支持写入**。需先 `DocConvert` 转为 `.docx` 再处理。
