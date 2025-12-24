# AFFiNE 画布（Edgeless）核心与业务功能记录

> 范围：画布核心（Surface/Gfx）+ Edgeless 业务能力（文本/形状/对齐/导出/协作/工具栏等）+ 架构总览。
> 代码定位均基于仓库 `AFFiNE`。

## 一、整体架构总览（从外到内）

1) **应用接入层（编辑器入口）**
- `packages/frontend/core/src/blocksuite/editors/edgeless-editor.ts`
  - 前端把 Blocksuite 的 Edgeless 视图挂载到应用界面。

2) **Edgeless 根服务/画布上下文**
- `blocksuite/affine/blocks/root/src/edgeless/edgeless-root-service.ts`
  - 负责画布上下文、层级/选区/缩放/工具状态等能力的聚合与协调。
  - 提供 `surface`（画布模型）、`layer`（图层）、`selection` 等核心访问点。

3) **画布 Block（Surface）**
- `blocksuite/affine/blocks/surface/src/surface-model.ts`
  - 定义 `affine:surface` 的 block schema 和模型。
- `blocksuite/affine/blocks/surface/src/surface-block.ts`
  - Surface block 组件，实现画布容器与渲染承载。
- `blocksuite/affine/blocks/surface/src/view.ts`
  - View Extension 注册：在 Edgeless 模式挂载 `affine-surface`；在文档模式挂载 void 组件。

4) **Gfx 引擎（通用画布核心）**
- `blocksuite/framework/std/src/gfx/*`
  - 图层（LayerManager）、视口（Viewport）、选择（Selection）、交互（Interactivity）等引擎能力。
- `blocksuite/framework/std/src/gfx/model/surface/surface-model.ts`
  - SurfaceBlockModel：element 存储基于 Yjs Map；负责 element CRUD 与更新通知。

5) **渲染管线**
- `blocksuite/affine/blocks/surface/src/renderer/canvas-renderer.ts`
  - 主 Canvas 渲染器，支持多层 stacking canvas，负责高性能绘制。
- `blocksuite/affine/blocks/surface/src/renderer/dom-renderer.ts`
  - DOM 渲染支持（用于部分元素或富文本等 DOM 需求）。
- `blocksuite/affine/blocks/surface/src/renderer/overlay.ts`
  - Overlay 基础设施（对齐辅助线、交互提示、选区等）。

## 二、数据模型与协作

1) **Yjs 驱动的 Surface 数据结构**
- `blocksuite/framework/std/src/gfx/model/surface/surface-model.ts`
  - `SurfaceBlockProps.elements` 使用 `Y.Map<Y.Map<unknown>>` 保存元素状态。
  - `SURFACE_YMAP_UNIQ_IDENTIFIER` 标识基于 Y.Map 的字段。

2) **Edgeless 元素与 Block 模型**
- 元素模型来源于 `@blocksuite/affine-model`：
  - 例如 `ConnectorElementModel`、`MindmapElementModel`、`EdgelessTextBlockModel` 等。
- Edgeless 文本 Block：
  - `blocksuite/affine/model/src/blocks/edgeless-text/edgeless-text-model.ts`
  - `blocksuite/affine/blocks/edgeless-text/src/edgeless-text-block.ts`

3) **与 BlockSuite Store 的关系**
- Surface 作为 `affine:surface` block 进入 Store，配合 Edgeless Root 形成完整画布文档结构。

## 三、业务功能模块（按能力分类）

### 1) 文本
- Edgeless 文本 Block：
  - `blocksuite/affine/blocks/edgeless-text/src/edgeless-text-block.ts`
- 文本编辑器（gfx 层编辑 UI）：
  - `blocksuite/affine/gfx/text/src/edgeless-text-editor.ts`
- 文本工具/渲染：
  - `blocksuite/affine/gfx/text/src/tool.ts`
  - `blocksuite/affine/gfx/text/src/element-renderer.ts`

### 2) 形状（Shape）
- `blocksuite/affine/gfx/shape/src/*`
  - 形状工具、元素渲染、文字渲染、overlay 等。

### 3) 画笔/荧光笔/橡皮擦
- `blocksuite/affine/gfx/brush/src/*`
  - brush/highlighter/eraser 工具与渲染。

### 4) 连接线
- `blocksuite/affine/gfx/connector/src/*`
  - 连接线工具、管理器、文本标签、渲染。

### 5) 思维导图
- `blocksuite/affine/gfx/mindmap/src/*`
  - mindmap 渲染、交互、工具栏。

### 6) 分组与组合
- `blocksuite/affine/gfx/group/src/*`
  - 分组元素视图、渲染、工具栏。

### 7) Note/Frame 等块级元素
- Note edgeless 相关：
  - `blocksuite/affine/blocks/note/src/note-edgeless-block.ts`
- Frame 相关：
  - `blocksuite/affine/blocks/frame/*`
