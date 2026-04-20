---
name: pdf-skill
description: >
  PDF 读/写/转/OCR 一体化。触发场景：总结 PDF、读文本或表格、填 AcroForm 表单、渲染页面为图、合并/拆分/水印/旋转/加密、创建新 PDF（发票/报告）、PDF ↔ docx/md/txt 互转。典型说法：“总结这份 PDF”、“填一下这个 PDF 表单”、“把几个 PDF 合一起”、“PDF 加水印”、“PDF 转 Word”、“扫描件 OCR”、“看看 PDF 第 3 页长什么样”。用户提到 .pdf 文件、要产出 PDF、或要对 PDF 做任何改动都加载本技能。
---

# PDF 技能

读用 `PdfInspect`；**写 / 改 / 创建一律用 `JsSandbox`** 跑 Node 脚本调用 `pdf-lib` / `pdfkit` / `pdf-parse` 等预装库；格式互转用 `DocConvert`；扫描件走 `CloudImageUnderstand`。

## 工具清单

| 工具 | 做什么 | 只读 |
|------|------|------|
| `PdfInspect` | 读：summary / text / tables / form-fields / form-structure / images / annotations / render | 是 |
| `JsSandbox` | **所有写操作**：创建新 PDF、合并、水印、旋转、填表、加密…… 用 `pdf-lib` / `pdfkit` 代码实现 | 否 |
| `DocConvert` | 格式互转：pdf ↔ docx / html / md / txt / xlsx | 否 |
| `CloudImageUnderstand` | 扫描 PDF 的 OCR 入口（云端，会扣积分） | 否 |

> **加载（两步，缺一不可）**：
> 1. `LoadSkill pdf-skill` —— 仅把本技能文档拉进上下文。
> 2. `ToolSearch(query: "select:PdfInspect,JsSandbox,DocConvert")` —— 激活工具 schema。
>
> `Read` 对 .pdf 只走轻量摘要；**任何分析/总结/填/改/转/OCR PDF 都走 `PdfInspect` + `JsSandbox`**。

---

## 1. 读：`PdfInspect` 是唯一入口

不知道 PDF 长啥样先 `summary`：

```
PdfInspect { action: "summary", filePath: "…" }
```

返回 `pageCount / fileSize / characterCount / hasForm / encryption / textType`，按 `textType`：

| textType | 下一步 |
|---|---|
| `extractable` | `PdfInspect(text)` 直接取全文 |
| `scanned` / `cid-encoded` | `PdfInspect(render, pageRange)` → 再调 `CloudImageUnderstand` 对每张 PNG OCR |
| `isEncrypted: true` | 走下面 JsSandbox `pdf-lib` 解密，或 `PdfInspect(password)` |

**大 PDF 必传 `pageRange`**（如 "1-5"），否则触发截断。

AcroForm 表单：`PdfInspect(form-fields)` 拿 `checkedValue / radioOptions` 再填。

---

## 2. 写：`JsSandbox` + `pdf-lib` / `pdfkit`

**首选 `pdf-lib`**（编辑已有 PDF / 合并 / 水印 / 旋转 / 填表 / 解密）；
**从零生成复杂布局**用 `pdfkit`（矢量 + 文字 + 图）。

### 2.1 Demo：创建一份中文发票 PDF（`pdfkit`）

```js
import PDFDocument from 'pdfkit'
import fs from 'node:fs'

const doc = new PDFDocument({ size: 'A4', margin: 48 })
doc.pipe(fs.createWriteStream('invoice.pdf'))

doc.fontSize(22).text('INVOICE', { align: 'right' })
doc.moveDown()
doc.fontSize(10).text('Acme Corp', { align: 'right' })
doc.text('Invoice #2026-042   Date: 2026-04-20', { align: 'right' })
doc.moveDown()

// 简易表格
const rows = [
  ['Widget', 1, 50.00],
  ['Gadget', 2, 30.00],
]
doc.fontSize(12).text('Description     Qty     Unit     Total')
doc.moveTo(48, doc.y).lineTo(547, doc.y).stroke()
let total = 0
for (const [name, qty, unit] of rows) {
  const line = qty * unit
  total += line
  doc.text(`${name.padEnd(14)} ${qty}       $${unit.toFixed(2)}   $${line.toFixed(2)}`)
}
doc.moveDown().fontSize(14).text(`Total: $${total.toFixed(2)}`, { align: 'right' })

doc.end()
await new Promise(r => doc.on('end', r))
console.log('invoice.pdf written')
```

> **CJK 提示**：pdfkit 默认字体不含中文字形。若要出中文，先用 `doc.registerFont('cn', '/path/to/NotoSansCJK.ttf')` 再 `doc.font('cn')`。系统 fallback 字体不保证覆盖。

