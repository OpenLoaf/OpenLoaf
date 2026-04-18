---
name: pdf-skill
description: >
  PDF 读/写/转/OCR 一体化。触发场景：总结 PDF、读文本或表格、填 AcroForm 表单、填扫描件/非 AcroForm 表格、渲染页面为图（用于 OCR / 可视化定位）、合并、拆分、加水印/机密章、遮罩敏感内容、创建新 PDF（发票/报告/凭证）、PDF ↔ docx/md/txt 互转。典型说法：“总结这份 PDF”、“填一下这个 PDF 表单”、“把这几个 PDF 合一起”、“PDF 加水印”、“PDF 转 Word”、“扫描件 OCR”、“看看 PDF 第 3 页长什么样”。用户提到 .pdf 文件、要产出 PDF、或要对 PDF 做任何改动都加载本技能。
---

# PDF 技能

一共 4 个工具，按 **看 → 改 → 转 → OCR** 组织：

| 工具 | 职责 | 只读 | 调用前需加载 schema |
|---|---|---|---|
| `PdfInspect` | **所有读操作**（8 action）：summary / text / tables / form-fields / form-structure / images / annotations / render | ✅ | `ToolSearch(names: "PdfInspect")` |
| `PdfMutate` | **所有写操作**（12 action）：create / fill-form / fill-visual / add-text / merge / split / extract-pages / rotate / crop / watermark / decrypt / optimize | ❌ | `ToolSearch(names: "PdfMutate")` |
| `DocConvert` | 格式互转：pdf ↔ docx / html / md / txt / xlsx / json 等 | ❌ | `ToolSearch(names: "DocConvert")` |
| `CloudImageUnderstand` | **扫描 PDF 的 OCR 入口**（云端，会扣积分） | ❌（调用云端） | 通过 cloud-media-skill 加载 |

> `Read` 仍然可用：对 .pdf 文件，Read 内部会 fallback 到 DocPreview 的轻量摘要，**但信息有限**；需要精准分析就用 `PdfInspect`。

---

## 1. 第一步：永远先 `PdfInspect(summary)`

不知道 PDF 长啥样时，**不要**马上 `text` / `form-fields`，先 summary 一次拿到全貌：

```
PdfInspect { action: "summary", filePath: "…" }
```

返回的 `textType` 三大分支决定你下一步走哪条路：

| textType | 含义 | 下一步 |
|---|---|---|
| `extractable` | 文字流正常，可直接抽取 | `PdfInspect(text)` 或 `tables` |
| `scanned` | 页面是图片，无文字流 | `PdfInspect(render)` → `CloudImageUnderstand` 做 OCR |
| `cid-encoded` | 字符用 CID 编码（extraction 会得到乱码） | 同 `scanned` 走 OCR |
| `empty` | 无文字无图（罕见，多半文件损坏） | 告知用户，停止 |

summary 里还会返回 `suggestedNextTool` —— 直接按它推荐的继续。例子：

```
suggestedNextTool: {
  tool: 'CloudImageUnderstand',
  precedingAction: 'render',
  reason: 'PDF pages contain no extractable text stream...'
}
```

⚠️ **加密 PDF**：如果 summary 返回 `isEncrypted: true, needsPassword: true`，**必须**拿到用户密码后用 `password` 参数重新 summary；否则所有后续 action 都会返回 `error: 'PDF_ENCRYPTED'`。

---

## 2. 读文本 / 表格 / 图片

### 2.1 `PdfInspect(text)` — 默认抽文字

```
PdfInspect { action: "text", filePath: "…", pageRange: "1-20" }
```

- **大 PDF 必须分段**：`pageRange` 每次 ≤ 20 页。
- 需要坐标做定位时加 `withCoords: true`，会返回每个文本 item 的 `{ x, y, width, height }`。
- 坐标系：**PDF points，原点左下角**。A4 约 595 × 842 pt。

### 2.2 `PdfInspect(tables)` — 结构化表格

目前是简化算法（`heuristic: 'simple-grid'`），复杂表可能抽不全。抽不到时 fallback 到 `text` 或让用户明确列出。

### 2.3 `PdfInspect(images)` — 嵌入图片清单

默认只返回元数据（`page / indexInPage / width / height`）。要拿到可引用的 PNG URL，加 `extractImages: true`，图片会被写到当前 session 的 asset 目录。

### 2.4 `PdfInspect(annotations)` — 注释

Highlight / Text / FreeText / Stamp / Link 等都能抽到 `subtype / rect / contents / url`。

---

## 3. 填表单 — 两条路径，必须先探测

### 3.1 AcroForm（真正的 PDF 表单）

**3 步工作流：**

```
Step 1  PdfInspect { action: "form-fields", filePath: "…", withRender: true }
        → 返回 fields[] + 每页渲染 PNG（模型肉眼对照字段位置）

Step 2  模型根据用户意图构造 { 字段名: 值 } 映射
        · checkbox: 必须用 fields[i].checkedValue（如 "Yes" / "On"），不要猜 "true" / "yes"
        · radio:    必须用 fields[i].radioOptions[j].value
        · dropdown: 必须用 fields[i].choiceOptions[j].value

Step 3  PdfMutate { action: "fill-form", filePath: "…", fields: { … } }
        → 返回 { filledCount, skippedFields: [...] }
        skippedFields 非空代表有拼写错 / 大小写错，对照 Step 1 的字段清单修正后重试。
```

