---
name: pdf-skill
description: >
  当用户要求对 PDF 做任何操作时触发：总结 / 阅读正文、抽取表格或特定页、填写 AcroForm 表单、合并多个 PDF、加水印 / 签章 / 机密章、遮罩敏感内容（redaction）、从零生成发票 / 报告 / 凭证 PDF、PDF 与 docx / md / txt 互转。典型说法："总结这份 PDF"、"这份报告讲了什么"、"填一下这个 PDF 表单"、"把这几个 PDF 合一起"、"给这份 PDF 加水印"、"在 PDF 上盖机密章"、"把 PDF 转成 Word"。用户提到 .pdf 文件、要产出 PDF、或做任何 PDF 上的改动都应加载本技能。
---

# PDF 技能

本技能涉及 4 个工具，按**读 → 写 → 转**组织：

| 工具 | 职责 | 只读 |
|------|------|------|
| `Read` | 读 PDF 时的默认入口。返回元信息 + 首页摘要 + 表单字段清单 | 是 |
| `DocPreview` | 两种模式：`preview`（轻量结构信息）/ `full`（完整 Markdown 正文 + 提取图片） | 是 |
| `PdfMutate` | 唯一写入工具。4 个 action：`create` / `fill-form` / `merge` / `add-text` | 否 |
| `DocConvert` | 格式互转：pdf ↔ docx / html / md / txt 等 | 否 |

> **工具按需加载**：`DocPreview`、`PdfMutate`、`DocConvert` 调用前须先 `ToolSearch(names: "工具名")` 加载 schema。`Read` 始终可用。

---

## 1. 读取 PDF

### 1.1 用 `Read` 快速了解

直接 `Read(file_path)` 即可。对 PDF 文件，Read 内部会走 preview 路径，返回：
- 页数、文件大小、元信息（标题/作者/日期等）
- 首页文本摘要（前 400 字符）
- 如果有 AcroForm 表单：字段总数

适合场景：快速判断 PDF 内容、确认是否含表单、获取页数。

### 1.2 用 `DocPreview` 做精细读取

| 参数 | 说明 |
|------|------|
| `mode: 'preview'` | 同 Read，返回结构信息 + 首页摘要（默认值） |
| `mode: 'full'` | 完整提取：每页文本转 Markdown + 嵌入图片提取到 asset 目录 |
| `pageRange: '3-10'` | 指定页码范围（两种 mode 均可用） |

**大 PDF（>20 页）必须用 `pageRange` 分段读**，一次全量提取会超时。建议每次不超过 20 页。

```
DocPreview { file_path: '/work/report.pdf', mode: 'full', pageRange: '1-20' }
DocPreview { file_path: '/work/report.pdf', mode: 'full', pageRange: '21-40' }
```

---

## 2. PdfMutate — 写入 PDF

通过 `action` 字段区分 4 种操作。`filePath` 的含义因 action 而异：
- `create` / `merge` → **输出路径**（新建文件）
- `fill-form` / `add-text` → **已有 PDF 路径**（原地修改）

### 2.1 create — 从零创建

`content` 是结构化块数组，支持 6 种 type：

| type | 字段 |
|------|------|
| `heading` | `text`, `level?`（1-6） |
| `paragraph` | `text`, `bold?`, `italic?`, `fontSize?` |
| `table` | `headers: string[]`, `rows: string[][]` |
| `bullet-list` | `items: string[]` |
| `numbered-list` | `items: string[]` |
| `page-break` | 无额外字段 |

```json
{
  "action": "create",
  "filePath": "/work/invoice.pdf",
  "content": [
    { "type": "heading", "text": "Invoice #20260415", "level": 1 },
    { "type": "paragraph", "text": "Bill to: ACME Corp", "bold": true },
    { "type": "table", "headers": ["Item", "Qty", "Price"], "rows": [["Widget", "3", "$30"]] },
    { "type": "paragraph", "text": "Total: $30" }
  ]
}
```

