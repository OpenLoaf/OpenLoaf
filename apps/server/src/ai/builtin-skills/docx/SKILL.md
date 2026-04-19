---
name: docx-skill
description: >
  Word 文档（.docx）读/写/转/评审一体化。触发场景：总结 docx、读段落 / 大纲 / 表格 / 图片 / 评论 / 修订、替换正文、插入图片、改页面设置、重建目录、加评论或回复、加修订（insert / delete / replace），以及接受/驳回修订、docx ↔ pdf/html/md/txt 互转。典型说法："帮我总结这份 Word"、"把第二段改成 XXX"、"这份合同里全部 'A 公司' 换成 'B 公司'"、"给第一段加一条修订批注"、"接受所有修订"、"docx 转 pdf"、"从这些要点生成销售报告"。用户提到 .docx / .doc 文件或以 Word 文档为产出目标都加载本技能。
---

# DOCX 技能

一共 4 个工具，按 **看 → 写 → 转 → OCR** 组织：

## 工具清单

| 工具 | 职责 | 只读 |
|------|------|------|
| `WordInspect` | **所有读操作**（9 action）：summary / outline / text / tables / images / comments / tracked-changes / xml / render | 是 |
| `WordMutate` | **所有写操作**（9 action）：create / replace-text / add-image / update-toc / set-page-settings / comment / add-tracked-change / resolve-changes / edit | 否 |
| `DocConvert` | 格式互转：docx ↔ pdf / html / md / txt | 否 |
| `CloudImageUnderstand` | 扫描型 docx 的 OCR 入口（云端，会扣积分） | 否 |

> **加载（两步，缺一不可）**：
> 1. `LoadSkill docx-skill` —— 仅把本技能文档（你正在读的这份 SKILL.md）拉进上下文，**此时工具 schema 还没加载，直接调用会 `InputValidationError`**。
> 2. `ToolSearch(query: "select:WordInspect,WordMutate,DocConvert")` —— 真正激活工具 schema，之后才能调用这三个工具。
>
> **🚨 完成 LoadSkill 后必须立即 ToolSearch**：LoadSkill 只把说明文档拉进来，**没有激活任何工具 schema**。如果你 LoadSkill 后直接开始写 markdown 答复、或者直接回复用户"已创建"——那是错误路径（文件根本没生成）。正确顺序永远是 LoadSkill → ToolSearch → 真正调用工具；三步缺一都算没干完。
>
> `CloudImageUnderstand` 由 `cloud-media-skill` 管理加载。`Read` / `DocPreview` 对 .docx 只返回 Markdown 级别正文（丢失 rPr / pPr / 表格合并 / 修订 / 评论），**任何 "分析 / 总结 / 改 / 创建 / 评审 .docx" 的需求一律走 `WordInspect` / `WordMutate`，不要靠 `Read` 交差**。

---

## 1. 第一步：永远先 `WordInspect(summary)`

不知道 .docx 长啥样时，**不要**马上 `text` / `replace-text`，先 summary 一次拿到全貌：

```
WordInspect { action: "summary", filePath: "…" }
```

返回包含：`pageCount / paragraphCount / wordCount / headingCount`、metadata、`hasTrackedChanges` / `hasComments` / `isProtected`、`availableStyles`（段落 + 字符样式清单），以及 `suggestedNextTool` 提示 —— 直接按它推荐的继续。常见分派：

| summary 特征 | 下一步 |
|---|---|
| `isProtected: true` | **停下**。写操作不支持受保护文档，告诉用户先用 DocConvert 生成未保护副本，或让其解除保护 |
| `hasTrackedChanges: true` | `WordInspect(tracked-changes)` 列出每条 w:ins / w:del；若用户要清理，再走 `WordMutate(resolve-changes)` |
| `hasComments: true` | `WordInspect(comments)` 拿到 parent/reply 树；回复某条时记下它的 `id` 做 parentId |
| `wordCount === 0 && pageCount >= 1` | 可能是扫描件嵌图；走 `WordInspect(render)` → `CloudImageUnderstand` |
| 其它 | `WordInspect(outline)` 看标题结构；或 `WordInspect(text)` 抽正文 |

