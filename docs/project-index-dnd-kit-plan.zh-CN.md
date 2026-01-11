# Project 首页方案（dnd-kit + CSS Grid + motion/react）

## 概述
Project 首页目标是「iOS 桌面」风格的可编辑空间：你拖动的是“物体”（图标/小组件），系统在拖动过程中实时做命中检测、让位与重排，并用弹性过渡呈现“物理感”。

本方案使用：
- `@dnd-kit/*`：拖拽引擎（pointer tracking + hit testing + collision）
- `CSS Grid`：自动流动与尺寸占位（DOM flow）
- `motion/react`：布局过渡与回弹（`layout` / `AnimatePresence`）
- 组打开/关闭：复用现有 tab 的 `stack` 逻辑（与其它面板一致）

## 目标
- iOS 桌面式的“拿起/放下”体验：拖动过程中实时让位重排（live reflow）。
- 支持不同尺寸的 widget（`colSpan/rowSpan`），其余元素自动流动。
- 支持“组/文件夹”：拖拽叠放合并为组，点击打开组内容。
- 编辑/使用分离：仅编辑模式可拖拽/缩放，日常使用以点击为主。

## 非目标
- 不做协作/多人布局。
- 不做复杂的“跨屏分页桌面”（先聚焦单画布）。

## 核心概念
- **Widget**：桌面上的一个物体（文件、文件夹、日历、链接等）
- **Slot**：网格中的一个“锚点/落点”（概念层，非必须渲染为 DOM）
- **Layout**：Widget 的 slot 位置 + span 尺寸
- **Group**：容器型 widget（类似 iOS 文件夹），内部也有自己的 grid 与 layout
- **EditMode**：决定是否允许拖拽/缩放/批量操作

## 视觉与结构（推荐）
- 主画布：`display: grid; grid-auto-flow: dense;`
- Widget 通过 `gridColumn: span colSpan`、`gridRow: span rowSpan` 控制尺寸。
- 组件位置不直接用 `x/y`，而是用 `slotId`（或 `row/col`）表征“落点”。

> 备注：`grid-auto-flow: dense` 会自动尝试“填空”，但要获得稳定的空间记忆，需要我们用 layout 算法控制每个 widget 的锚点（见下文）。

## 数据模型（建议）
```ts
export type WidgetType =
  | "file"
  | "folder"
  | "calendar"
  | "link"
  | "todo"
  | "quick-action"
  | "overview"
  | "search"
  | "group";

export type Breakpoint = "lg" | "md" | "sm" | "xs" | "xxs";

export type WidgetLayout = {
  /** 概念上的落点（slot），用于稳定空间记忆；也可用 {row, col} 表示 */
  slotId: string;
  colSpan: number;
  rowSpan: number;
};

export type ProjectWidget = {
  id: string;
  type: WidgetType;
  title: string;
  config: Record<string, unknown>;
  layoutByBreakpoint: Record<Breakpoint, WidgetLayout>;
  groupId?: string | null;
};

export type ProjectGroup = {
  id: string;
  title: string;
  widgetIds: string[];
  layoutByBreakpoint: Record<Breakpoint, WidgetLayout>;
};
```

## 拖拽系统（dnd-kit）
### 需要的模块
- `@dnd-kit/core`：`DndContext`、sensors、DragOverlay、collision
- `@dnd-kit/sortable`：可选（如果我们复用 sortable 的策略），或自研 reorder
- `@dnd-kit/modifiers`：可选（限制轴/限制容器/限制滚动）

### Sensors（建议）
- `PointerSensor`：主力（桌面/触控板）
- `KeyboardSensor`：可访问性
- activation constraint：防误触（如按住 150ms 或移动 5px 才开始）

### Collision detection（关键）
桌面不是列表，“命中谁”要比“顺序”更重要。建议优先考虑：
- `rectIntersection` 或 `closestCenter`（按视觉中心/重叠面积决定 over）
- 组（Folder）在拖拽时需要更明显的命中反馈（over 状态高亮）

### Drag overlay（建议）
使用 `DragOverlay` 渲染拖动中的“浮起物体”，原元素保留占位，避免布局抖动。

