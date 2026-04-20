---
name: pptx-skill
description: >
  当用户要求对 PowerPoint 幻灯片（.pptx）做任何操作时触发：总结 deck、提取每页要点、改标题或副标题、改正文或演讲者备注、插页/删页/换页、从零生成汇报/路演/培训 deck、把讨论过的要点落成 PPT。典型说法："总结这份 PPT"、"这个 deck 在讲什么"、"把每页要点提出来"、"帮我做一份 Q4 汇报 PPT"、"改第 3 页标题"、"PPT 加一页"、"把这些要点做成幻灯片"。用户提到 deck / slide / 幻灯片 / 汇报产出时都加载本技能。
---

# PPTX 技能

**创建 PPT 用 `JsSandbox` + `pptxgenjs`**（API 最友好）；读 / 分析 deck 内容目前通过 `DocConvert(from="pptx", to="md")` → `Read` 看 markdown；格式互转用 `DocConvert`。

## 工具清单

| 工具 | 做什么 | 只读 |
|------|------|------|
| `JsSandbox` | **所有写 & 读**：创建 deck / 改页 / 插页，统一用 `pptxgenjs` 生成；要分析老 deck 就用 `adm-zip` + XML 解析 | 否 |
| `DocConvert` | pptx ↔ pdf / html；老 deck 转 md 再读 | 否 |

> **加载（两步）**：
> 1. `LoadSkill pptx-skill`
> 2. `ToolSearch(query: "select:JsSandbox,DocConvert")`

---

## 1. 读：先用 `DocConvert(pptx→md)` 看内容，再按需 JsSandbox 深挖

简单场景：

```
DocConvert(from="pptx", to="md", sourcePath="deck.pptx")  // 输出 deck.md
Read(file_path="<asset>/deck.md")                         // 正文 + 页边界
```

若需精确结构（形状坐标 / 主题色 / notes 演讲者备注）再跑 JsSandbox 解 XML：

```js
import AdmZip from 'adm-zip'
import fs from 'node:fs/promises'

const zip = new AdmZip(await fs.readFile('deck.pptx'))
const slides = zip.getEntries()
  .filter(e => e.entryName.startsWith('ppt/slides/slide'))
  .sort((a, b) => a.entryName.localeCompare(b.entryName))

for (const e of slides) {
  const xml = e.getData().toString('utf-8')
  const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1])
  console.log(`=== ${e.entryName} ===`)
  console.log(texts.join('\n'))
}
```

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

// 封面
const cover = pres.addSlide()
cover.addText('向上 V6 PV 分镜汇报', {
  x: 0.5, y: 2.8, w: 12.3, h: 1.3, align: 'center',
  fontSize: 40, bold: true, color: '0F172A', fontFace: 'Microsoft YaHei',
})

// 每个关键镜头一页
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

## 3. 格式互转

```
DocConvert(from="pptx", to="pdf", sourcePath="…")    // 给甲方分发
DocConvert(from="pptx", to="md",  sourcePath="…")    // 提炼正文 / 做总结
```

---

## 4. 常见陷阱

| 症状 | 原因 | 处理 |
|---|---|---|
| 中文显示方块 / 全变字母 | 未设 `fontFace` | 每个 addText / addChart 传 `fontFace: 'Microsoft YaHei'` |
| 图表轴标签英文 | `catAxisLabelFontFace` 未设 | 中英混排 chart 都要加这个 |
| `writeFile` 产物打不开 | 路径穿越 / 权限 | 写相对路径就落到 cwd (session asset dir) |
| 生成几十页很慢 | 每页重复 addText | `defineSlideMaster` 把公共元素放 master，slide 里只放差异内容 |

修脚本：`JsSandbox(action="edit-and-run", scriptPath=…, edits=[…])` 少传 token。