⚠️ **不要**在 summary 之前调用任何 WordMutate action —— `availableStyles` 是校验 TOC / 段落 style 的源头，越过 summary 会撞 `TOC_STYLE_CONFLICT` / `UNKNOWN_STYLE_REFERENCE`。

---

## 2. 读：text / outline / tables / images / comments / tracked-changes / xml / render

### 2.1 `WordInspect(text)` — 抽正文

```
WordInspect { action: "text", filePath: "…", pageRange: "1-20" }
```

- **大文档必须分段**：`pageRange` 每次 **≤ 20 页**，否则直接抛 `PAGE_RANGE_TOO_LARGE`。
- 结果是 Markdown 风格纯文本（heading → `#`、list → `-`、table → pipe 语法）。底层走 mammoth + turndown；**拿不到 rPr / pPr / XPath**。
- 要做定位编辑（例如"把'项目 A'改成'项目 B'"），先用这个定位字符串，再交给 `replace-text`。

### 2.2 `WordInspect(outline)` — 标题树

返回 `{ level, text, paraIndex }[]`，来自 `<w:pStyle w:val="HeadingN"/>`。用来做长文档的手术点规划；配合 `update-toc` 后手动校验 TOC。

### 2.3 `WordInspect(tables)` — 结构化表格

尊重 `gridSpan` / `vMerge`，每个 cell 返回 `{ row, col, rowSpan, colSpan, text }`。抽不全时回退到 `text` 或让用户明确列出。

### 2.4 `WordInspect(images)` — 图片清单

默认只返回元数据（`mediaPath / width / height / embedRId`）。要拿到可引用的 PNG URL，加 `extractImages: true`，图片会被写到当前 session 的 asset 目录。

### 2.5 `WordInspect(comments)` — 评论线程

返回 `{ id, author, date, text, paraId, parentId? }[]`。`parentId` 非空的是 reply，父 comment 的 `id` 在它上面。回复某条评论时，把拿到的 `id` 作为 `WordMutate(comment)` 的 `parentId`。

### 2.6 `WordInspect(tracked-changes)` — 修订清单

返回 `{ id, type: 'insert' | 'delete', author, date, runText, paraIndex }[]`。`id` 对应 `<w:ins w:id="…"/>` 或 `<w:del w:id="…"/>` 的 OOXML id，供后续 `resolve-changes` 选择性接受 / 驳回（当前子集 id 未实装，只支持全量）。

### 2.7 `WordInspect(xml)` — 裸 OOXML

```
WordInspect { action: "xml", filePath: "…", partName: "word/document.xml" }
```

- 默认 `partName="word/document.xml"`；也可读 `word/comments.xml` / `word/styles.xml` / `word/header1.xml` 等。
- **调用 `WordMutate(edit)` 前必须先跑这个**，因为裸 XPath 编辑需要看到真实节点名和命名空间前缀。

### 2.8 `WordInspect(render)` — 渲染页

```
WordInspect { action: "render", filePath: "…", pageRange: "1-6", scale: 2 }
```

依赖 libreoffice headless（本机找不到 soffice 会抛 `LIBREOFFICE_UNAVAILABLE`）。链路：soffice → temp PDF → pdfium → sharp 光栅化。用于视觉校验版式 / TOC / 图片。

---

## 3. 创建新文档 — `WordMutate(create)`

```json
{
  "action": "create",
  "filePath": "report.docx",
  "documentSettings": {
    "page": { "size": "a4", "orientation": "portrait",
               "margins": { "top": 1440, "bottom": 1440, "left": 1440, "right": 1440 } },
    "defaultFont": { "family": "Calibri", "size": 22 },
    "footer": { "includePageNumber": true, "alignment": "center" }
  },
  "content": [
    { "type": "heading", "level": 1, "text": "2026 年 Q1 销售报告" },
    { "type": "paragraph", "runs": [
        { "text": "本季度收入为 " },
        { "text": "¥1,234,567", "bold": true, "color": "1F4E79" },
        { "text": "，同比增长 18%。" }
    ] },
    { "type": "toc", "minLevel": 1, "maxLevel": 3 },
    { "type": "table",
      "columnWidths": [3000, 4000, 3000],
      "headers": ["季度", "营收 (¥)", "环比"],
      "rows": [["Q1", "1,234,567", "+18%"], ["Q2", "—", "—"]]
    },
    { "type": "image", "source": "/tmp/chart.png", "widthPx": 500, "alt": "营收趋势图" },
    { "type": "page-break" },
    { "type": "heading", "level": 2, "text": "附录" },
    { "type": "bullet-list", "items": ["原始数据见附件 A", "方法论见附件 B"] }
  ]
}
```