### 3.2 非 AcroForm（静态表格 / 扫描件视觉表）

**优先用 `fill-visual`**（会做 bbox 校验 + 自动坐标系转换），`add-text` 仅用于单点叠字。

```
Step 1  PdfInspect { action: "form-structure", filePath: "…", pageRange: "1-3", withRender: true }
        → 返回 labels / lines / checkboxes / rowBoundaries + 页面渲染 PNG

Step 2  模型从 labels 的 rect 推算每个"填写点"的 entryBoundingBox：
        · 文本框：x0 ≈ label.x1 + 5，y0..y1 基于附近 rowBoundaries / 横线
        · 复选框：直接用 checkboxes[i].rect

Step 3  PdfMutate { action: "fill-visual", filePath: "…",
                     visualFields: [{
                       page, entryBoundingBox: [x0,y0,x1,y1],
                       text, fontSize?, coordSystem?: 'pdf' | 'image'
                     }, ...] }

        · coordSystem='pdf' (默认)：bbox 用 PDF points，原点左下
        · coordSystem='image'：bbox 用像素，原点左上；必须同时传 imageWidth / imageHeight
          （rendered PNG 的尺寸），工具自动换算到 PDF 坐标
        · 返回错误 'BBOX_VALIDATION_FAILED' 时，errors 数组会明确说
          哪两个框重叠 / 哪个框太窄放不下文字；按提示修正后重试

备用：PdfMutate { action: "add-text", overlays: [...] } —— 用于单点叠字（盖章 / 水印 / 印章），坐标手填。
```

如果看不清，直接把 Step 1 返回的 renders 里的 PNG URL 当图片展示给模型看（OpenLoaf 支持多模态）。不要额外 crop —— 直接传整页图就够。

---

## 4. 扫描 PDF 的 OCR 工作流（4 步闭环）

```
Step 1  PdfInspect(summary) → textType: 'scanned'

Step 2  PdfInspect { action: "render", filePath: "…", pageRange: "1-12", scale: 2 }
        → 返回 pages: [{ page, url, width, height }, ...]
        一次 render 多页，scale=2 默认 ≈144 DPI，足够 OCR。

Step 3  对每一页 PNG 调用 CloudImageUnderstand
        （若用户 tier 允许并行，可同时发多个；否则顺序调用）

Step 4  汇总各页文本，必要时 Write 到 .md / .txt
```

⚠️ `CloudImageUnderstand` 会扣云端积分。对大 PDF 先 render **前 3 页**跑 OCR 给用户看一眼样本，得到确认后再跑全文。

---

## 5. 创建 PDF — `PdfMutate(create)`

```json
{
  "action": "create",
  "filePath": "${CURRENT_CHAT_DIR}/invoice.pdf",
  "content": [
    { "type": "heading", "text": "发票 #20260415", "level": 1 },
    { "type": "paragraph", "text": "收件方：ACME Corp", "bold": true },
    { "type": "table", "headers": ["品名", "数量", "单价"], "rows": [["Widget", "3", "¥30"]] },
    { "type": "paragraph", "text": "合计：¥30" }
  ]
}
```

支持 6 种块：`heading / paragraph / table / bullet-list / numbered-list / page-break`。

- **中文直接写**。检测到 CJK 字符会自动嵌入 Noto Sans SC。
- **不要用 Unicode 下标/上标字符**（₀₁₂ / ⁰¹²）。pdf-lib 的 WinAnsi 标准字体无此字形，会渲染成黑方块。化学式 `H₂O` 请写成 `H2O` 或拆两行；阶段 3 会加入 `{ runs: [{ text, super: true }] }` 的结构化支持。
- 段内目前不支持 bold/italic 混排（整段只能一种样式）。需要富文本排版请生成 DOCX 再 `DocConvert` 到 PDF。

---

## 6. 页级操作 — split / extract-pages / rotate / crop

### 6.0 split — 拆分

两种模式二选一：

```json
// 按组大小拆
{ "action": "split", "filePath": "big.pdf", "outputDir": "./parts", "groupSize": 10 }
// → parts: [ "big-part1.pdf" (1-10), "big-part2.pdf" (11-20), ... ]

// 按断点拆
{ "action": "split", "filePath": "big.pdf", "outputDir": "./parts", "splitAt": [4, 8] }
// → parts: [ "big-part1.pdf" (1-3), "big-part2.pdf" (4-7), "big-part3.pdf" (8-end) ]
```

### 6.0 extract-pages — 抽取复杂页范围

```json
{ "action": "extract-pages", "filePath": "big.pdf", "outputPath": "subset.pdf",
  "pageRanges": "1,3-5,8,10-end" }
```

