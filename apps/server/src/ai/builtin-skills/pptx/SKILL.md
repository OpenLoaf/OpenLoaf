---
name: pptx-skill
description: >
  当用户要求对 PowerPoint 幻灯片（.pptx）做任何操作时触发：阅读、总结、提取、编辑、创建、格式转换均适用。核心认知：PPTX 是视觉结构化文件——图表、排版、示意图等内容靠纯文字抽取无法可靠还原。理解幻灯片内容的正确路径是：用 PptxInspect render 把目标页渲染成 PNG，再交给视觉模型（CloudImageUnderstand）理解，而不是仅靠 text/outline 文字提取。文字工具仅作补充上下文使用。典型说法："总结这份 PPT"、"这个 deck 在讲什么"、"第 3 页讲什么"、"描述第 5 页内容"、"帮我做一份 Q4 汇报 PPT"、"改第 3 页标题"。用户提到 .pptx 文件、deck、幻灯片、演示文稿时都加载本技能。
---

# PPTX 技能

读用 `PptxInspect`；**写 / 改 / 创建用 `JsSandbox`** 跑 Node 脚本（库首选 `pptxgenjs`）；格式互转用 `DocConvert`；看图 / OCR 用 `CloudImageUnderstand`。

## 工具清单

| 工具 | 做什么 | 只读 |
|------|------|------|
| `PptxInspect` | 读：summary / outline / text / notes / tables / shapes / images / xml / render | 是 |
| `JsSandbox` | **所有写**：create / edit / 从零生成；用 `pptxgenjs` 创建新 deck，用 `adm-zip` 改现有 XML | 否 |
| `DocConvert` | pptx ↔ pdf / html / md | 否 |
| `CloudImageUnderstand` | 渲染后的幻灯片 OCR / 图表理解 | 否 |

> **加载（两步）**：
> 1. `LoadSkill pptx-skill`
> 2. `ToolSearch(query: "select:PptxInspect,JsSandbox,DocConvert")`
>
> `Read` / `DocPreview` 对 .pptx 只返回 Markdown 级正文（丢形状坐标 / 备注 / 表格结构）；**任何"分析/总结/改/评审 PPT"都走 `PptxInspect` + `JsSandbox`**。

---

## 1. 读：`PptxInspect(summary)` 先行

```
PptxInspect { action: "summary", filePath: "…" }
```

返回 `slideCount / layoutCount / masterCount / hasNotes / hasCharts / hasSmartArt / creator / modifiedAt / fileSize`，并给出 `suggestedNextTool`，按特征分派：

| 特征 | 下一步 |
|---|---|
| 不知道 deck 形状 | `summary` → `outline` 扫标题 |
| 需要看幻灯片内容 | `text`（正文）/ `notes`（演讲者备注） |
| 需要定位异常 | `shapes` 拿形状树，再 `render` 可疑页 |
| 需要视觉验证 | `render`（slideNumbers 过滤） |
| 有嵌入图片要导出 | `images`（extractImages=true） |
| 需要改 XML 结构 | `xml`（partName 指定部件）|

### 1.1 render 说明

`render` 使用 **node-pptx-png**（skia-canvas，纯 Node），**不依赖 LibreOffice**。

已知局限：
- SmartArt、自定义 DrawingML 图表（非 OpenXML chart）、WMF/EMF 矢量底图可能失真
- 失真时 fallback → `DocConvert(from="pptx", to="pdf")` + `PdfInspect(render)` （走 LibreOffice 渲染链），或直接 `render` + `CloudImageUnderstand` 做 OCR

---

## 2. 写：`JsSandbox` + `pptxgenjs`

### 2.1 Demo：生成中文季度汇报 PPT