**11 种 ContentItem**：`heading / paragraph / table / bullet-list / numbered-list / image / page-break / toc / footnote-ref / hyperlink`（以及 `paragraph` 配合 `runs` 数组实现富文本）。

**TextRun 的 11 个可选字段**（见 schema）：`bold / italic / underline / strike / superscript / subscript / font / size / color / highlight / style`。

### 3.1 顶层 `documentSettings`

- `page.size`：`a4 / letter / legal / a3 / a5 / b5 / tabloid`（默认 a4）
- `page.orientation`：`portrait / landscape`（landscape 时工具自动交换 pgSz 宽高）
- `page.margins.*`：twips（1440 = 1 英寸）
- `columns.count` + `space` + `separator`：多栏排版
- `defaultFont.family` + `size`（size 单位 half-points，22 = 11pt）
- `header` / `footer`：含 `runs` + `includePageNumber` + `alignment`

### 3.2 计量单位速查

| 项 | 单位 | 例 |
|---|---|---|
| 页边距 / 表格宽度 / 缩进 | twips（1/1440 英寸） | 1440 = 1 英寸 |
| 字号 | half-points | 22 = 11pt，28 = 14pt |
| 行距 / 段前段后 | twentieths of a point | 240 = 单倍 |
| 颜色 | hex RGB，无 `#` | `"FF0000"` 红 |
| 图片 `width` | EMU（1 英寸 = 914400） | 用 `widthPx` 代替，引擎自动换算 |

### 3.3 表格注意

- **列宽必须用 twips（DXA），不要百分比**：Google Docs / 某些版本 Word 对百分比宽度处理不一致，DXA 最稳。
- **单元格背景用 `shading: "FFFF00"`**，底层强制 `ShadingType.CLEAR`（若写成 SOLID 会出现黑底）。
- `cellPadding` 至少给 `left: 108, right: 108`，否则文字贴边难看。
- 合并：`merge.rowSpan >= 2` 的 cell 必须在后续行对应位置**留空 cell 占位**（`{}` 或 `""`），否则 gridSpan 错位。
- `columnWidths[i]` 应与每行 `cells[i].width` 一致，不一致时以 `columnWidths` 为准。

### 3.4 报告类文档的"开箱美观"

工具在 `create` 时**自动注入**以下合理默认（你只要不显式传就会生效；显式传了按你的走）：

| 字段 | 自动默认 | 何时自己覆盖 |
|---|---|---|
| `heading(level:1)` | 居中、深蓝 `1F4E79`、16pt | 做极简或纯黑白样式时显式设 `color`/`size` |
| `heading(level:2)` | 中蓝 `2E74B5`、14pt | 同上 |
| `table.cellPadding` | `{top:80, bottom:80, left:108, right:108}`（约 5pt/7.5pt） | 要紧凑数据表时显式传更小值 |
| `table.borders` | 浅灰 `D0D0D0` 全边框 + 内线 | 要突出边框用深色显式传 |
| `table.headers` shorthand | **自动升级为第 0 行 rich 表头**：深蓝 `2E5A88` 底 + 白字加粗 | 需要不同主色或无表头时用 `rows` 直接传表头行 / 不传 headers |
| `table` 宽度（无 `columnWidths` 时） | 撑满页面（100% page width） | 要窄表或定列宽时显式传 `columnWidths: [w1, w2, ...]` twips |
| 表格 cell 内 `run.size` | `20` 半点（10pt），比正文略小，适配 CJK 表格 | 数据量少/想要大字强调时 run 里显式传 `size: 22` 或更大 |

所以做**分析报告 / 方案书 / 周报**这种期待"专业感"的文档时：直接用 `headers: [...]` + 普通 `rows: [...]`，工具会把表头渲染成蓝底白字加粗，表身带 padding 和浅灰边；不用手动拼 `runs: [{bold:true, color:'FFFFFF'}]` + `shading: '2E5A88'`。

