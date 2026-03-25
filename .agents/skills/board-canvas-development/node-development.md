# Node Development

## 核心入口

| 代码 | 职责 |
|------|------|
| [types.ts](/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf/apps/web/src/components/board/engine/types.ts) | `CanvasNodeDefinition`、`CanvasNodeViewProps` 等核心类型定义 |
| [board-nodes.ts](/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf/apps/web/src/components/board/core/board-nodes.ts) | 默认节点注册表 `BOARD_NODE_DEFINITIONS` |
| [CanvasEngine.ts](/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf/apps/web/src/components/board/engine/CanvasEngine.ts) | 通过 `registerNodes()` 把定义交给 `NodeRegistry` |
| [NodeFrame.tsx](/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf/apps/web/src/components/board/nodes/NodeFrame.tsx) | 节点通用外框与基础交互壳 |
| [nodes/](/Users/zhao/Documents/01.Code/Hex/Tenas-All/OpenLoaf/apps/web/src/components/board/nodes/) | 各节点实现目录 |

## 节点类型总览

当前画布包含以下节点类型：

| 节点 | type | 说明 |
|------|------|------|
| TextNode | `text` | 画布核心节点，默认便签样式，支持富文本编辑 |
| ImageNode | `image` | 图片展示与 AI 图片生成 |
| VideoNode | `video` | 视频播放与 AI 视频生成 |
| AudioNode | `audio` | 音频播放与 AI 语音生成 |
| LinkNode | `link` | URL 链接卡片 |
| FileAttachmentNode | `file-attachment` | 文件附件 |
| CalendarNode | `calendar` | 日历事件 |
| StrokeNode | `stroke` | 手写笔画 |
| GroupNode | `group` / `image-group` | 节点分组容器 |

## 文本便签节点（核心设计）

**设计定位**：文本便签是画布的"起点节点"。用户创建便签 → 输入内容 → 通过推荐按钮触发 AI 衍生操作。

### 样式规则

- 默认 style 为 `sticky`（带彩色背景的便签外观）
- 原有的 `StickyPlacementTool` 已删除，左侧工具栏不再有独立便签入口
- 文本创建工具（`TextPlacementTool`）直接创建 sticky 样式的文本节点
- 支持 6 种便签颜色：yellow、blue、green、pink、purple、orange
- 初始尺寸 200×200，可调整

### 数据结构

```typescript
TextNodeProps = {
  value: TextNodeValue           // string | Plate.js Value（富文本）
  style: 'sticky'               // 默认便签样式
  stickyColor: StickyColor       // 便签颜色
  fontSize?: number
  textAlign?: 'left' | 'center' | 'right'
  color?: string
  backgroundColor?: string
  autoFocus?: boolean
  origin?: NodeOrigin
}
```

## 功能推荐按钮系统

文本便签节点下方显示 AI 功能推荐按钮，引导用户进行下一步操作。

### 三个推荐按钮

| 按钮 | 功能 | 衍生方向 | 衍生节点类型 |
|------|------|---------|-------------|
| 文生视频 | 以文本为 prompt 生成视频 | 下游（TextNode → VideoNode） | VideoNode |
| 图片反推提示词 | 从图片提取描述填入文本 | 上游（ImageNode → TextNode） | ImageNode |
| 文字转语音 | 以文本内容合成语音 | 下游（TextNode → AudioNode） | AudioNode |

### 显示规则

| 按钮 | 显示条件 | 可重复点击 |
|------|---------|-----------|
| 文生视频 | 始终显示 | 是，可创建多个下游视频节点 |
| 文字转语音 | 始终显示 | 是，可创建多个下游音频节点 |
| 图片反推提示词 | 文本为空 **且** 上游无图片节点 | 否，已有上游图片时隐藏 |

**全局隐藏条件**：节点锁定或只读时，所有按钮隐藏。推荐按钮仅在节点被选中时显示。

### 显示规则的完整逻辑

```
isLocked = element.locked === true
isReadOnly = textNode.props.readOnlyProjection === true
isTextEmpty = textNode.props.value 为空或全空白
hasUpstreamImage = 存在以 textNode 为 target 的 connector，且 source 是 ImageNode

// 全局：锁定/只读时不显示任何按钮
// 下游功能始终显示，可重复点击
showTextToVideo = !isLocked && !isReadOnly
showTextToSpeech = !isLocked && !isReadOnly
// 上游功能：文本为空且无上游图片时才显示
showImageToPrompt = !isLocked && !isReadOnly && isTextEmpty && !hasUpstreamImage
```

### 点击行为

**文生视频**（下游）：
- 调用 `deriveNode({ engine, sourceNodeId, targetType: 'video', direction: 'downstream' })`
- 在文本节点右侧创建 VideoNode（间距 60px）
- 自动建立 TextNode → VideoNode 连接器
- 新节点设为 expanded 状态，打开 AI 面板
- 上游数据自动传播：文本内容 → VideoAiPanel.prompt

**图片反推提示词**（上游）：
- 调用 `deriveNode({ engine, sourceNodeId, targetType: 'image', direction: 'upstream' })`
- 在文本节点左侧创建 ImageNode（间距 120px，大于右侧因为图片节点尺寸较大）
- 自动建立 ImageNode → TextNode 连接器，跳过 mindmap 自动布局（`skipLayout: true`），确保文本节点位置不变
- 新节点设为 expanded 状态，打开 AI 面板