- 其他可嵌入元素（图片/附件/嵌入类）通常有 edgeless 变体：
  - `blocksuite/affine/blocks/image/src/image-edgeless-block.ts`
  - `blocksuite/affine/blocks/attachment/src/attachment-edgeless-block.ts`
  - `blocksuite/affine/blocks/embed/*/embed-edgeless-*.ts`

### 8) Template
- `blocksuite/affine/gfx/template/src/*`
  - 模板工具/面板/配置。

### 9) Turbo Renderer（性能优化）
- `blocksuite/affine/gfx/turbo-renderer/src/*`
  - 渲染性能优化通道（worker/painter 等）。

## 四、交互、对齐、辅助线

1) **默认交互工具（选择/移动/拖拽）**
- `blocksuite/affine/blocks/surface/src/tool/default-tool.ts`
  - 选框、拖拽、边缘滚动、框选等行为。

2) **自动对齐/分布**
- 对齐算法：`blocksuite/affine/blocks/surface/src/commands/auto-align.ts`
- 工具栏入口：`blocksuite/affine/blocks/root/src/edgeless/configs/toolbar/alignment.ts`

3) **拖拽吸附与对齐辅助线**
- 辅助线算法与绘制：`blocksuite/affine/gfx/pointer/src/snap/snap-overlay.ts`
- 拖拽/缩放吸附接入：`blocksuite/affine/gfx/pointer/src/snap/snap-manager.ts`
- 注册入口：`blocksuite/affine/gfx/pointer/src/view.ts`

4) **选区与拖拽 UI**
- 选区矩形：`blocksuite/affine/widgets/edgeless-selected-rect/src/edgeless-selected-rect.ts`
- 拖拽区域：`blocksuite/affine/widgets/edgeless-dragging-area/src/edgeless-dragging-area-rect.ts`

## 五、工具栏与 UI

- Edgeless 工具栏：`blocksuite/affine/widgets/edgeless-toolbar/src/edgeless-toolbar.ts`
- 键盘工具栏：`blocksuite/affine/widgets/keyboard-toolbar/src/keyboard-toolbar.ts`
- Edgeless 相关工具栏配置：
  - `blocksuite/affine/blocks/root/src/edgeless/configs/toolbar/*`

## 六、导出/剪贴板/跨文档引用

1) **导出（图片/画布渲染到 Canvas）**
- `blocksuite/affine/blocks/surface/src/extensions/export-manager/export-manager.ts`
  - `edgelessToCanvas` 等能力。
  - 依赖 `html2canvas`、`pdf-lib` 等第三方工具。

2) **剪贴板**
- `blocksuite/affine/blocks/root/src/edgeless/clipboard/*`
  - 负责 edgeless 选择内容的序列化/反序列化。
- 各 block 的 edgeless 贴板配置：
  - `blocksuite/affine/blocks/*/src/edgeless-clipboard-config.ts`

3) **Surface Ref（画布引用/嵌入）**
- `blocksuite/affine/blocks/surface-ref/*`
  - 在文档/画布中引用渲染另一个 surface 内容。

## 七、渲染与图层组织（细节）

- CanvasRenderer 支持 stacking canvas：`blocksuite/affine/blocks/surface/src/renderer/canvas-renderer.ts`
- Layer 由 `@blocksuite/std/gfx` 负责：`blocksuite/framework/std/src/gfx/*`
- 网格、背景等功能由 Renderer + Viewport/LayerManager 配合实现。

## 八、协作与持久化

- 画布元素存储基于 Yjs Map（SurfaceModel 内部实现）：
  - `blocksuite/framework/std/src/gfx/model/surface/surface-model.ts`
- 通过 BlockSuite Store 的事务与同步机制提供实时协作能力。

## 九、相关模板与资源

- Edgeless 模板：`packages/frontend/templates/edgeless/*`
- Edgeless 预览快照：`packages/frontend/templates/edgeless-snapshot/*`

## 十、扩展接入点（Store/View Extension）

- Store 扩展：`blocksuite/affine/blocks/surface/src/store.ts`
- View 扩展：`blocksuite/affine/blocks/surface/src/view.ts`
  - Edgeless 模式挂载 `affine-surface` 组件，注册默认工具与编辑中间件。

---

## 关键路径索引（快速定位）

- **画布核心模型**：`blocksuite/framework/std/src/gfx/model/surface/surface-model.ts`
- **Surface Block**：`blocksuite/affine/blocks/surface/src/surface-model.ts`
- **Canvas 渲染器**：`blocksuite/affine/blocks/surface/src/renderer/canvas-renderer.ts`
- **Edgeless 根服务**：`blocksuite/affine/blocks/root/src/edgeless/edgeless-root-service.ts`
- **文字组件**：`blocksuite/affine/blocks/edgeless-text/src/edgeless-text-block.ts`
- **对齐/吸附**：
  - `blocksuite/affine/blocks/surface/src/commands/auto-align.ts`
  - `blocksuite/affine/gfx/pointer/src/snap/snap-overlay.ts`
  - `blocksuite/affine/gfx/pointer/src/snap/snap-manager.ts`