```js
import pptxgen from 'pptxgenjs'

const pres = new pptxgen()
pres.layout = 'LAYOUT_16x9'
pres.defineSlideMaster({
  title: 'MAIN',
  background: { color: 'FFFFFF' },
  objects: [
    { rect: { x: 0, y: 7.0, w: 13.33, h: 0.5, fill: { color: '1F3A8A' } } },
    { text: {
      text: 'OpenLoaf · 2026 Q1 业务回顾',
      options: { x: 0.5, y: 7.05, w: 12, h: 0.4, fontSize: 10, color: 'FFFFFF' },
    }},
  ],
})

// 封面
const s1 = pres.addSlide({ masterName: 'MAIN' })
s1.addText('2026 Q1 业务回顾', {
  x: 0.5, y: 2.2, w: 12.3, h: 1.5,
  fontSize: 44, bold: true, color: '1F3A8A',
  fontFace: 'Microsoft YaHei',          // CJK 必设
})
s1.addText('产品部 · 张三   2026-04-20', {
  x: 0.5, y: 4.0, w: 12.3, h: 0.6,
  fontSize: 18, color: '475569', fontFace: 'Microsoft YaHei',
})

// 核心指标
const s2 = pres.addSlide({ masterName: 'MAIN' })
s2.addText('核心指标', {
  x: 0.5, y: 0.4, w: 12.3, h: 0.8,
  fontSize: 28, bold: true, color: '1F3A8A', fontFace: 'Microsoft YaHei',
})
const kpis = [
  { label: '营收',   value: '+32%', color: '16A34A' },
  { label: '付费用户', value: '1.2 万', color: '2563EB' },
  { label: 'NPS',    value: '42 → 51', color: '9333EA' },
]
kpis.forEach((k, i) => {
  const x = 0.5 + i * 4.3
  s2.addShape(pres.ShapeType.roundRect, {
    x, y: 2.0, w: 4.0, h: 3.0, fill: { color: 'F1F5F9' }, line: { color: 'CBD5E1' },
  })
  s2.addText(k.value, {
    x, y: 2.4, w: 4.0, h: 1.0, align: 'center',
    fontSize: 40, bold: true, color: k.color, fontFace: 'Microsoft YaHei',
  })
  s2.addText(k.label, {
    x, y: 3.6, w: 4.0, h: 0.6, align: 'center',
    fontSize: 18, color: '475569', fontFace: 'Microsoft YaHei',
  })
})
s2.addNotes('Q1 三大核心指标均显著超预期。付费用户环比 +46%。')

// 带柱状图
const s3 = pres.addSlide({ masterName: 'MAIN' })
s3.addText('月度营收', {
  x: 0.5, y: 0.4, w: 12.3, h: 0.8,
  fontSize: 28, bold: true, color: '1F3A8A', fontFace: 'Microsoft YaHei',
})
s3.addChart(pres.ChartType.bar, [{
  name: '营收（万元）',
  labels: ['1月', '2月', '3月'],
  values: [820, 1050, 1340],
}], {
  x: 1.0, y: 1.5, w: 11.3, h: 5.5,
  showTitle: false, showLegend: true, showValue: true,
  catAxisLabelFontFace: 'Microsoft YaHei',
  valAxisLabelFontFace: 'Microsoft YaHei',
})

// 结尾 Q&A
const s4 = pres.addSlide({ masterName: 'MAIN' })
s4.addText('Q & A', {
  x: 0.5, y: 3.0, w: 12.3, h: 1.5, align: 'center',
  fontSize: 60, bold: true, color: '1F3A8A', fontFace: 'Microsoft YaHei',
})

await pres.writeFile({ fileName: 'q1_review.pptx' })
console.log('q1_review.pptx written')
```

> **关键点**：
> - `pptxgenjs` 的 API 签名全是 **对象形式**（`{x, y, w, h, fontSize, ...}`），不用拼 JSON 字符串。
> - **CJK 必给 `fontFace`**（如 `'Microsoft YaHei'` / `'Noto Sans CJK SC'`），否则默认英文字体渲染中文时可能被替换或字距异常。
> - `addChart` 原生支持 bar / line / pie / doughnut；如果模板要的是"图片感"图表，也可以用 `chartjs-node-canvas` 画 PNG 再 `addImage`。

### 2.2 Demo：基于数据做 N 页（每条数据一页）

```js
import pptxgen from 'pptxgenjs'

const items = [
  { title: '镜头 1：外观亮相', desc: '城市航拍开场 → V6 多角度路跑快切 → 驶入批发市场' },
  { title: '镜头 2：装载实力', desc: '店主迎接 → 开箱满载 → 后备箱 87% 开启率 1831mm' },
  { title: '镜头 3：超级底盘', desc: '离地间距 186mm + 座椅放倒装货 + 固定带锚点' },
]

const pres = new pptxgen()
pres.layout = 'LAYOUT_16x9'

const cover = pres.addSlide()
cover.addText('向上 V6 PV 分镜汇报', {
  x: 0.5, y: 2.8, w: 12.3, h: 1.3, align: 'center',
  fontSize: 40, bold: true, color: '0F172A', fontFace: 'Microsoft YaHei',
})

items.forEach((it, i) => {
  const s = pres.addSlide()
  s.addText(`${i + 1}. ${it.title}`, {
    x: 0.5, y: 0.5, w: 12.3, h: 0.8,
    fontSize: 26, bold: true, color: '1F3A8A', fontFace: 'Microsoft YaHei',
  })
  s.addText(it.desc, {
    x: 0.5, y: 1.7, w: 12.3, h: 3.5,
    fontSize: 20, color: '334155', fontFace: 'Microsoft YaHei',
    valign: 'top',
  })
})

await pres.writeFile({ fileName: 'storyboard.pptx' })
console.log(`storyboard.pptx — ${items.length + 1} slides`)
```