## 重排模型：从“命中”到“让位”
### 基本逻辑
1. 拖动时实时得到 `{active, over}`（命中检测）
2. 将 `over.slotId` 视为目标落点
3. 执行“让位/重排”算法，得到新的 layout
4. CSS Grid 负责流动，`motion/react` 负责过渡

### 让位/重排策略（建议先做 MVP）
给出 2 个可选等级，按复杂度递增：

**策略 A（MVP，快速可用）**
- 将 widget 的 `slotId` 视为排序键（比如按 row-major 编码）
- 拖拽 over 时只更新排序（相当于“按槽位排序”）
- 让位行为近似 iOS，但对不同 span 的精细占位不是 100% 还原

**策略 B（更像 iOS，稳定占位）**
- 维护一个“占用网格”（occupancy map）
- 将目标 slot 作为锚点，尝试放置 active 的 span 占位
- 发生冲突时对冲突 items 做 BFS/最近空位搬移（形成“空位”）
- 输出一个稳定 layout（空间记忆强，重排更可控）

> 推荐路线：先做策略 A 验证产品形态，再决定是否投入策略 B。

## Widget 尺寸变化（Resize）
### 交互
- 仅编辑模式可调整尺寸。
- resize 本质是修改 `colSpan/rowSpan`，随后触发一次重排（策略 A/B）。

### 尺寸档位（建议）
- Small: 1x1 / 2x2（按你的视觉密度选择）
- Medium: 2x2 / 3x2
- Large: 4x3
- Wide: 6x2
- Tall: 3x4

## 组（文件夹）行为
### 创建组
拖动一个 widget 到另一个 widget 上方，进入 `over` 状态时展示“可合并”提示，释放后合并：
- 新建 `group`（容器 widget）
- 把两个 widget 的 `groupId` 设为该 group
- 主画布上用 group tile 替换原位置（slotId 取被覆盖者或更靠前者）

### 组 tile（折叠态）
- 显示名称 + 数量角标
- 显示 3-4 个缩略预览（内部 widget 的 icon/mini snapshot）

### 打开组（复用 stack）
点击 group tile：
- push 一个 stack item（例如 `project-group-panel`）
- 在 stack panel 中渲染组内 grid（同样用 dnd-kit + CSS Grid）
- 关闭 stack 返回主画布，焦点回到 group tile

### 移出/解散
- 组内拖出：将 widget 的 `groupId` 置空，并插入主画布（可用“最近空位”规则）
- 一键解散：把组内全部 widget 放回主画布，删除 group

## 编辑模式与日常模式
### 日常模式
- 点击打开（文件/链接/日历等）
- 不允许拖拽与 resize

### 编辑模式
- 显示拖拽手柄与 resize 角
- 允许多选、对齐、删除
- 可显示网格辅助线（可选）

## 持久化
按项目保存：
- 主画布：widgets + layoutByBreakpoint
- groups：group 列表 + 组内 layoutByBreakpoint
- editMode 不需要持久化（临时 UI 状态）

## 可访问性（最低要求）
- KeyboardSensor：可在键盘下完成移动与放置
- aria 描述：告诉用户当前 over 的目标/组
- 关闭 stack 后焦点回到触发按钮（group tile）

## 实施里程碑（建议）
1. 主画布：CSS Grid + widget 渲染 + 仅点击使用
2. 编辑模式：dnd-kit 拖拽 + 目标命中高亮
3. 重排策略 A：拖动时实时重排 + motion 布局过渡
4. 组：拖叠合并 + stack 打开组面板
5. resize：尺寸档位 + 重排 + 持久化
6. （可选）重排策略 B：占用网格 + 空位搬移

## 风险与注意点
- dnd-kit 不提供布局算法：我们必须明确“slot/占位/让位”的规则，否则会出现“空间记忆不稳定”。  
- CSS Grid `dense` 会改变视觉顺序：必须以我们自己的 layout 为准，避免用户觉得“东西自己乱跑”。  
- 组与拖拽合并需要防误触：建议加入 hover 延迟或释放确认。
