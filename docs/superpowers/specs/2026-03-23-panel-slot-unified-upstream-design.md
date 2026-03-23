# AI 面板统一插槽系统设计

> 日期：2026-03-23
> 状态：已确认
> 范围：Image / Video / Audio 所有 AI 面板的所有 variant

## 问题

当前画布 AI 面板的插槽显示存在三个问题：

1. 部分父节点未显示在面板中（被过滤掉）
2. 已显示的父节点无法区分是否参与生成
3. 不同 variant 对父节点的处理不一致

## 设计目标

- 所有父节点（通过连线连接的上游节点，具有可识别媒体类型的）都在面板插槽区展示
- 清晰区分「参与生成的功能插槽」和「仅关联的上下文节点」
- 用户可交互地调整分配关系
- 切换 variant 后再切回时恢复之前的手动分配
- 框架级统一方案，所有面板/variant 遵循同一规则

## 与 Variant 自主组装原则的关系

现有的 variant 自主组装原则（父组件不拦截 nodeResourcePath、不 hack 注入、variant 自己处理输入）**继续保留**。本设计在此基础上增加一个**框架层的上游展示与分配编排**：

- **框架层（InputSlotBar）职责**：渲染所有父节点、管理功能插槽 ↔ 关联区的可视分配、处理交换交互、持久化分配关系
- **Variant 层职责不变**：variant 仍然声明自己的 `inputSlots`，仍然通过 `onParamsChange` 报告 inputs/params，仍然自主决定如何组装 API 请求
- **数据流变化**：InputSlotBar 完成分配后，将分配结果（已填充的 slot → 媒体引用映射）传递给 variant 组件作为 `resolvedSlots` prop，variant 可以直接使用而非自己再做分配

这意味着 variant 内部的 `MediaSlotGroup` 渲染将**迁移到 InputSlotBar**，variant 组件简化为只处理参数表单 + API 组装。现有 variant 需逐步迁移，迁移期间两种模式共存：如果 variant 声明了 `inputSlots`，由 InputSlotBar 统一渲染；否则 variant 内部自行渲染（兼容旧行为）。

## 方案：声明式插槽 + 自动分配 + 点击交换

### 1. 插槽区域布局

面板顶部插槽区分为两个逻辑区：

#### 功能插槽区（Active Slots）

- 由当前 variant 声明，每个插槽有语义标签（如「参考图」「遮罩」「首帧」「尾帧」）
- **始终显示**，无论有没有父节点连入（空插槽显示虚线 + "+"，支持点击上传）
- 缩略图 44×44（紧凑模式，与现有 MediaSlot compact 一致），主题色边框（2px solid）
- 底部语义标签，text-xs 灰色文字

#### 关联节点区（Associated Refs）

- 所有父节点中未分配到功能插槽的部分（仅包含 image/video/audio/text 等可识别媒体类型的节点）
- 缩略图 44×44，opacity-50 + 灰色虚线边框
- 无语义标签，hover 时 tooltip 显示节点名称/类型
- hover 时 opacity 恢复到 1.0
- **为空则隐藏整个区域**

#### 单行/双行规则

- 面板宽度 420px，内边距 12px，可用 396px
- 单个插槽 44px + gap 8px → 单行最多 **7 个**
- 功能插槽数 + 关联节点数 ≤ 7 → **单行**，功能插槽在左，竖向分隔线（h-8 w-px bg-border），关联节点在右
- \> 7 → **双行**，第一行功能插槽，第二行关联节点，行间距 gap-1.5（6px）

#### 文本节点处理

文本类型的父节点仍由 `TextReferencePool` / `TextSlotField` 单独渲染（保持现有行为），不出现在媒体插槽区。关联节点区仅展示媒体类型（image/video/audio）的未分配父节点。

### 2. 自动分配算法

当面板打开或 variant 切换时：

1. 先检查 `paramsCache` 中是否有该 variant 的缓存分配（`slotAssignment`），有则恢复
2. 恢复时校验：缓存中引用的 nodeId 是否仍然连接，已断开的插槽重新执行自动分配
3. 无缓存时执行自动分配：
   - 收集所有父节点，按媒体类型分组（image/video/audio）
   - 遍历 variant 声明的功能插槽，按顺序从匹配类型的父节点池中取出填入
   - 优先级：节点自身资源 > 连接顺序靠前的父节点
4. 剩余未分配的父节点进入关联节点区

#### 与 MediaSlotGroup 溢出策略的关系

