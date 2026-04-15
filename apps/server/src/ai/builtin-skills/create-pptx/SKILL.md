---
name: create-pptx-skill
description: >
  当用户希望**创建**或**编辑** PowerPoint 演示文稿（.pptx）时触发。典型说法："帮我做个 PPT"、"生成一份汇报 PPT"、"把这些要点做成幻灯片"、"修改第 3 页的标题"、"在 PPT 里加一页"、"把 slide 2 的副标题改成 XXX"。**不用于读取 PPT 内容** —— 读取请直接用 `Read(file_path)`。
---

# PPTX (PowerPoint) 创建与编辑

## 触发条件

- 用户要求从零生成幻灯片（大纲、汇报、培训材料、路演 deck 等）
- 用户要求修改已有 .pptx 的标题、正文、备注或结构
- 用户要求在现有 PPT 中新增/删除/替换页面内容

只读场景（总结 PPT 内容、提取要点）**不走本技能**，直接用 `Read(file_path)` 即可。

## 核心工具：`PptxMutate`

单一工具，两个 action：`create` 从零生成新文件，`edit` 通过 XPath + XML 修改已有文件。工具需要用户审批（`needsApproval: true`）。

## 创建 PPT（`action: "create"`）

参数 `slides` 是一个数组，每个元素形如：

```ts
{
  title?: string        // 幻灯片标题
  textBlocks?: string[] // 正文文本块数组，每个元素一段内容
  notes?: string        // 演讲者备注，不显示在正文
}
```

CJK 全面支持，可以直接写中文。

**示例：生成 4 页季度汇报**

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
      "notes": "重点强调 NPS 的提升来自客服响应优化"
    },
    {
      "title": "下季度重点",
      "textBlocks": ["扩张东南亚市场", "上线企业版", "完成 B 轮融资"],
      "notes": ""
    },
    {
      "title": "Q&A",
      "textBlocks": ["谢谢聆听"]
    }
  ]
}
```

**内容建议**：标题 ≤ 10 字；每个 textBlock 3-5 行、每行 15-20 字；整份 deck 5-15 页为宜，超过 20 页考虑拆分主题。

## 编辑已有 PPT（`action: "edit"`）

PPTX 本质是一个 ZIP 包，常见内部结构：

```
ppt/presentation.xml            # 全局演示文稿索引，含 sldIdLst（决定页面顺序）
ppt/slides/slide1.xml           # 第 1 页正文 OOXML
ppt/slides/slide2.xml           # 第 2 页
ppt/slides/_rels/slide1.xml.rels # slide1 的引用关系（图片/超链接等）
ppt/media/image1.png            # 嵌入的媒体文件
```

编辑流程**必须先看原始 XML**，盲写 XPath = 破坏文件：

**Step 1：用 `Bash unzip -p` 拉出目标 XML**

`Read(file_path)` 返回的是每页的 Markdown，不是原始 XML，定位 XPath 不够用。必须：

```bash
unzip -p /path/to/deck.pptx ppt/slides/slide2.xml
# 需要时再看 presentation.xml / rels / layout
unzip -p /path/to/deck.pptx ppt/presentation.xml
unzip -p /path/to/deck.pptx ppt/slides/_rels/slide2.xml.rels
```

**Step 2：分析 XML 结构**，PPTX 文本节点典型长这样：

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

**Step 3：用 `PptxMutate { action: "edit", edits: [...] }` 下手**

`edits` 每一项形如 `{ op, path, xpath, xml?, position? }`，op 为 `replace` / `insert` / `remove` / `write` / `delete`。

**示例：把第 2 页某段文字从 "旧标题文字" 改成 "新标题文字"**

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
4. **主题色与版式继承**：直接改 XML 后文字颜色可能显示不对 —— PPTX 颜色常来自 theme/master/layout 的继承链，本地 run 级别的 `<a:solidFill>` 才会覆盖主题色。
5. **Mutate 需要用户审批**：每次调用都会弹审批，批量编辑尽量合并到一次 `edits` 数组里。
6. **大面积重写请用 create**：如果要改动超过整份 deck 30% 的内容，生成一份全新的 .pptx 比打一堆 XPath 补丁可靠得多。XPath edit 适合精确小改动（改标题、换日期、补一行要点），不适合整页重排。

## 铁律

1. **编辑前先 `Bash unzip -p` 看原始 XML**，没有例外。
2. **小改 edit，大改 create**；阈值经验值 30%。
3. **create 会覆盖同名文件** —— 建议追加 `_v2`/`_edited` 后缀，或确认用户同意覆盖。
4. **只负责写，不负责读** —— 读取 PPT 内容走统一的 `Read(file_path)`。