### 2.3 Demo：改已有 deck 第 N 页的标题

`pptxgenjs` 只做生成不读老文件。改老 deck → `adm-zip` 改 XML：

```js
import AdmZip from 'adm-zip'
import fs from 'node:fs/promises'

const zip = new AdmZip(await fs.readFile('deck.pptx'))
const target = 'ppt/slides/slide3.xml'
let xml = zip.readAsText(target)
// 简单替换第一个 a:t 文本
xml = xml.replace(/<a:t>[^<]*<\/a:t>/, '<a:t>新标题</a:t>')
zip.updateFile(target, Buffer.from(xml, 'utf-8'))
await fs.writeFile('deck.pptx', zip.toBuffer())
console.log('slide 3 title updated')
```

> 这是硬改 XML 的做法，遇到 run 被拆会失效。稳妥做法是整份 `pptxgenjs` 重新生成。

---

## 2.4 单页视觉识图（render → Read）

当用户问"第 N 页讲了什么" / "这页图表是什么数据" / "看看第 5 页排版" 等**需要视觉理解**的问题时：

**若当前模型具备原生图片输入能力（`native-inputs` 含 `image`）**：渲染后直接 `Read` 图片路径，系统自动将图片嵌入下一步的上下文中，模型可直接看到图片内容。

```
PptxInspect { action: "render", filePath: "…", slideNumbers: [5], scale: 1.5 }
  → result.data.pages[0].imagePath = "<asset_dir>/slide5-scale1.5.png"
Read { file_path: "<pages[0].imagePath>" }
  → 返回 <system-tag type="attachment" .../> 标签，下一步模型原生看到图片
（然后用自然语言描述图片内容即可）
```

**若当前模型不具备原生图片能力**：改用 `CloudImageUnderstand`（需 SkillLoad cloud-media-skill）：

```
CloudImageUnderstand { image: { path: "<pages[0].imagePath>" }, prompt: "请详细描述这页幻灯片：标题、正文要点、图表数据、排版布局" }
```

适用场景：
- SmartArt / 自定义图表 / WMF 矢量底图 —— 纯文本抽取（`text`）拿不到语义
- 用户要看"排版效果"或"这页长啥样"
- 含截图 / 示意图的培训 deck

批量识图（整份 deck 视觉总结）：`render` 不传 `slideNumbers` 拿全部 PNG，逐页 `Read` 或 `CloudImageUnderstand`。超过 20 页建议先 `outline` 给用户确认再渲染。

---

## 3. 格式互转

```
DocConvert(from="pptx", to="pdf", sourcePath="…")    // 给甲方分发 / LibreOffice 高保真渲染
DocConvert(from="pptx", to="md",  sourcePath="…")    // 提炼正文 / 做总结
```

---

## 4. 常见错误兜底

| 症状 | 原因 | 处理 |
|---|---|---|
| `PPT_LEGACY_FORMAT` | `.ppt` 二进制格式 | `DocConvert(from="ppt", to="pptx")` 先转换 |
| 中文显示方块 / 全变字母 | 未设 `fontFace` | 每个 addText / addChart 传 `fontFace: 'Microsoft YaHei'` |
| render 结果 SmartArt 变形 | node-pptx-png 不支持 SmartArt | fallback → `DocConvert(to="pdf")` + `PdfInspect(render)` |
| `writeFile` 产物打不开 | 路径穿越 / 权限 | 写相对路径就落到 cwd (session asset dir) |
| 生成几十页很慢 | 每页重复 addText | `defineSlideMaster` 把公共元素放 master，slide 里只放差异内容 |

修脚本：`JsSandbox(action="edit-and-run", scriptPath=…, edits=[…])` 少传 token。