要**纯极简 / Markdown 风格**：给 `table.borders: { top: {style:'none'}, bottom: {style:'none'}, ... }`、`heading.color` 手动清空或换成 `'000000'`、不传 `headers`（自己在 rows 里写第一行）。

### 3.5 创建时的硬雷区

- **不要写 Unicode 上下标 / bullet 符号**（`₂` / `²` / `•` / `》`）—— 默认 WinAnsi / eastAsia 字体里这些字形要么缺失要么语义错。化学式 `H₂O` 写成 `H2O`，或一段用 `superscript: true`、一段 `subscript: true` 的三段 runs 拼。bullet 用 `bullet-list`，不要手写 `• xxx`。
- **CJK 不用手动注入字体**：内容里只要出现中日韩字符，引擎自动给 `<w:docDefaults>/<w:rPr>/<w:rFonts>` 注入 `w:eastAsia="PingFang SC"`（Windows 会 fallback 到 SimSun）。不要在每个 TextRun 里重复写 `font: "PingFang SC"`。
- **PageBreak 必须是块级**：用 `{ "type": "page-break" }`，不要在 paragraph 文本里手写 `\f` 或 `<w:br w:type="page"/>`。
- **TOC 的 heading 必须只用 HeadingLevel**：如果某段声明了 `style: "MyCustom"` 却又 `type: "heading"`，或者引用了 `availableStyles` 里不存在的 style id，工具会直接抛 `TOC_STYLE_CONFLICT` 拒绝写出。从 `WordInspect(summary).availableStyles` 拷 id 用。
- **单段 runs 要用 TextRun 数组**：同段混排 bold + plain 只能用 `{ "type": "paragraph", "runs": [{text:..., bold:true}, {text:...}] }`，不能在一条 paragraph 里 `bold: true` 然后期待部分文本加粗。

---

## 4. 编辑现有文档 — 优先 6 个高阶 action，`edit` 垫底

按优先级**从上到下**选：

### 4.1 `replace-text` — 字符串 / 正则查找替换（跨 w:r 合并）

```json
{ "action": "replace-text", "filePath": "…",
  "find": "A 公司", "replace": "B 公司", "matchCase": false }
```

- **跨 run 匹配**：Word 把一段文字拆成多个 `<w:r>`（输入法、autosave、样式切分触发）。这个 action 会把同一段、**同 rPr** 的相邻 run 先合并成一个字符串再匹配，替换后也用单一 run 写回并保留原 rPr。
- **跨段落不会匹配**：段落是硬边界，绝对不会跨 `<w:p>` 替换。
- `regex: true` + `find: "合同[编号]+\\d+"` + `replace: "合同编号 $1"`，支持 `$1` / `$2` 反向引用。
- `wholeWord: true` 自动套 `\b…\b`，只对拉丁词有效，CJK 无效。
- **不会误伤** drawing / fldChar / footnote / comment anchor 内部文字 —— 这些特殊 run 作为 cluster 硬边界。

### 4.2 `add-image` — 插入图片到锚点

```json
{ "action": "add-image", "filePath": "…",
  "imageSource": "/tmp/chart.png",
  "imageWidthPx": 500,
  "imageAlt": "营收趋势图",
  "anchor": { "position": "end" } }
```

- `imageSource` 支持本地路径或 http(s) URL（会下载）。
- `anchor.position: "end"` 追加到正文末尾（sectPr 之前）；指定 `anchor.xpath: "//w:p[42]"` + `anchor.position: "after"` 插到第 42 个段落之后。
- 自动做 4 件事：写 `word/media/imageN.ext`、注册 `[Content_Types].xml` 的 image 扩展 Default、在 `word/_rels/document.xml.rels` 分配 rId、在 document.xml 插入 `<w:drawing>` 段落。
- **必带 `imageAlt`**（WCAG 可访问性要求 `w:docPr descr`）。`imageHeightPx` 留空时按原图比例。

### 4.3 `set-page-settings` — 改页面 / 栏 / 方向（不动正文）