现有 `overflowStrategy`（rotate/truncate/merge）在新架构下**不再需要**。溢出的父节点统一进入关联节点区，而非在单个 slot 内做 rotate/truncate。现有的 `overflowStrategy` 字段保留但标记 deprecated，迁移完成后移除。

### 3. 用户交换操作

两种交互路径：

- **点击关联节点**：如果功能插槽中有匹配类型的空位，直接填入；无空位则弹出选择器，用户选择替换哪个功能插槽（被替换的回到关联区）
- **点击功能插槽**：弹出下拉选择器，列出关联区中同类型的节点 + 「手动上传」选项，选中即交换

未来可扩展拖拽交互（从关联区拖入功能插槽），当前版本不实现。

### 4. 持久化策略

复用现有的三级参数缓存系统（`variantParamsRef` → `paramsCacheLocal` → `aiConfig.paramsCache`）。

`slotAssignment` 存储为 `VariantParamsSnapshot` 的**同级字段**（非嵌套在 `inputs` 内），避免 API 请求序列化时的类型污染：

```typescript
// 新增类型定义（slot-types.ts）
// 注意：与现有 SlotAssignment（运行时分配结果）区分，本类型用于跨会话持久化
type PersistedSlotMap = Record<string, string>
// key: slotId
// value: nodeId（来自父节点）| "manual:<board-relative-path>"（用户手动上传）
// 示例: { image: "node-id-123", mask: "manual:assets/uploads/mask.png" }
// manual 引用使用 board-relative path，与 toMediaInput() 一致

// 扩展 VariantParamsSnapshot（variants/types.ts）
interface VariantParamsSnapshot {
  inputs: Record<string, unknown>
  params: Record<string, unknown>
  count?: number
  seed?: number
  slotAssignment?: PersistedSlotMap  // 新增
}

// paramsCache["imageGenerate:OL-IE-001"] =
{
  inputs: {
    image: { path: "asset/img-a.jpg" },
    mask: { path: "asset/mask.png" },
  },
  params: { strength: 0.8 },
  slotAssignment: {
    image: "node-id-123",
    mask: "manual:assets/uploads/mask.png",
  }
}
```

- 以 `featureId:variantId` 为 key 存储
- 切换 variant 时保存当前分配到缓存，切回时从 `slotAssignment` 恢复
- 写入 CanvasDoc，跨会话持久化

### 5. 边界场景

#### 连线变化

- **新增连线**：新父节点优先填入匹配类型的空功能插槽，没空位则进入关联区
- **删除连线**：被删父节点在功能插槽中时，该插槽变空（虚线 + "+"），不自动从关联区补位。关联区中如有可填充的同类型节点，空插槽会显示微弱脉冲动画提示用户可手动分配
- 手动上传的文件不受连线变化影响

#### 类型不匹配

- 图片父节点不填入视频插槽，反之亦然
- 无匹配类型父节点的功能插槽保持空状态

#### 生成时输入收集

- 只收集功能插槽中的内容提交 API
- 关联区节点不参与生成
- 必填插槽（`min >= 1`）为空时禁用生成按钮

#### 版本堆叠兼容

- 生成时将插槽分配快照到 `upstreamRefs`，与现有冻结机制一致
- 查看历史版本时，插槽区显示冻结状态（只读）

#### 空状态

- 功能插槽始终显示（支持直接上传）
- 关联节点区仅在有未分配父节点时显示

## 涉及的关键文件

| 文件 | 改动 |
|------|------|
| `variants/types.ts` | `VariantParamsSnapshot` 增加 `slotAssignment?: PersistedSlotMap` |
| `variants/slot-types.ts` | 新增 `PersistedSlotMap` 类型定义；`overflowStrategy` 标记 deprecated |
| `variants/slot-engine.ts` | `assignUpstreamToSlots` 整合缓存恢复逻辑 + 校验 |
| `variants/shared/InputSlotBar.tsx` | 重构：统一插槽区 + 关联区渲染，接管 variant 的 MediaSlotGroup 渲染 |
| `variants/shared/MediaSlotGroup.tsx` | 适配新的双区布局 |
| `variants/shared/MediaSlot.tsx` | 新增关联节点弱化样式（opacity-50 + 虚线边框） |
| `ImageAiPanel.tsx` | 传递完整父节点列表 + 持久化整合 |
| `VideoAiPanel.tsx` | 同上 |
| `AudioAiPanel.tsx` | 同上 |
| `engine/upstream-data.ts` | 确保所有父节点 entries（含 nodeId、nodeType、label）完整传递 |
| 各 Variant 组件 | 逐步迁移：移除内部 MediaSlotGroup，改用 `resolvedSlots` prop |