qpdf 风格的 range 语法，支持单页 / 范围 / `end` 关键字 / 逗号组合。

### 6.0 rotate — 旋转页

```json
{ "action": "rotate", "filePath": "scan.pdf",
  "rotations": [{ "page": 1, "degrees": 90 }, { "page": 3, "degrees": -90 }] }
```

`degrees` 必须是 90 的倍数（支持负数）。角度是**累加到现有旋转**，不是重置。

### 6.0 crop — 裁剪可视区域

```json
{ "action": "crop", "filePath": "doc.pdf",
  "crops": [{ "page": 1, "mediaBox": [50, 50, 500, 700] }] }
```

`mediaBox: [x, y, width, height]` 用 PDF points，原点左下。裁剪只改可视区域，**不删除**原始内容（放大缩小仍可见）。

---

## 7. 合并 / 水印 / Redaction

### 7.1 合并 — `PdfMutate(merge)`

```json
{ "action": "merge", "filePath": "out.pdf", "sourcePaths": ["cover.pdf", "body.pdf"] }
```

按数组顺序拼接。`filePath` 与某个 source 同名会覆写，先和用户确认。

### 7.2 水印 — `PdfMutate(watermark)`

**文字水印**（对角、半透明）：

```json
{ "action": "watermark", "filePath": "report.pdf",
  "watermarkType": "text", "watermarkText": "CONFIDENTIAL",
  "watermarkFontSize": 60, "watermarkColor": "#FF0000",
  "watermarkOpacity": 0.25, "watermarkAngle": -30,
  "watermarkPageRange": "1-10" }
```

**PDF 水印**（用另一个 PDF 的某一页做水印）：

```json
{ "action": "watermark", "filePath": "report.pdf",
  "watermarkType": "pdf", "watermarkPdfPath": "logo.pdf",
  "watermarkPdfPage": 1, "watermarkOpacity": 0.3 }
```

### 7.3 单点叠字 / 机密章 — `PdfMutate(add-text)`

坐标系：**PDF points，原点左下**。y 越大越靠上。

```json
{ "action": "add-text", "filePath": "report.pdf",
  "overlays": [{ "page": 1, "x": 400, "y": 780, "text": "已审", "fontSize": 24, "color": "#FF0000" }] }
```

### 7.4 Redaction（视觉遮盖）

用 `add-text` 的 `background` 字段在文字下叠白底：

```json
{ "action": "add-text", "filePath": "doc.pdf",
  "overlays": [{ "page": 2, "x": 120, "y": 520, "text": "****", "fontSize": 12,
                 "background": { "color": "#FFFFFF", "padding": 2 } }] }
```

⚠️ **redaction 只是视觉遮盖，PDF 底层文本仍可被提取**。必须告知用户这一限制。

---

## 8. 加密 / 解密 / 优化

### 8.1 解密 — `PdfMutate(decrypt)`

```json
{ "action": "decrypt", "filePath": "locked.pdf", "outputPath": "unlocked.pdf", "password": "…" }
```

注：**加密写出不支持**（按设计）。如果用户要"给 PDF 加密码"，需要告知现阶段只能解密已有的加密文件。

### 8.2 优化 / 线性化 — `PdfMutate(optimize)`

```json
{ "action": "optimize", "filePath": "big.pdf", "outputPath": "small.pdf", "linearize": true }
```

- 默认 re-save 会做基础压缩
- `linearize: true` 生成 web-friendly 版本（禁用 object streams），供流式 PDF 阅读器使用

---

## 9. 格式转换 — `DocConvert`

```json
{ "filePath": "report.pdf", "outputPath": "report.docx", "outputFormat": "docx" }
```

- `pdf → docx` / `pdf → md` / `pdf → html`：**都是文本级转换，复杂排版 / 图片位置会丢失或错位**。转换前告知用户。
- `docx → pdf` / `md → pdf` / `txt → pdf`：同样文本级、布局朴素。

---

## 10. 硬约束清单（踩坑指南）

1. **先 summary 再 action**：不要跳过 summary 直接 text/form-fields；否则撞加密 / 扫描件时白跑一次。
2. **加密 PDF 必带 password**：检查 `summary.isEncrypted`，没密码就让用户提供。
3. **大 PDF 分段读**：`pageRange` 每次 ≤ 20 页。
4. **AcroForm 值一定用清单里的**：checkbox 用 `checkedValue`，radio 用 `radioOptions[i].value`，不能猜 "true"/"yes"。
5. **Unicode 上下标 = 黑方块**：`create` 时用 ASCII 替代。
6. **redaction 不是真删**：底层文本可提取。
7. **`add-text` 坐标原点左下角**：y 越大越靠上。
8. **OCR 会扣积分**：`CloudImageUnderstand` 是云端收费 API，大 PDF 先采样确认再跑全文。
9. **PDF 渲染 asset 路径是 session 级**：`PdfInspect(render)` 的 PNG 落在当前对话的 asset 目录，**下一轮对话不存在**。
10. **CJK 可直接创建**：Noto Sans SC 自动加载，不要把中文先转 pinyin 再生成。