```json
{ "action": "set-page-settings", "filePath": "…",
  "pageSettings": { "size": "a4", "orientation": "landscape",
                     "margins": { "top": 720, "bottom": 720, "left": 1080, "right": 1080 } },
  "columns": { "count": 2, "space": 720, "separator": true } }
```

- 只改 `<w:sectPr>`，正文 byte-for-byte 不变。
- 只传 `pageSettings` 不传 `columns` 时，原文 `cols` 原样保留；要清栏需要显式传 `columns: { count: 1 }`。

### 4.4 `update-toc` — 重建目录字段

```json
{ "action": "update-toc", "filePath": "…" }
```

- 文档里已有 TOC 字段时，刷新页码；没有时在 `<w:body>` 开头插入标准 `fldChar begin/separate/end` + `TOC \o "1-3"`。
- **实际页码要靠 Word / libreoffice 打开时计算**（这是 OOXML 字段的本质）。如果下游需要立即拿到渲染版 TOC，用 `DocConvert` 转 PDF 或 `WordInspect(render)`。

### 4.5 `comment` — 加评论 / 回复

**新建 top-level 评论：**

```json
{ "action": "comment", "filePath": "…",
  "commentText": "这段的数据来源需要引用",
  "commentAuthor": "Reviewer",
  "anchor": { "xpath": "//w:p[5]", "position": "after" } }
```

**回复既有评论：**

```json
{ "action": "comment", "filePath": "…",
  "commentText": "已补引用 [^3]",
  "parentId": "0" }
```

- `parentId` 是 **既有 comment 的 id**（从 `WordInspect(comments)` 拿）。回复**不会**重新锚定正文，只在 `word/commentsExtended.xml` 里挂 `w15:paraIdParent` 指向父 comment 的 paraId。
- top-level 评论会写 5 个部件：`word/comments.xml` / `word/commentsExtended.xml` / `word/commentsIds.xml` / `word/people.xml` + `document.xml` 里的 `commentRangeStart/End + commentReference`。
- **anchor 限制**：`anchor.xpath` 必须指向 `w:p` 或 `w:p/w:r`（作为 w:r 的兄弟节点插 commentRange），**不能**是 `//w:r/w:t[1]` 这种 run 内路径，否则抛 `COMMENT_ANCHOR_INVALID`。

### 4.6 `add-tracked-change` — 加修订

**insert（插入）：**

```json
{ "action": "add-tracked-change", "filePath": "…",
  "changeType": "insert",
  "changeText": "本季度 ",
  "changeAuthor": "Editor",
  "anchor": { "xpath": "//w:p[3]/w:r[1]", "position": "before" } }
```

**delete（删除）：**

```json
{ "action": "add-tracked-change", "filePath": "…",
  "changeType": "delete",
  "changeText": "需要删除的原文（要精确匹配段内 plainText）",
  "changeAuthor": "Editor",
  "anchor": { "xpath": "//w:p[3]", "position": "before" } }
```

**replace（替换）：**

```json
{ "action": "add-tracked-change", "filePath": "…",
  "changeType": "replace",
  "changeText": "A 公司",
  "changeReplace": "B 公司",
  "changeAuthor": "Editor",
  "anchor": { "xpath": "//w:p[3]", "position": "before" } }
```

- insert 产出 `<w:ins w:author="…"><w:r><w:t>…</w:t></w:r></w:ins>`。
- delete 产出 `<w:del w:author="…"><w:r><w:delText>…</w:delText></w:r></w:del>` —— **注意是 `<w:delText>` 不是 `<w:t>`**（引擎自动转，你不用管）。
- **整段删除特例**：`changeText` 恰好等于目标段的全部 plain text 时，引擎会额外在该段 `<w:pPr><w:rPr>` 里注入 `<w:del/>`，否则 Word "接受修订"后会留下空段落。
- replace 产出相邻兄弟 `<w:del>…</w:del><w:ins>…</w:ins>`。

### 4.7 `resolve-changes` — 接受 / 驳回

```json
{ "action": "resolve-changes", "filePath": "…", "decision": "accept" }
```

