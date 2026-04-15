---
name: pptx-skill
description: >
  当用户要求对 PowerPoint 幻灯片（.pptx）做任何操作时触发：总结 deck、提取每页要点、改标题或副标题、改正文或演讲者备注、插页 / 删页 / 换页、从零生成汇报 / 路演 / 培训 deck、把对话里讨论过的要点落成 PPT。典型说法："总结这份 PPT"、"这个 deck 在讲什么"、"把每页要点提出来"、"帮我做一份 Q4 汇报 PPT"、"改第 3 页标题"、"在 PPT 里加一页"、"把这些要点做成幻灯片"。用户提到 deck / slide / 幻灯片 / 汇报产出时都应加载本技能。
---

# PPTX (PowerPoint) 读取、预览与写入

本技能覆盖幻灯片的**三条路径**：

- **读取** — 用 `Read(file_path)` 或 `DocPreview` 拿到每页 Markdown 化内容
- **写入** — 用 `PptxMutate` 从零生成或 XPath 编辑已有 deck
- **转换** — 用 `DocConvert`（pptx→pdf 等）

## 触发条件

- **读取/总结**："总结这份 PPT"、"这个 deck 在讲什么"、"把每页要点提出来"
- **创建**：从零生成大纲、汇报、培训材料、路演 deck
- **编辑**：修改已有 `.pptx` 的标题、正文、备注或结构；新增/删除/替换页面内容

## 第零步：定位目标文件

用户说"编辑这个 PPT"时先确认文件：`pageContext` → `Glob **/*.pptx` → `AskUserQuestion`。

## 读取：Read 与 DocPreview

**默认先用预览扫一遍再决定是否全量读。**

| 场景 | 工具 |
|------|------|
| 快速看每页大纲 | `Read(file_path)` / `DocPreview { mode: 'preview' }` — 返回每页标题 + 正文摘要 |
| 需要完整每页文本 | `DocPreview { filePath, mode: 'full' }` |
| XPath 编辑前核对原始 XML | `Bash unzip -p file.pptx ppt/slides/slide1.xml` |

## 写入工具：`PptxMutate`

单一工具，两个 action：`create` 从零生成，`edit` 通过 XPath + XML 修改已有文件。`needsApproval: true`。

## 创建 PPT（`action: "create"`）

参数 `slides` 是一个数组，每个元素：

```ts
{
  title?: string        // 幻灯片标题
  textBlocks?: string[] // 正文文本块数组，每个元素一段内容
  notes?: string        // 演讲者备注，不显示在正文（适合放详细数据、补充说明、演讲提示词）
}
```

CJK 全面支持，可以直接写中文。

### 内容设计经验法则

- **幻灯片数量**：5-15 页为宜。少于 5 页内容太密，超过 20 页考虑拆分主题。
- **标题**：每页标题 ≤ 10 字，一眼能看懂。
- **textBlock**：每块 3-5 行、每行 15-20 字以内。超过这个量级听众看不过来。
- **notes 字段用途**：演讲者备注，不显示在正文。详细数据、补充解释、演讲提示词都放这里——正文保持简洁，细节留给 notes。
- **局限**：`create` 只支持文本和标题布局。需要复杂排版（图表、自定义形状、SmartArt）时，建议先 `create` 基础版，由用户在 PowerPoint 中手动调整。

**示例：4 页季度汇报**

```json
{
  "action": "create",
  "filePath": "/path/to/2026Q1_汇报.pptx",
  "slides": [
    {
      "title": "2026 Q1 业务汇报",
      "textBlocks": ["汇报人：张三", "日期：2026-04-15"],
      "notes": "开场问候，介绍今日议程"
    },
    {
      "title": "核心指标",
      "textBlocks": [
        "营收同比 +32%，达成目标 108%",
        "新增付费用户 1.2 万",
        "NPS 从 42 提升到 51"
      ],
      "notes": "重点强调 NPS 的提升来自客服响应优化：首响时间从 4h 降到 35 分钟，满意度随之拉升"
    },
    {
      "title": "下季度重点",
      "textBlocks": ["扩张东南亚市场", "上线企业版", "完成 B 轮融资"],
      "notes": "东南亚重点是印尼和越南；企业版核心卖点是 SSO 和审计日志"
    },
    {
      "title": "Q&A",
      "textBlocks": ["谢谢聆听"]
    }
  ]
}
```

## 编辑已有 PPT（`action: "edit"`）

PPTX 本质是一个 ZIP 包，常见内部结构：

