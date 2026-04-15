---
name: create-pdf-skill
description: >
  当用户要求创建 PDF、填写 PDF 表单、合并多个 PDF，或在已有 PDF 上叠加文字/水印/签章/遮罩（redaction）时触发。典型说法："帮我生成 PDF"、"填写这个 PDF 表单"、"把这几个 PDF 合并"、"给 PDF 加水印"、"PDF 上盖个机密章"、"把 PDF 某行遮掉"。**不用于** PDF 阅读/总结/内容提取——读取 PDF 请直接使用统一的 `Read` 工具。
---

# PDF 创建与编辑

本技能只负责 PDF 的**写入**侧。读取、总结、抽表、抽图一律走 `Read(file_path, pageRange?)`——本技能不再涉及。

## 触发条件

- 从结构化数据/文本生成一份新 PDF（报告、发票、凭证等）
- 填写已有 PDF AcroForm 表单
- 把若干个 PDF 合并成一个
- 在已有 PDF 上叠加文字：水印、签章、批注、redaction 遮罩
- 以上任意组合（例：先 merge 再 add-text 盖水印）

## 核心工具：`PdfMutate`

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

示例：

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

`create` 使用 pdf-lib 的 StandardFonts，**不支持中日韩字符**。任何带中文正文的创建请求都会渲染成乱码或直接报错。遇到 CJK 内容，改用 `WordMutate { action: "create" }` 生成 DOCX，再让用户自行或通过 `DocConvert` 转为 PDF。

## 填写表单（`fill-form`）

字段名是 PDF 作者定义的，可能是 `name` 也可能是 `field_23_a`，必须事先探明。

1. 先 `Read(file_path)` 查看 PDF 正文以及字段标签（Read 返回的 `<meta>` 会告诉你是否存在表单以及字段总数）。
2. 把字段名 → 值的映射放进 `fields`：

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

3. 工具返回结果里会有 `skippedFields`——这些是没命中的字段名，通常是拼写或大小写问题。**字段名区分大小写**。对照正文修正后再跑一次。
4. 如果整个 PDF 只是**视觉上**看起来像表单（没有真正的 AcroForm 字段），`fill-form` 会全部 skip——此时改用 `add-text` 在对应坐标叠加文字。

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

`sourcePaths` 按顺序拼接。`filePath` 是输出路径，若与某个源路径相同会覆写，操作前请与用户确认。

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

水印示例（右上角红色 "机密"）：

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

Redaction 示例（白底黑星号遮盖身份证号那一行）：

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

PDF 默认 A4 尺寸约 595 × 842 pt。需要精确坐标时先 `Read` 对应页获取页面尺寸和目标位置。

## 常见陷阱

1. **`create` 不支持中文/日文/韩文**。StandardFonts 限制，渲染出来会是乱码。CJK 内容走 `WordMutate` 再转 PDF。
2. **`fill-form` 字段名区分大小写**。`Name` 与 `name` 是两个字段。永远先看返回的 `skippedFields` 再修正。
3. **`add-text` 坐标原点在页面左下角**，不是左上角。y 越大越靠上。
4. **`add-text` 的 `page` 必须是已有页码**（1-based）。页码越界会报错，先确认目标 PDF 的总页数。
5. **redaction 只是视觉遮盖**：`background` 矩形画在原内容之上，PDF 底层文本仍然存在，复制粘贴或重新提取文本可以读到。真正的敏感信息脱敏需要在原始数据层处理。
6. **输出路径冲突**：`create` / `merge` 会覆写 `filePath` 同名文件。建议用新文件名（如 `_merged`、`_v2` 后缀），如确需覆盖源文件，先与用户确认。
