---
name: pdf-skill
description: >
  当用户要求对 PDF 做任何操作时触发：总结 / 阅读正文、抽取表格或特定页、填写 AcroForm 表单、合并多个 PDF、加水印 / 签章 / 机密章、遮罩敏感内容（redaction）、从零生成发票 / 报告 / 凭证 PDF、PDF 与 docx / md / txt 互转。典型说法："总结这份 PDF"、"这份报告讲了什么"、"填一下这个 PDF 表单"、"把这几个 PDF 合一起"、"给这份 PDF 加水印"、"在 PDF 上盖机密章"、"把 PDF 转成 Word"。用户提到 .pdf 文件、要产出 PDF、或做任何 PDF 上的改动都应加载本技能。
---

# PDF 读取、预览与写入

本技能覆盖 PDF 的**三条路径**：

- **读取** — 用 `Read(file_path)` 或 `DocPreview` 拿到 Markdown 化正文、表格、字段信息
- **写入** — 用 `PdfMutate` 创建新 PDF / 填表单 / 合并 / 叠加文字
- **转换** — 用 `DocConvert`（pdf↔docx / pdf→md / pdf→txt 等）

## 触发条件

- **读取/总结**："总结这份 PDF"、"这份报告讲了什么"、"把这几页的表格提取出来"、"这个 PDF 有多少页"
- **创建**：从结构化数据/文本生成新 PDF（报告、发票、凭证等）
- **填表单**：填写已有 PDF AcroForm 表单
- **合并**：把若干个 PDF 合并成一个
- **叠加**：在已有 PDF 上加水印、签章、批注、redaction 遮罩
- **组合**：以上任意组合（例：先 merge 再 add-text 盖水印）

## 第零步：定位目标文件

用户说"总结这份 PDF"、"填这个表单"时先确认具体文件：`pageContext` → `Glob **/*.pdf` → `AskUserQuestion`。

## 读取：Read 与 DocPreview

**默认先用预览扫一遍，内容不够再分段全量读。**

| 场景 | 工具 |
|------|------|
| 小 PDF（< 20 页）快速看全文 | `Read(file_path)` — 返回 Markdown 正文 + `<meta>`（总页数、是否含表单字段、字段数） |
| 大 PDF 或只想先看结构 | `DocPreview { filePath, mode: 'preview' }` — 返回页数、首页摘要、表单字段清单 |
| 需要完整正文 | `DocPreview { filePath, mode: 'full' }` |
| 只想看指定页 | `DocPreview { filePath, mode: 'full', pageRange: '1-10' }` — **大 PDF 必须分段读**，一次读整份会超时 |

> `Read` 返回的 `<meta>` 会告诉你 PDF 是否存在 AcroForm 表单以及字段总数——填表前务必先看这块信息拿到字段名列表。

## 写入工具：`PdfMutate`

唯一入口，通过 `action` 字段区分四种子操作：

| action | 用途 | 必填字段 |
|--------|------|---------|
| `create` | 从零生成新 PDF | `filePath`, `content` |
| `fill-form` | 填写 AcroForm 表单字段 | `filePath`, `fields` |
| `merge` | 合并多个 PDF 为一个 | `filePath`, `sourcePaths` |
| `add-text` | 在已有 PDF 上叠加文字/水印/遮罩 | `filePath`, `overlays` |

`filePath` 对 `create` / `merge` 是**输出路径**，对 `fill-form` / `add-text` 是**已存在的目标 PDF**。

## 创建 PDF（`create`）

`content` 是一个结构化块数组，支持以下 `type`：

- `heading`：`{ type, text, level?: 1-6 }`
- `paragraph`：`{ type, text, bold?, italic?, fontSize? }`
- `table`：`{ type, headers: string[], rows: string[][] }`
- `bullet-list`：`{ type, items: string[] }`
- `numbered-list`：`{ type, items: string[] }`
- `page-break`：`{ type: "page-break" }`

**示例**：

```json
{
  "action": "create",
  "filePath": "/work/invoice_2026_04.pdf",
  "content": [
    { "type": "heading", "text": "Invoice #20260415", "level": 1 },
    { "type": "paragraph", "text": "Bill to: ACME Corp", "bold": true },
    {
      "type": "table",
      "headers": ["Item", "Qty", "Price"],
      "rows": [["Widget", "3", "$30"], ["Gadget", "1", "$50"]]
    },
    { "type": "paragraph", "text": "Total: $80" }
  ]
}
```

### CJK 限制（重要）

`create` 使用 pdf-lib 的 StandardFonts，**不支持中日韩字符**。任何带中文正文的创建请求都会渲染成乱码或直接报错。

**遇到 CJK 内容，走 docx 中转**：`WordMutate { action: "create" }` 生成 docx → `DocConvert` 转 PDF。这是 CJK PDF 的唯一可靠路径。

## 填写表单（`fill-form`）两步流程

字段名是 PDF 作者定义的，可能是 `name` 也可能是 `field_23_a`，**猜不到**。必须先探明字段名再填。

**Step 1：读表单字段**

```
Read('/work/contract_blank.pdf')
# 或者
DocPreview { filePath: '/work/contract_blank.pdf', mode: 'preview' }
```

`Read` / `DocPreview` 的 `<meta>` 会列出 AcroForm 字段名和类型。如果缺少字段含义的上下文，结合正文理解每个字段对应什么信息。

**Step 2：`fill-form` 把字段名→值映射扔进去**

```json
{
  "action": "fill-form",
  "filePath": "/work/contract_blank.pdf",
  "fields": {
    "full_name": "Alice Chen",
    "date": "2026-04-15",
    "agree": "Yes"
  }
}
```