### 2.2 Demo：给已有 PDF 加 `CONFIDENTIAL` 水印（`pdf-lib`）

```js
import { PDFDocument, rgb, degrees, StandardFonts } from 'pdf-lib'
import fs from 'node:fs/promises'

const src = await fs.readFile(process.argv[2] ?? 'input.pdf')
const pdf = await PDFDocument.load(src)
const font = await pdf.embedFont(StandardFonts.HelveticaBold)

for (const page of pdf.getPages()) {
  const { width, height } = page.getSize()
  page.drawText('CONFIDENTIAL', {
    x: width / 2 - 140,
    y: height / 2,
    size: 64,
    font,
    color: rgb(0.9, 0.1, 0.1),
    opacity: 0.25,
    rotate: degrees(-30),
  })
}

const out = await pdf.save()
await fs.writeFile('watermarked.pdf', out)
console.log(`watermarked ${pdf.getPageCount()} pages`)
```

### 2.3 Demo：合并 PDF（`pdf-lib`）

```js
import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs/promises'

const merged = await PDFDocument.create()
for (const p of ['a.pdf', 'b.pdf', 'c.pdf']) {
  const src = await PDFDocument.load(await fs.readFile(p))
  const pages = await merged.copyPages(src, src.getPageIndices())
  pages.forEach(pg => merged.addPage(pg))
}
await fs.writeFile('merged.pdf', await merged.save())
console.log(`merged → ${merged.getPageCount()} pages`)
```

### 2.4 Demo：填 AcroForm 表单（先 `PdfInspect(form-fields)` 拿 `checkedValue`）

```js
import { PDFDocument } from 'pdf-lib'
import fs from 'node:fs/promises'

const pdf = await PDFDocument.load(await fs.readFile('form.pdf'))
const form = pdf.getForm()
form.getTextField('full_name').setText('张三')
form.getCheckBox('agree').check()          // 若 PdfInspect 给出 checkedValue='Y'，用 setValue('Y')
form.getRadioGroup('gender').select('M')
// form.flatten() // 想锁表单就 flatten
await fs.writeFile('filled.pdf', await pdf.save())
console.log('form filled')
```

### 2.5 Demo：解密 / 旋转 / 抽页

```js
// 解密
import { PDFDocument } from 'pdf-lib'
const pdf = await PDFDocument.load(buf, { password: 'secret', ignoreEncryption: false })
await fs.writeFile('unlocked.pdf', await pdf.save())

// 旋转第 1 页 90°
pdf.getPage(0).setRotation(degrees(90))

// 抽出第 3、5 页到新 PDF
const out = await PDFDocument.create()
const [p3, p5] = await out.copyPages(pdf, [2, 4])
out.addPage(p3); out.addPage(p5)
```

---

## 3. OCR（扫描件）

```
PdfInspect(summary)              // textType == 'scanned'
PdfInspect(render, pageRange)    // 得到 [<asset>/render-p1.png, ...]
CloudImageUnderstand(image=<上面每张 png>, question='精确识别并提取中文文字')
```

---

## 4. 格式互转

```
DocConvert(from="pdf", to="docx", sourcePath="…")   # PDF → Word 编辑
DocConvert(from="docx", to="pdf", sourcePath="…")   # Word → PDF 分发
```

`DocConvert` 比 `JsSandbox + pdf-lib` 快且排版忠实；**互转优先它**。

---

## 5. 常见错误兜底

| 症状 | 原因 | 处理 |
|---|---|---|
| `pdfkit` 中文乱码 / 方块 | 默认字体不含 CJK 字形 | 先 `registerFont('cn', '/path/to/NotoSansCJK.ttf')` |
| `pdf-lib` 加载报 `EncryptedPDFError` | 文件加密 | `PDFDocument.load(buf, { password: '…' })` |
| 水印覆盖不均 | PDF 页面大小不同 | 循环 `page.getSize()` 按页算 x/y |
| 合并后字体变样 | 原 PDF 嵌字体不完整 | 用 `pdf-lib` 的 `useObjectStreams: false` 重写 |
| `TypeError: Cannot read properties of undefined (reading 'save')` | `pdfkit` 没有 `doc.save()` / `doc.restore()`（那是 Canvas 2D API） | 颜色/字号状态直接用 `doc.fillColor()` / `doc.fontSize()` 切换即可，不需要保存-恢复栈。最终文档落盘用 `doc.pipe(fs.createWriteStream(...)); doc.end()` |

修脚本：`JsSandbox(action="edit-and-run", scriptPath=<上次的>, edits=[{find,replace}])` 只传改动点。
