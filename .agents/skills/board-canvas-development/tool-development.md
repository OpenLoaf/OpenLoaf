# Tool Development

## 核心入口

| 代码 | 职责 |
|------|------|
| [ToolTypes.ts](/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf/apps/web/src/components/board/tools/ToolTypes.ts) | `CanvasTool`、`ToolContext` 与 `CanvasToolHost` 契约 |
| [ToolManager.ts](/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf/apps/web/src/components/board/tools/ToolManager.ts) | 工具注册、事件分发、快捷键、中键拖拽、公共快捷键 |
| [CanvasEngine.ts](/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf/apps/web/src/components/board/engine/CanvasEngine.ts) | 在构造函数里注册默认工具并设置当前激活工具 |
| [BoardToolbar.tsx](/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf/apps/web/src/components/board/toolbar/BoardToolbar.tsx) | 工具按钮、图标与 tooltip 快捷键文案 |

## 开发流程

### 1. 先决定它是不是“工具”

- 需要持续接管指针事件的行为，才适合做成 `CanvasTool`
- 一次性插入节点通常更接近 `pendingInsert` 流程，不一定需要新增工具
- 只影响单个节点局部交互的逻辑，优先放回节点自身，而不是滥增全局工具

### 2. 实现 `CanvasTool`

`ToolContext` 已经提供：

- `engine`
- 原始 `PointerEvent`
- `screenPoint`
- `worldPoint`

其中 `engine` 在工具层应视为 `CanvasToolHost`，只依赖工具需要的最小接口，不要在 `ToolTypes.ts` 里重新 import `CanvasEngine` 实现类。

实现要求：

- 位置计算优先使用 `worldPoint`，不要自己重复做坐标变换
- 需要键盘交互时，实现 `onKeyDown(event, engine)`
- 涉及改动文档内容、选区、连线或视口时，优先复用 engine 现有方法

### 3. 注册到 `CanvasEngine`

- 新工具需要在 `CanvasEngine` 构造函数里显式 `register()`
- `ToolManager` 会对重复 `id` 直接抛错，因此工具 id 必须唯一
- 若希望它成为默认工具或可被切换到，需要同步考虑初始激活策略

### 4. 补齐可见入口

如果工具需要暴露给用户，还要同步检查：

- `ToolManager.ts` 的 `TOOL_SHORTCUTS` 是否要加入快捷键
- `BoardToolbar.tsx` 的工具按钮、tooltip 与快捷键文案是否要更新
- 锁定态下是否允许使用该工具
- 是否需要和 `Escape`、中键拖拽、自动布局、复制粘贴等全局快捷键互斥

## ToolManager 事件流

当前 `ToolManager` 的关键行为：

- 中键按下时会临时切到 `hand` 逻辑，松开后恢复，不会永久切换当前工具
- 指针按下时会尝试设置 pointer capture，保证拖拽过程中不会丢事件
- 交互起点如果位于 board 内部可编辑 UI，会跳过工具分发，避免干扰输入与文本选择
- 画布锁定时会阻止画笔、高亮笔、橡皮擦等编辑工具继续工作
- `Escape` 会优先取消待插入节点、连线草稿和当前选区，再交给具体工具

## 当前快捷键

| 快捷键 | 行为 |
|--------|------|
| `A` | 选择工具 |
| `W` | 拖拽工具 |
| `P` | 钢笔 |
| `K` | 荧光笔 |
| `E` | 橡皮擦 |
| `F` | 适应全部元素 |
| `L` | 锁定或解锁画布 |
| `Ctrl/Cmd + Shift + L` | 自动布局 |
| `Escape` | 取消插入、连线或选区 |

输入控件与可编辑区域内，工具快捷键应尽量让位给原生输入行为。

## 现有工具参考

| 工具 | 用途 | 备注 |
|------|------|------|
| `SelectTool` | 选择、移动、缩放、旋转、连线 | 最复杂，适合先读它理解基础事件流 |
| `HandTool` | 平移视口 | 与中键临时拖拽共享 |
| `PenTool` | 钢笔绘制 | 依赖笔画数据写入 |
| `HighlighterTool` | 荧光笔绘制 | 与 `PenTool` 相似，但渲染语义不同 |
| `EraserTool` | 擦除笔画 | 锁定态下应禁用 |

## Working Rules

- 只写规则和代码链接，不放示例代码
- 新工具先对齐 `ToolTypes.ts` 和 `ToolManager.ts` 的事件契约，再补 UI 入口
- 工具层新增依赖时，优先加到 `CanvasToolHost`，不要直接把 `CanvasEngine` 引回 `ToolTypes.ts`
- 若工具对快捷键、锁定态或编辑态有要求，必须在文档里写清楚边界

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 直接用 `event.clientX/Y` 计算命中 | 使用 `ctx.worldPoint` 或 `ctx.screenPoint` |
| 新工具只实现类，却没在 `CanvasEngine` 注册 | 注册缺失时工具永远不会参与事件分发 |
| 只改 `ToolManager`，没改 `BoardToolbar` 文案 | 用户可见工具需要同步更新按钮和 tooltip |
| 忽略锁定态与输入态 | 新工具必须明确在锁定画布和可编辑控件场景下的行为 |
| 在工具里复制一套通用快捷键处理 | 先复用 `ToolManager` 现有公共快捷键，再补工具特有逻辑 |
| 在 `ToolTypes.ts` 直接引用 `CanvasEngine` | 改为补齐 `CanvasToolHost`，让工具层依赖接口而不是实现 |
