---
name: docx-skill
description: >
  Word 文档（.docx）读/写/转/评审一体化。触发场景：总结 docx、读段落/大纲/表格/图片/评论/修订、替换正文、插入图片、改页面设置、重建目录、加评论或回复、加修订（insert/delete/replace）、接受/驳回修订、docx ↔ pdf/html/md/txt 互转。典型说法："帮我总结这份 Word"、"第二段改成 XXX"、"把全部'A 公司'换成'B 公司'"、"加一条修订批注"、"接受所有修订"、"docx 转 pdf"、"从这些要点生成销售报告"。用户提到 .docx / .doc 文件或以 Word 文档为产出目标都加载本技能。
---

# DOCX 技能

读用 `WordInspect`；**写 / 改 / 创建用 `JsSandbox`** 跑 Node 脚本（库首选 `docx`）；格式互转用 `DocConvert`。

## 工具清单

| 工具 | 做什么 | 只读 |
|------|------|------|
| `WordInspect` | 读：summary / outline / text / tables / images / comments / tracked-changes / xml / render | 是 |
| `JsSandbox` | **所有写**：create / replace-text / add-image / comment / resolve-changes …… 用 `docx` 库 + `adm-zip` 代码实现 | 否 |
| `DocConvert` | docx ↔ pdf / html / md / txt | 否 |
| `CloudImageUnderstand` | 扫描件 docx 的 OCR 入口 | 否 |

> **加载（两步）**：
> 1. `LoadSkill docx-skill`
> 2. `ToolSearch(query: "select:WordInspect,JsSandbox,DocConvert")`
>
> `Read` / `DocPreview` 对 .docx 只返回 Markdown 级正文（丢 rPr / pPr / 表格合并 / 修订 / 评论）；**任何"分析/总结/改/建/评审 Word"都走 `WordInspect` + `JsSandbox`**。

---

## 1. 读：`WordInspect(summary)` 先行

```
WordInspect { action: "summary", filePath: "…" }
```

返回 `pageCount / wordCount / headingCount / hasTrackedChanges / hasComments / isProtected / availableStyles`，按分派：

| 特征 | 下一步 |
|---|---|
| `isProtected: true` | 写操作不支持，先 `DocConvert` 生成未保护副本 |
| `hasTrackedChanges` | `WordInspect(tracked-changes)` → 用下面 2.4 的脚本 resolve |
| `hasComments` | `WordInspect(comments)` 拿 parent/reply 树 |
| `wordCount === 0 && pageCount >= 1` | 可能扫描件，`WordInspect(render)` + `CloudImageUnderstand` |

---

## 2. 写：`JsSandbox` + `docx`