```
ppt/presentation.xml            # 全局演示文稿索引，含 sldIdLst（决定页面顺序）
ppt/slides/slide1.xml           # 第 1 页正文 OOXML
ppt/slides/slide2.xml           # 第 2 页
ppt/slides/_rels/slide1.xml.rels # slide1 的引用关系（图片/超链接等）
ppt/media/image1.png            # 嵌入的媒体文件
```

### Step 1：用 `Bash unzip -p` 拉出目标 XML

`Read` / `DocPreview` 返回的是 Markdown，不是原始 XML。定位 XPath 必须：

```bash
unzip -p /path/to/deck.pptx ppt/slides/slide2.xml
# 需要时再看 presentation.xml / rels / layout
unzip -p /path/to/deck.pptx ppt/presentation.xml
unzip -p /path/to/deck.pptx ppt/slides/_rels/slide2.xml.rels
```

### Step 2：分析 XML 结构

PPTX 文本节点典型长这样：

```xml
<p:sp>
  <p:txBody>
    <a:p>
      <a:r>
        <a:rPr lang="zh-CN"/>
        <a:t>旧标题文字</a:t>
      </a:r>
    </a:p>
  </p:txBody>
</p:sp>
```

### Step 3：用 `PptxMutate { action: "edit", edits: [...] }` 下手

`edits` 每一项形如 `{ op, path, xpath, xml?, position? }`，op 为 `replace` / `insert` / `remove` / `write` / `delete`。

**示例：把第 2 页某段文字从"旧标题文字"改成"新标题文字"**

```json
{
  "action": "edit",
  "filePath": "/path/to/deck.pptx",
  "edits": [
    {
      "op": "replace",
      "path": "ppt/slides/slide2.xml",
      "xpath": "//a:t[text()='旧标题文字']",
      "xml": "<a:t xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\">新标题文字</a:t>"
    }
  ]
}
```

## 常见陷阱

1. **文本运行被拆分**：一行可见文字可能由多个 `<a:r>` 组成（格式/字体不同就会拆段），`//a:t[text()='完整一句']` 可能匹配不到。先 `unzip -p` 看清楚实际的 run 切分，或用 `contains()` 分段匹配。
2. **页面顺序不看文件名**：`slide5.xml` 不一定是第 5 页。真正的顺序由 `ppt/presentation.xml` 里的 `<p:sldIdLst>` 决定，调整页序要改这个列表，而不是重命名文件。
3. **媒体引用走 rels**：slide 里是 `r:embed="rId3"`，真实路径映射在 `ppt/slides/_rels/slideN.xml.rels` 里（例如 `rId3 → ../media/image2.png`）。替换图片需要同时更新 rels 条目，并把新图片以 `write` op 写入 `ppt/media/`。
4. **主题色与版式继承**：直接改 XML 后文字颜色可能显示不对——PPTX 颜色常来自 theme/master/layout 的继承链，本地 run 级别的 `<a:solidFill>` 才会覆盖主题色。
5. **Mutate 需要用户审批**：每次调用都会弹审批，批量编辑尽量合并到一次 `edits` 数组里。
6. **大面积重写请用 create**：改动超过整份 deck 30% 的内容时，生成一份全新的 `.pptx` 比打一堆 XPath 补丁可靠得多。XPath edit 适合精确小改动（改标题、换日期、补一行要点），不适合整页重排。

## 端到端工作流示例

### "把这些数据做成 PPT"

1. `DocPreview` 或 `Read` 读源数据（xlsx / docx / 对话里粘贴的结构化内容）
2. 分析并组织关键发现——每页 1 个核心观点
3. `PptxMutate { action: "create" }` 生成幻灯片，标题 ≤ 10 字，textBlock 控制在 3-5 行
4. 详细解释放 notes，演讲者对着 notes 讲

### "把第 3 页的数据更新一下"

1. `DocPreview { mode: 'preview' }` 确认第 3 页的当前内容
2. `Bash unzip -p deck.pptx ppt/slides/slide3.xml` 看 run 结构
3. `PptxMutate { action: "edit" }` 用 `replace` 精确改

## 铁律

1. **先定位文件**。
2. **编辑前先 `Bash unzip -p` 看原始 XML**，没有例外。
3. **小改 edit，大改 create**；30% 阈值经验值。
4. **一次调用合并所有 edits**，减少审批弹窗。
5. **create 会覆盖同名文件**，建议追加 `_v2` / `_edited` 后缀。