**CJK 限制**：`create` 使用 pdf-lib StandardFonts，不支持中日韩字符。中文内容必须走 `WordMutate` 创建 docx → `DocConvert` 转 PDF。

### 2.2 fill-form — 填写 AcroForm 表单

**必须先读字段名**。字段名由 PDF 作者定义（可能是 `name` 也可能是 `field_23_a`），猜不到。

```
Step 1: Read('/work/contract.pdf')  → 看 <meta> 中的表单字段名列表
Step 2: PdfMutate { action: "fill-form", filePath: "/work/contract.pdf", fields: { "full_name": "Alice Chen", "date": "2026-04-15" } }
```

- `fields` 是 `{ 字段名: 值 }` 的映射，字段名**区分大小写**
- 返回值中的 `skippedFields` 列出了未命中的字段——通常是拼写/大小写错误，对照字段清单修正后重试
- 如果 PDF 只是视觉上看起来像表单（无真正 AcroForm 字段），fill-form 会全部 skip，此时改用 `add-text` 在坐标上叠加文字

### 2.3 merge — 合并多个 PDF

```json
{
  "action": "merge",
  "filePath": "/work/merged.pdf",
  "sourcePaths": ["/work/cover.pdf", "/work/body.pdf", "/work/appendix.pdf"]
}
```

`sourcePaths` 按数组顺序拼接。如果 `filePath` 与某个源路径相同会覆写，操作前与用户确认。

### 2.4 add-text — 叠加文字 / 水印 / 遮罩

`overlays` 数组，每个元素定义一处叠加：

| 字段 | 类型 | 说明 |
|------|------|------|
| `page` | number | 1-based 页码，必须是已有页 |
| `x` | number | PDF points，原点**左下角** |
| `y` | number | PDF points，原点**左下角**，y 越大越靠上 |
| `text` | string | 叠加的文字 |
| `fontSize?` | number | 默认 12 |
| `color?` | string | 十六进制，默认 "#000000" |
| `background?` | object | `{ color, padding?, width?, height? }` — 背景矩形，用于 redaction 遮罩 |

水印示例：
```json
{ "action": "add-text", "filePath": "/work/report.pdf",
  "overlays": [{ "page": 1, "x": 400, "y": 780, "text": "CONFIDENTIAL", "fontSize": 24, "color": "#FF0000" }] }
```

Redaction 示例（白底覆盖）：
```json
{ "action": "add-text", "filePath": "/work/doc.pdf",
  "overlays": [{ "page": 2, "x": 120, "y": 520, "text": "****", "fontSize": 12, "background": { "color": "#FFFFFF", "padding": 2 } }] }
```

**注意**：redaction 只是视觉遮盖，PDF 底层文本仍可被提取。必须告知用户这一限制。

---

## 3. DocConvert — 格式转换

```json
{ "filePath": "/work/report.pdf", "outputPath": "/work/report.docx", "outputFormat": "docx" }
```

支持的 outputFormat：`pdf`, `docx`, `html`, `md`, `txt`, `csv`, `xls`, `xlsx`, `json`

**pdf → docx 是有损转换**：复杂排版、表格、图片位置可能丢失或错位。转换前必须告知用户。

**CJK PDF 创建的唯一可靠路径**：`WordMutate { action: "create" }` 生成 docx → `DocConvert` 转 PDF。

---

## 4. 关键约束

1. **CJK 内容不能用 `PdfMutate.create`**。StandardFonts 不含 CJK 字形。走 docx 中转。
2. **fill-form 前必须先 Read 拿字段名**。字段名是唯一标识，不能靠猜。
3. **add-text 坐标原点在左下角**。y 越大越靠上。A4 约 595 × 842 pt。
4. **大 PDF 分段读**。DocPreview + pageRange，每次 ≤20 页。
5. **redaction 不是真删除**。底层文本仍在，必须告知用户。
6. **pdf → docx 有损**。转换前告知用户。
7. **create / merge 会覆盖同名文件**。建议使用新文件名或先确认。
