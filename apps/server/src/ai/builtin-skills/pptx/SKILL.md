---
name: pptx-skill
description: >
  当用户要求对 PowerPoint 幻灯片（.pptx）做任何操作时触发：总结 deck、提取每页要点、改标题或副标题、改正文或演讲者备注、插页 / 删页 / 换页、从零生成汇报 / 路演 / 培训 deck、把对话里讨论过的要点落成 PPT。典型说法："总结这份 PPT"、"这个 deck 在讲什么"、"把每页要点提出来"、"帮我做一份 Q4 汇报 PPT"、"改第 3 页标题"、"在 PPT 里加一页"、"把这些要点做成幻灯片"。用户提到 deck / slide / 幻灯片 / 汇报产出时都应加载本技能。
---

# PowerPoint (PPTX) 技能

本技能涉及 4 个工具，按**读 → 写 → 转**组织：

| 工具 | 职责 | 只读 |
|------|------|------|
| `Read` | 读 PPTX 时的默认入口。返回每页标题 + 正文摘要 | 是 |
| `DocPreview` | 两种模式：`preview`（每页标题 + 摘要）/ `full`（完整每页文本） | 是 |
| `PptxMutate` | 唯一写入工具。2 个 action：`create` / `edit` | 否 |
| `DocConvert` | 格式互转：pptx → pdf 等 | 否 |

> **工具按需加载**：`DocPreview`、`PptxMutate`、`DocConvert` 调用前须先 `ToolSearch(names: "工具名")` 加载 schema。`Read` 始终可用。

---

## 1. 读取 PPTX

### 1.1 用 `Read` 快速了解

直接 `Read(file_path)` 即可。返回每页标题 + 正文摘要。适合快速了解 deck 内容。

### 1.2 用 `DocPreview` 做精细读取

| 参数 | 说明 |
|------|------|
| `mode: 'preview'` | 每页标题 + 正文摘要（默认值） |
| `mode: 'full'` | 完整展开每页所有文本 |

> **Read / DocPreview 返回的是 Markdown，不是 OOXML**。要做 XPath 编辑必须先 `Bash unzip -p file.pptx ppt/slides/slide1.xml` 查看原始 XML 结构。

---

## 2. PptxMutate — 写入 PPTX

通过 `action` 字段区分 2 种操作。`needsApproval: true`——调用后弹出审批对话框。

### 2.1 create — 从零创建

`slides` 是一个数组，每个元素：

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string? | 幻灯片标题 |
| `textBlocks` | string[]? | 正文文本块数组，每个元素一段 |
| `notes` | string? | 演讲者备注（不显示在正文，适合放详细数据和演讲提示） |

CJK 完全支持。

```json
{
  "action": "create",
  "filePath": "/work/2026Q1_汇报.pptx",
  "slides": [
    {
      "title": "2026 Q1 业务汇报",
      "textBlocks": ["汇报人：张三", "日期：2026-04-15"],
      "notes": "开场问候，介绍今日议程"
    },
    {
      "title": "核心指标",
      "textBlocks": ["营收同比 +32%", "新增付费用户 1.2 万", "NPS 从 42 提升到 51"],
      "notes": "NPS 提升来自客服响应优化：首响时间从 4h 降到 35min"
    },
    {
      "title": "下季度重点",
      "textBlocks": ["扩张东南亚市场", "上线企业版", "完成 B 轮融资"]
    },
    { "title": "Q&A", "textBlocks": ["谢谢聆听"] }
  ]
}
```

**内容设计经验**：
- 每页标题 ≤ 10 字，textBlock 每块 3-5 行、每行 ≤ 20 字
- 详细数据和补充解释放 `notes`，正文保持简洁
- `create` 只支持文本和标题布局，不支持图表/自定义形状/SmartArt

### 2.2 edit — 修改已有文件

PPTX 本质是 ZIP 包。关键内部路径：

| ZIP 路径 | 内容 |
|---------|------|
| `ppt/slides/slide1.xml` | 第 1 页正文 OOXML |
| `ppt/presentation.xml` | 全局索引，含 `sldIdLst`（决定页面顺序） |
| `ppt/slides/_rels/slide1.xml.rels` | slide1 的引用关系（图片/超链接） |
| `ppt/media/image1.png` | 嵌入的媒体文件 |

**编辑前必须先看原始 XML**：
```bash
unzip -p /work/deck.pptx ppt/slides/slide2.xml
```

`edits` 数组，每个元素：

| op | 用途 | 必填字段 |
|----|------|---------|
| `replace` | 替换 xpath 命中的节点 | `path`, `xpath`, `xml` |
| `insert` | 在 xpath 节点前/后插入 | `path`, `xpath`, `xml`, `position`（`before`/`after`） |
| `remove` | 删除 xpath 命中的节点 | `path`, `xpath` |
| `write` | 向 ZIP 写入新文件（如图片） | `path`, `source`（文件路径或 URL） |
| `delete` | 删除 ZIP 内某个文件 | `path` |

替换文字示例：
```json
{
  "action": "edit",
  "filePath": "/work/deck.pptx",
  "edits": [{
    "op": "replace",
    "path": "ppt/slides/slide2.xml",
    "xpath": "//a:t[text()='旧标题']",
    "xml": "<a:t xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\">新标题</a:t>"
  }]
}
```

PPTX 文本节点结构：`p:sp → p:txBody → a:p → a:r → a:t`。命名空间 `a:` = `http://schemas.openxmlformats.org/drawingml/2006/main`。

---

## 3. DocConvert — 格式转换

```json
{ "filePath": "/work/deck.pptx", "outputPath": "/work/deck.pdf", "outputFormat": "pdf" }
```

支持的 outputFormat：`pdf`, `docx`, `html`, `md`, `txt`, `csv`, `xls`, `xlsx`, `json`

---

## 4. 关键约束

1. **编辑前必须 `unzip -p` 看 XML**。Read/DocPreview 返回的 Markdown 看不到真实节点结构，盲写 XPath = 静默无效。
2. **文本运行可能被拆分**。一行可见文字可能由多个 `<a:r>` 组成（字体/格式不同就拆段），`//a:t[text()='完整一句']` 可能匹配不到。先看 XML 确认 run 切分，或用 `contains()` 分段匹配。
3. **页面顺序不看文件名**。`slide5.xml` 不一定是第 5 页。真正顺序由 `ppt/presentation.xml` 里的 `<p:sldIdLst>` 决定。
4. **媒体引用走 rels**。slide 里的 `r:embed="rId3"` 映射在 `_rels/slideN.xml.rels` 里。替换图片需同时更新 rels 条目并用 `write` op 写入新文件。
5. **大改用 create，小改用 edit**。改动超过 30% 内容时直接重新 create 比打 XPath 补丁可靠。
6. **一次调用合并所有 edits**。减少审批弹窗和中间状态。
7. **create 会覆盖同名文件**。建议使用新文件名或先与用户确认。