- `decision: "accept"` → 删 `<w:del>` 块、剥 `<w:ins>` wrapper、清 `<w:pPr><w:rPr><w:del/>`。
- `decision: "reject"` → 删 `<w:ins>` 块、剥 `<w:del>` wrapper 并把 `<w:delText>` 还原为 `<w:t>`。
- `ids: ["id1", "id2"]` 目标化子集**当前未实装**，传了会被忽略走全量。要部分处理先告知用户这个限制，或者用 libreoffice GUI。
- 优先走 libreoffice headless（未来），当前纯 JS 字符串重写路径（D9/D10 测试保障）。

### 4.8 `edit` — 裸 XPath + OOXML op（兜底，99% 场景不要用）

```json
{ "action": "edit", "filePath": "…",
  "edits": [
    { "op": "replace", "xpath": "//w:p[5]//w:t[1]", "xml": "<w:t>新文本</w:t>" }
  ] }
```

**只有**上面 7 个高阶 action 都不匹配才用 `edit`。调用前**必须**先跑 `WordInspect(xml)` 看到真实节点名 + namespace（`w:` / `w14:` / `w15:` / `r:` 前缀因文档版本而异），手写 XML 必须保证 namespace 正确、自闭合标签闭合、属性转义 `&amp; < > "`。写得不对会被引擎的轻量语法校验拒掉。

---

## 5. 修订 + 评论工作流示例

**场景：对一份合同做逐条审核并产出带修订 / 批注的版本**

```
Step 1  WordInspect(summary)      → 确认未保护、拿 availableStyles
Step 2  WordInspect(outline)      → 定位要审的段（如 "4.2 付款条款"）
Step 3  WordInspect(text, pageRange:"4-8")  → 抽那几页正文
Step 4  模型逐段判断：
        · 要改就 WordMutate(add-tracked-change, changeType:"replace")
        · 要问就 WordMutate(comment, commentText:"为何 30 天而非 60 天")
        · 要删就 WordMutate(add-tracked-change, changeType:"delete")
Step 5  WordInspect(tracked-changes) + WordInspect(comments)  → 自检
Step 6  用户接受 / 驳回：WordMutate(resolve-changes, decision:"accept")
Step 7  可选 WordInspect(render, pageRange:"1-3")  → 视觉校对
```

把第 4 步的 anchor 放在**所改段的段首 `//w:p[N]/w:r[1]` + position:"before"**，这是最稳的 xpath 模式。CJK 文本可以靠 `findAnchorParagraph` 做子串匹配（内部实现用的），但需要你在 prompt 里明确唯一的检索字符串。

---

## 6. DOCX ↔ PDF / HTML / MD 互转 — `DocConvert`

```json
{ "filePath": "report.docx", "outputPath": "report.pdf", "outputFormat": "pdf" }
```

- `docx → pdf`：走 libreoffice headless，版式最接近原文。没装 libreoffice 会抛 `LIBREOFFICE_UNAVAILABLE`，告诉用户安装 `brew install libreoffice` / `apt-get install libreoffice-core`。
- `docx → html` / `docx → md`：mammoth + turndown，**图片会内联为 data URI，复杂排版 / 页面布局 / 图片位置会丢失**。提前告诉用户。
- `pdf → docx`：文本级转换，带图的 PDF 布局不可靠，**不要**用来做"改 PDF 里内容"的兜底方案。

---

## 7. 扫描型 .docx 的 OCR（嵌图无文字）

极少数情况下（比如把扫描件直接粘进 Word），.docx 正文是一堆 `<w:drawing>` 嵌图，`wordCount == 0`。链路：

```
Step 1  WordInspect(summary)    → wordCount=0, pageCount>=1
Step 2  WordInspect(images, extractImages:true) 或 WordInspect(render)
Step 3  CloudImageUnderstand    → 按页 OCR
Step 4  汇总 → WordMutate(create) 重建一份文字版 .docx
```

⚠️ `CloudImageUnderstand` 是云端收费接口，大文档先采样 2-3 页让用户确认质量再跑全文。

---

## 8. 硬约束清单（11 条踩坑指南）