- 工具返回的 `skippedFields` 是没命中的字段名，通常是拼写或大小写问题。**字段名区分大小写**。对照字段名清单修正后再跑一次。
- 如果整个 PDF 只是**视觉上**看起来像表单（没有真正的 AcroForm 字段），`fill-form` 会全部 skip——此时改用 `add-text` 在对应坐标叠加文字。
- 缺信息时用 `AskUserQuestion` 让用户补充。

## 合并 PDF（`merge`）

```json
{
  "action": "merge",
  "filePath": "/work/merged_report.pdf",
  "sourcePaths": [
    "/work/cover.pdf",
    "/work/body.pdf",
    "/work/appendix.pdf"
  ]
}
```

`sourcePaths` 按顺序拼接。`filePath` 是输出路径，若与某个源路径相同会覆写，操作前与用户确认。

## 添加文字 / 水印 / 遮罩（`add-text`）

`overlays` 是一个数组，每个元素定义一处叠加：

```ts
{
  page: number        // 1-based，必须存在
  x: number           // PDF points，原点左下角
  y: number           // PDF points，原点左下角
  text: string
  fontSize?: number   // 默认 12
  color?: string      // 十六进制，默认 "#000000"
  background?: {
    color: string     // 背景矩形颜色，redaction 用 "#FFFFFF"
    padding?: number  // 默认 2
    width?: number    // 省略则按文本宽度自动
    height?: number   // 省略则按字号自动
  }
}
```

**坐标系统重要提醒**：x / y 原点在页面**左下角**，不是左上角。y 越大越靠上。PDF 默认 A4 尺寸约 595 × 842 pt。需精确定位时先 `Read` 或 `DocPreview` 确认页面尺寸和目标位置。

**水印示例**（右上角红色 "CONFIDENTIAL"）：

```json
{
  "action": "add-text",
  "filePath": "/work/report.pdf",
  "overlays": [
    { "page": 1, "x": 400, "y": 780, "text": "CONFIDENTIAL",
      "fontSize": 24, "color": "#FF0000" }
  ]
}
```

**Redaction 示例**（白底星号遮盖身份证号那一行）：

```json
{
  "action": "add-text",
  "filePath": "/work/application.pdf",
  "overlays": [
    {
      "page": 2, "x": 120, "y": 520,
      "text": "****************",
      "fontSize": 12, "color": "#000000",
      "background": { "color": "#FFFFFF", "padding": 2 }
    }
  ]
}
```

## 端到端工作流示例

### "总结这份 100 页的 PDF 并抽取所有表格"

1. `DocPreview { filePath, mode: 'preview' }` — 看总页数、目录、是否含表单
2. 分段读：`DocPreview { filePath, mode: 'full', pageRange: '1-20' }`、`'21-40'`...
3. 对话里整合要点生成总结

### "填这个 PDF 合同表单"

1. `Read` 或 `DocPreview` 看字段名列表和正文上下文
2. 如果缺信息，`AskUserQuestion` 让用户补充
3. `PdfMutate { action: "fill-form" }` 填写
4. 检查返回的 `skippedFields`，若有则对照字段名修正再跑一次

### "从 Excel 数据做一份 PDF 报告（中文）"

1. `DocPreview`/`Read` 读 Excel 数据
2. 整合分析结论
3. `WordMutate { action: "create" }` 生成 docx（CJK 必须走 docx）
4. `DocConvert` 转 PDF

## 格式转换：DocConvert

| 源格式 | 可转为 | 质量提示 |
|--------|--------|---------|
| pdf | txt, html, md, docx | ⚠ pdf→docx 有损：复杂排版、表格、图片位置可能丢失或错位 |
| docx / txt / html | pdf | 高保真（CJK 要走这条路） |

**有损转换前必须告知用户**：pdf→docx 会丢排版，让用户确认后再转。

## 常见陷阱

1. **`create` 不支持中文/日文/韩文**。StandardFonts 限制。CJK 走 `WordMutate` → `DocConvert` → PDF。
2. **`fill-form` 字段名区分大小写**。`Name` 与 `name` 是两个字段。永远先看 `Read` 的 `<meta>` 或返回的 `skippedFields` 再修正。
3. **`add-text` 坐标原点在页面左下角**，不是左上角。y 越大越靠上。
4. **`add-text` 的 `page` 必须是已有页码**（1-based）。页码越界会报错，先确认总页数。
5. **redaction 只是视觉遮盖**：`background` 矩形画在原内容之上，PDF 底层文本仍然存在，复制粘贴或重新提取文本可以读到。真正的敏感信息脱敏需要在原始数据层处理——必须告知用户这一点。
6. **输出路径冲突**：`create` / `merge` 会覆写 `filePath` 同名文件。建议用新文件名（`_merged`、`_v2` 后缀），如确需覆盖源文件，先和用户确认。
7. **大 PDF 必须分段读**：`DocPreview { pageRange: '1-10' }`，一次性读整个大 PDF 会超时。

## 铁律

1. **先定位文件**。
2. **填表单前先读字段名**。`Read` / `DocPreview` 的 `<meta>` 是字段名唯一可靠来源，字段名猜不到。
3. **CJK PDF 必须走 docx 中转**。
4. **大 PDF 分段读取**，用 `pageRange`。
5. **`add-text` 坐标原点左下角**。
6. **create / merge 会覆盖同名文件**，建议加后缀或与用户确认。
7. **有损转换先告知用户**。
8. **redaction 不是真删除**，要明确告知用户。
