---
name: visualization-ops
description: >
  可视化渲染——JSX 组件渲染和 ECharts 图表。当用户要生成数据图表（柱状图、折线图、
  饼图）、可视化卡片、统计面板时激活。
  **不用于**：纯文本列表/表格（→直接回答）、画布白板操作（→canvas-ops）。
---

# 可视化渲染

本 skill 覆盖两个渲染工具：`JsxCreate`（JSX 组件实时渲染）和 `ChartRender`（ECharts 图表渲染）。它们都能在聊天消息中直接展示视觉内容，无需用户额外操作。

## 决策树

```
需要可视化输出
├── 数据图表（折线/柱状/饼图/散点/雷达/热力图/地图）？
│   └── ChartRender（ECharts option）
├── 自定义卡片/面板/布局/状态展示/信息汇总？
│   └── JsxCreate（JSX 组件）
└── 不确定？
    ├── 有数值趋势/对比/分布数据 → ChartRender
    └── 其他结构化信息展示 → JsxCreate
```

## ChartRender — ECharts 图表渲染

提交 ECharts option 在消息中渲染图表。前端使用 ECharts 库渲染，支持 ECharts 全部图表类型。

**参数**：
- `option`（必填）：完整的 ECharts option 对象或 JSON 字符串
- `title`（可选）：图表标题
- `height`（可选）：图表高度（像素）

**ECharts option 编写要点**：
- 完整的 ECharts option 结构，包含 `xAxis`/`yAxis`/`series` 等
- 支持所有 ECharts 图表类型：line、bar、pie、scatter、radar、heatmap、treemap、sunburst、sankey、gauge 等
- 建议设置 `tooltip`、`legend` 提升可读性
- 配色会自动适配 light/dark 主题

**示例**：

柱状图：
```json
{
  "option": {
    "xAxis": { "type": "category", "data": ["Mon", "Tue", "Wed", "Thu", "Fri"] },
    "yAxis": { "type": "value" },
    "series": [{ "type": "bar", "data": [120, 200, 150, 80, 70] }],
    "tooltip": { "trigger": "axis" }
  },
  "title": "Weekly Data"
}
```

饼图：
```json
{
  "option": {
    "series": [{
      "type": "pie",
      "radius": "60%",
      "data": [
        { "value": 335, "name": "Direct" },
        { "value": 234, "name": "Email" },
        { "value": 154, "name": "Search" }
      ]
    }],
    "tooltip": { "trigger": "item" },
    "legend": { "orient": "vertical", "left": "left" }
  }
}
```

## JsxCreate — JSX 组件渲染

在聊天界面中实时渲染 JSX 组件。适合展示自定义卡片、状态面板、信息汇总等结构化内容。

**参数**：
- `content`（必填）：JSX 字符串

**核心规则**：
1. 只写 JSX 片段，不要写 `import`/`export`/`const`/函数定义
2. 允许 `{}` 表达式、`map`、条件渲染、`style={{...}}`
3. 不支持 `{...props}` 展开语法
4. 每条回复只调用一次 JsxCreate
5. 调用后不要再向用户重复输出 JSX 代码——工具会在前端直接展示渲染结果

**配色规范**：

OpenLoaf 采用 Apple 扁平色系，所有颜色通过语义 token 适配 light/dark 主题。直接写 `bg-white` 或 `text-gray-800` 在深色模式下会变成刺眼的白块或不可见的文字——所以只用语义 token：

基底色：`bg-card`、`bg-muted`、`text-foreground`、`text-muted-foreground`

语义强调色（低透明度背景 + 扁平文字，在两种主题下都清晰可读）：
- 蓝/信息：`bg-ol-blue/10 text-ol-blue`
- 绿/成功：`bg-ol-green/10 text-ol-green`
- 黄/警告：`bg-ol-amber/10 text-ol-amber`
- 红/错误：`bg-ol-red/10 text-ol-red`
- 紫/特殊：`bg-ol-purple/10 text-ol-purple`

标签/徽章：`rounded-full px-2.5 py-0.5 text-xs` + 上述扁平色组合

不使用渐变（`bg-gradient-*`）、阴影（`shadow-*`）和外框（`border`/`ring`）——JSX 组件嵌入在聊天消息流中，这些装饰会让卡片看起来像独立弹窗而非消息的一部分，破坏阅读连贯性。

**风格规范**：
- 圆角 `rounded-lg`/`rounded-xl`，间距紧凑（`p-3`~`p-4`、`gap-2`~`gap-3`）
- 优先 `text-sm`/`text-xs` 小字号、横向宽布局——聊天窗口宽度有限，纵向过长会让用户滚动很久才能看完

**可用组件白名单**（大小写敏感）：
Message, MessageContent, Panel, Snippet, SnippetAddon, SnippetText, SnippetInput, SnippetCopyButton, CodeBlock, Checkpoint, Task, TaskTrigger, TaskContent, TaskItem, TaskItemFile, Image, Attachments, Attachment, AudioPlayer, AudioPlayerElement, AudioPlayerControlBar, AudioPlayerPlayButton, AudioPlayerSeekBackwardButton, AudioPlayerSeekForwardButton, AudioPlayerTimeDisplay, AudioPlayerTimeRange, AudioPlayerDurationDisplay, AudioPlayerMuteButton, AudioPlayerVolumeRange, WebPreview, WebPreviewNavigation, WebPreviewNavigationButton, WebPreviewUrl, WebPreviewBody, WebPreviewConsole

不建议使用 Message/Panel/Snippet 等带外框的组件作为外层容器。

**校验与修正**：
- 服务端会校验 JSX 语法，违规直接报错
- 校验失败仍会写入文件，错误信息包含 path，用 `Edit` 修正后刷新预览
- 失败后必须用 `Edit` 修正，不要重新调用 JsxCreate

**写入位置**：`[<sessionId>]/jsx/<messageId>.jsx`

**交互式表单**：需要收集用户输入时用 `AskUserQuestion`，JsxCreate 仅负责展示。

## 何时用 ChartRender vs JsxCreate

| 场景 | 推荐工具 |
|------|---------|
| 数值趋势/对比/分布 | ChartRender |
| 自定义卡片/面板 | JsxCreate |
| 统计数据 + 图表混合 | 先 ChartRender 出图表，再 JsxCreate 做汇总卡片 |
| 简单数据（2-3 个指标） | JsxCreate 即可，无需图表 |
| 复杂交互式图表 | ChartRender（ECharts 自带交互） |