1. **先 `WordInspect(summary)` 再任何 action**：跳过 summary 就读不到 `availableStyles` / `isProtected` / `hasTrackedChanges`，后续很容易撞 `TOC_STYLE_CONFLICT` / 写入失败 / 修订冲突。
2. **`edit` 前必须 `WordInspect(xml)`**：Markdown / text 看不到 OOXML 节点名和 namespace 前缀，裸 XPath 没这些会抓不到。
3. **创建时禁止 Unicode 上下标 / bullet 字符**：用 `TextRun.superscript: true / subscript: true`，bullet 用 `bullet-list`。`H₂O` 写 `H2O`，`•` 写 `bullet-list`。
4. **表格列宽必须 DXA（twips）不用百分比**：`columnWidths: [3000, 4000]`，单元格 `width` 与之对齐。百分比在 Google Docs 里表现不一致。
5. **单元格 shading 只有 CLEAR 模式**：直接传 `shading: "FFFF00"`，引擎强制 `ShadingType.CLEAR`。不要在 schema 外自己拼 SOLID，否则 Word 渲染成黑底。单元格记得给 `cellPadding`，否则文字贴边。
6. **删整段修订必须同时动 pPr**：`add-tracked-change changeType:"delete"` 时，如果 `changeText` 覆盖整段 plain text，引擎会在 `<w:pPr><w:rPr>` 里加 `<w:del/>`；否则"接受修订"后会留下空段落。这个工具自动处理了，但如果你走 `edit` 兜底要自己加。
7. **PageBreak 必须包在 Paragraph 块级里**：`{ "type": "page-break" }` 作为顶层 ContentItem，不要塞进 paragraph runs。
8. **Image 必带 `alt`**：WCAG 可访问性 + Word 读屏依赖。`create` 里 `{ type:"image", ..., alt:"…" }`，`add-image` 里 `imageAlt:"…"`。
9. **TOC 要求所有标题只用 HeadingLevel**：自定义 style 在 TOC 里会被忽略或抛 `TOC_STYLE_CONFLICT`。标题段一律 `type:"heading"` + `level:1..6`，不要 `type:"paragraph" + style:"Heading1"`。
10. **`edit` 是最末位兜底**：用户让你"改某段正文 / 插图 / 改页面 / 加评论 / 加修订"，先看 4.1-4.7 的 7 个 action 有没有能匹配的；只有当需求真的是"修改某个 OOXML 节点的属性或裸 XML"才走 `edit`，并且先 `WordInspect(xml)`。
11. **`create` 的 `filePath` 用裸文件名或相对路径**：`filePath: "meeting_notes.docx"` 或 `filePath: "reports/q1.docx"`，不要写 `/Users/.../OpenLoafData/xxx.docx` 这种全局根下的绝对路径——运行时会把它 resolve 到当前会话的 asset 目录 `<chat-history>/<sessionId>/asset/`（或有项目时的项目根），所以你**不需要**自己拼 `${CURRENT_CHAT_DIR}/` 前缀。写越界的绝对路径会直接抛 "filePath is outside the writable scope"。

---

## 9. 错误码速查

| 错误码 | 触发 | 解法 |
|---|---|---|
| `PAGE_RANGE_TOO_LARGE` | `text` / `render` 的 pageRange 跨度 > 20 | 拆成多段请求 |
| `LIBREOFFICE_UNAVAILABLE` | `render` / `DocConvert(pdf)` 本机无 soffice | 安装 libreoffice 或告知用户 |
| `TOC_STYLE_CONFLICT` | `create` 中标题引用了 `availableStyles` 外的样式 | 用 HeadingLevel 或从 availableStyles 挑一个 |
| `COMMENT_ANCHOR_INVALID` | `comment` / `add-tracked-change` 的 anchor.xpath 指向 `//w:r/w:t` 这种 run 内路径 | 改成 `//w:p[N]` 或 `//w:p[N]/w:r[K]` |
| `ENOENT` / `not a file` | filePath 文件不存在或路径越界 | 检查路径，必要时用 `resolveToolPath` 的 session 相对路径 |
| `InputValidationError` | `create` 缺 `content` / `edit` 缺 `edits` / schema 形状错 | 对照 schema 补齐字段 |
| `not yet implemented` | `edit` 未实装分支 | 改用 4.1-4.7 的高阶 action |

---

本技能对应工具的 schema 来源：`packages/api/src/types/tools/word.ts`。如果你观察到本文档和 schema 描述冲突，**以 schema 为准**，并告诉用户 SKILL.md 需要更新。
