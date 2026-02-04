# Text Node Toolbar Design

## Goal

- 文本节点改为无边框卡片样式，同时保持选中可识别。
- 文本样式改为“节点级设置”，支持字号、字重、字体样式、对齐、颜色。
- 工具栏采用二级面板（点击弹出）交互，覆盖所有文字设置。

## Scope

- `apps/web` 侧 TextNode 渲染与 Selection Toolbar 交互。
- 扩展工具栏 item 以支持二级面板。
- 为 TextNode 增加节点级文字样式字段。

## Non-Goals

- 全局默认文字设置与设置页配置。
- 文本富文本（范围内选区）样式。
- UI 主题系统改造。

## Data Model

TextNodeProps 增加字段（节点级）：
- `fontSize?: number` 默认 14
- `fontWeight?: number` 默认 400
- `fontStyle?: "normal" | "italic"` 默认 normal
- `textDecoration?: "none" | "underline" | "line-through"` 默认 none
- `textAlign?: "left" | "center" | "right"` 默认 left
- `color?: string` 默认 undefined

渲染时由 props 生成 `textStyle`，同时应用在展示态与编辑态文本节点，保证测量逻辑使用真实样式。

## Visual / UX

- TextNode 容器移除边框，背景改为透明或极浅底色（保持可点击区域）。
- 选中态使用轻微阴影或背景高亮替代边框。
- Mindmap 分支色：当 `color` 未设置时作为文字色使用，避免失去分支颜色提示。
- 占位提示与自动尺寸逻辑保持一致。

## Toolbar Interaction

### 一级工具栏

- 提供 5 个入口：字号、字重、字体样式、对齐、颜色。
- 点击后弹出二级面板，二级面板显示具体选项。
- 再次点击同一入口或点击空白区域关闭。
- 二级面板内部点击选项立即生效并保持面板打开，方便连续调整。

### 二级面板内容

- 颜色：预设色块（8-10 个），当前色高亮。
- 字号：12/14/16/18/20/24 档位。
- 字重：400/500/600/700（常规/中等/半粗/加粗）。
- 字体样式：斜体 / 下划线 / 删除线（toggle）。
- 对齐：左 / 中 / 右（三按钮 toggle）。

二级面板沿用现有 `HoverPanel` 的视觉样式，但行为由点击控制。

## Implementation Notes

- 扩展 `CanvasToolbarItem`，新增可选 `panel` 与 `panelClassName`（或 `panelWidth`）字段。
- `SelectionToolbar` 维护 `openPanelId`，负责切换与点击关闭行为。
- TextNodeDefinition 提供 toolbar items，点击时调用 `updateNodeProps`。

## Testing / Verification

- 手动验证：创建文本节点 → 修改各项设置 → 样式应用与自动尺寸正常。
- 选中/非选中状态视觉一致，无边框但可识别。