用 [**docx** npm 包](https://docx.js.org)（flumens/docx），编程式构建 docx OOXML。对样式 / 修订 / 评论覆盖最全。

### 2.1 Demo：生成中文会议纪要

```js
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, PageOrientation,
} from 'docx'
import fs from 'node:fs/promises'

const title = new Paragraph({
  heading: HeadingLevel.HEADING_1,
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: 'Q2 产品规划讨论 — 会议纪要', bold: true, size: 36 })],
})

const meta = new Paragraph({
  children: [new TextRun({ text: '日期：2026-04-20   参会：张三 / 李四 / 王五', size: 22 })],
})

const decisions = [
  ['张三', 'Q2 功能排期', '2026-05-10'],
  ['李四', 'API 文档', '2026-04-30'],
]
const tbl = new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  rows: [
    new TableRow({
      tableHeader: true,
      children: ['负责人', '事项', '截止日'].map(
        t => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: t, bold: true })] })],
        }),
      ),
    }),
    ...decisions.map(row => new TableRow({
      children: row.map(v => new TableCell({ children: [new Paragraph(v)] })),
    })),
  ],
})

const doc = new Document({
  creator: 'OpenLoaf',
  styles: {
    default: {
      document: { run: { font: 'Microsoft YaHei' } }, // CJK 必设
    },
  },
  sections: [{
    properties: { page: { orientation: PageOrientation.PORTRAIT } },
    children: [title, meta, new Paragraph({ text: '' }), tbl],
  }],
})

await fs.writeFile('meeting_notes.docx', await Packer.toBuffer(doc))
console.log('meeting_notes.docx written')
```

> **CJK 字体**：必设 `styles.default.document.run.font` = `'Microsoft YaHei'` / `'SimSun'` / `'Noto Sans CJK SC'`，否则 Word 里可能显示 □。

### 2.2 Demo：替换文字（simple find-replace）

docx 里 `{{placeholder}}` 可能被 Word 切到多个 w:r run；先用 `WordInspect(xml)` 看结构。若占位符在单个 run 里：

```js
import AdmZip from 'adm-zip'
import fs from 'node:fs/promises'

const zip = new AdmZip(await fs.readFile('in.docx'))
let xml = zip.readAsText('word/document.xml')
xml = xml
  .replace(/\{\{date\}\}/g, '2026-04-20')
  .replace(/\{\{name\}\}/g, '张三')
zip.updateFile('word/document.xml', Buffer.from(xml, 'utf-8'))
await fs.writeFile('out.docx', zip.toBuffer())
console.log('replaced')
```

多 run 切分时，一次性 `new Document({...})` 重写更可靠。

### 2.3 Demo：插图 + 页眉 logo

```js
import {
  Document, Packer, Paragraph, ImageRun, Header, AlignmentType,
} from 'docx'
import fs from 'node:fs/promises'

const logo = await fs.readFile('logo.png')

const doc = new Document({
  sections: [{
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new ImageRun({
            data: logo,
            transformation: { width: 80, height: 24 },
          })],
        })],
      }),
    },
    children: [
      new Paragraph({ text: '报告正文...' }),
      new Paragraph({
        children: [new ImageRun({
          data: await fs.readFile('chart.png'),
          transformation: { width: 500, height: 300 },
        })],
      }),
    ],
  }],
})
await fs.writeFile('report.docx', await Packer.toBuffer(doc))
```

### 2.4 Demo：接受所有 tracked changes

没有直接 API，用 `adm-zip` 改 `document.xml`：

```js
import AdmZip from 'adm-zip'
import fs from 'node:fs/promises'

const zip = new AdmZip(await fs.readFile('in.docx'))
let xml = zip.readAsText('word/document.xml')
// 1) 接受所有 w:ins（保留内容，去掉标签）
xml = xml.replace(/<w:ins [^>]*>([\s\S]*?)<\/w:ins>/g, '$1')
// 2) 接受所有 w:del（删掉被删除的内容）
xml = xml.replace(/<w:del [^>]*>[\s\S]*?<\/w:del>/g, '')
zip.updateFile('word/document.xml', Buffer.from(xml, 'utf-8'))
await fs.writeFile('out.docx', zip.toBuffer())
console.log('tracked changes accepted')
```

---

## 3. 格式互转用 `DocConvert`

```
DocConvert(from="docx", to="pdf",  sourcePath="…")
DocConvert(from="docx", to="md",   sourcePath="…")
DocConvert(from="docx", to="html", sourcePath="…")
```

底层 LibreOffice headless，排版保真度优于手搓。

---

## 4. 常见陷阱

| 症状 | 原因 | 处理 |
|---|---|---|
| 中文变方块 | 未设 CJK 字体 | `styles.default.document.run.font = 'Microsoft YaHei'` |
| find-replace 失效 | 占位符切到多个 run | `WordInspect(xml)` 看结构，或 `docx` 重写 |
| `ImageRun` 图片变形 | 未给 transformation.width/height | 必传像素尺寸 |
| docx 打开提示"修复文档" | XML 不合法 / 手搓 XML | 用 `docx` 包生成别手改 OOXML |

修脚本：`JsSandbox(action="edit-and-run", scriptPath=<上次返回的>, edits=[{find,replace}])` 只传改动点。