**文字转语音**（下游）：
- 调用 `deriveNode({ engine, sourceNodeId, targetType: 'audio', direction: 'downstream' })`
- 在文本节点右侧创建 AudioNode（间距 60px）
- 自动建立 TextNode → AudioNode 连接器
- 新节点设为 expanded 状态，打开 AI 面板
- 上游数据自动传播：文本内容 → AudioAiPanel.prompt

## 上下游数据流

延续现有的 `resolveUpstreamData` 机制：
- 文本节点作为上游时：提取 `props.value` 序列化为纯文本，传递给下游节点的 AI 面板作为 prompt
- 图片节点作为上游时：提取 `props.previewSrc` 或 `props.originalSrc`，传递给下游节点
- 所有 AI 面板通过 `useUpstreamData` hook 自动订阅上游数据

## 开发流程

### 1. 先定义持久化模型

- 明确节点 `type`、持久化 `props`、默认尺寸以及是否需要运行时校验
- 需要校验时，在 `CanvasNodeDefinition` 上提供 `schema`
- 节点 `type` 必须全局唯一；冲突会在注册阶段直接抛错

### 2. 创建 View 组件

`CanvasNodeViewProps` 是节点视图的标准输入：

- `element`：节点完整数据，包含 `id`、`xywh`、`props`、旋转、透明度等持久化字段
- `selected`：当前是否被选中
- `editing`：是否处于编辑态
- `onSelect()`：请求选中当前节点
- `onUpdate(patch)`：更新节点 props，并自动写入 engine 与历史记录

实现要求：

- 视图层把 `element.props` 当作单一事实来源
- 需要改 props 时优先走 `onUpdate`，不要在视图里自己改写内部文档状态
- 大多数可交互节点都应包在 `NodeFrame` 内，复用选中边框、拖拽命中区、右键菜单等基础行为

### 3. 补齐 `CanvasNodeDefinition`

常用字段如下：

| 字段 | 用途 |
|------|------|
| `type` | 节点唯一标识 |
| `defaultProps` | 新建节点时的默认 props |
| `view` | 节点 React 视图组件 |
| `schema` | 可选的 props 运行时校验 |
| `getMinSize` / `measure` | 动态最小尺寸或自动测量 |
| `anchors` | 连线锚点，必须返回世界坐标 |
| `toolbar` | 选中节点后的工具栏项 |
| `connectorTemplates` | 从锚点拖出时的模板节点 |
| `capabilities` | 是否可缩放、旋转、连线等能力开关 |

### 4. 注册到默认节点表

- 把新定义加入 `BOARD_NODE_DEFINITIONS`
- `ProjectBoardCanvas` 与 `BoardFileViewer` 都依赖这份默认节点表，因此漏注册会导致画布无法识别该节点
- 如果节点只属于某个特殊 board 场景，仍应先确认是否真的需要做成全局默认节点，而不是直接塞进默认表

## 交互规则

- 节点坐标、锚点坐标和尺寸计算都以世界坐标为准，不要混用屏幕坐标
- 涉及自动布局、连线模板、工具栏动作时，优先使用 engine 已暴露的能力，而不是在节点内部发散实现一套旁路逻辑
- 节点的"展示名"和"持久化字段"要分清楚；可读 label 可以在视图层派生，不要污染存储结构
- 推荐按钮渲染在 DomNodeLayer 的外层容器中（`overflow-visible`），不受节点内层 `overflow-hidden` 影响
- 推荐按钮容器使用 `ol-glass-toolbar` 样式（与画布工具栏一致的玻璃磨砂背景）
- 推荐按钮以竖向列表形式居中显示在节点底部（`top-full left-1/2 translateX(-50%)`）
- 推荐按钮仅在节点被选中时渲染，通过 `--label-scale` CSS 变量跟随缩放

## Working Rules

- 只写规则和代码链接，不放示例代码
- 新节点先对齐 `types.ts` 和注册表，再补业务 UI
- 任何涉及节点 schema、toolbar、anchors 的变更，都要回看对应定义是否仍完整

## Common Mistakes

| 错误 | 正确做法 |
|------|----------|
| 只写了节点组件，没有加入 `BOARD_NODE_DEFINITIONS` | 注册表是默认节点入口，漏掉就不会生效 |
| 在节点里直接改 engine 内部状态 | 节点 props 更新优先走 `onUpdate` 或明确的 engine API |
| 锚点返回屏幕坐标 | `anchors` 必须返回世界坐标 |
| 节点不包裹 `NodeFrame` | 会丢失通用交互能力与视觉边框 |
| 把临时 UI 状态写进持久化 props | 只把需要保存到 board 文件的状态写进 `props` |
| 推荐按钮不响应文本变化 | 需要订阅 textNode.props.value 变化重新计算可见性 |
| 衍生上游节点位置错误 | 图片反推提示词创建的节点在文本节点左侧，不是右侧 |
| 上游衍生导致文本节点位移 | `addConnectorElement` 会触发 `autoLayoutMindmap()`，上游方向必须传 `skipLayout: true` |
| 上游节点间距不够导致重叠 | 上游间距应大于下游（当前 120px vs 60px），因为上游通常是图片等较大节点 |
