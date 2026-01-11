# Project 首页方案（react-grid-layout）

## 概述
Project 首页是一个类桌面的可视化画布，基于 `react-grid-layout`（RGL）构建。用户可以把文件、文件夹、日历、链接等组件放到网格上，自由调整大小与位置，并将多个组件合并为“组”（类似 iOS 的 App 文件夹）。组的打开/关闭复用现有的 tab stack 逻辑，保证与现有面板行为一致。

## 目标
- 桌面式、可扫读的仪表盘体验。
- 组件可拖拽、可缩放、可自由布局。
- 组件分组行为像 iOS 文件夹：折叠为单卡片，打开后展示组内内容。
- 复用现有 stack 打开逻辑，保持交互一致。

## 非目标
- 不替代完整的文件管理器或日历应用。
- 暂不考虑协作与多用户布局。

## 交互原则
- 保持空间记忆：组件关闭后回到原位。
- 编辑动作明确：仅在编辑模式允许拖拽/缩放。
- 首页是画布，不是列表。

## 网格系统（RGL）
- 使用 `ResponsiveGridLayout`。
- 建议断点与列数：
  - `lg` (1200+): 12 列
  - `md` (996): 10 列
  - `sm` (768): 6 列
  - `xs` (480): 4 列
  - `xxs` (0): 2 列
- `rowHeight`: 24（可根据密度调整）
- `margin`: [12, 12]
- `containerPadding`: [16, 16]
- `compactType`: null（避免自动压缩）
- `preventCollision`: true（仅编辑模式）
- 拖拽手柄：仅在编辑模式显示，避免误拖
- Resize 仅在编辑模式启用

## 组件类型（MVP）
- 文件夹组件：展示最近文件 + 打开
- 文件组件：预览 + 打开
- 日历组件：今日 + 近期
- 网页链接组件：标题 + 打开
- 待办组件：快速勾选
- 快捷动作组件：新建/快捷入口
- 项目概览组件：摘要指标
- 搜索组件：项目内快速搜索

## 尺寸档位
- Small: 2x2
- Medium: 3x2
- Large: 4x3
- Wide: 6x2
- Tall: 3x4

## 组件分组（文件夹）行为
- 创建分组：拖一个组件到另一个组件上触发合并。
- 组（折叠态）卡片：
  - 显示名称 + 数量角标
  - 展示 3-4 个缩略图
- 打开组：
  - 触发 stack item（复用现有 stack 逻辑）打开组视图
  - 保持与组卡片位置的视觉关联
- 组视图（展开态）：
  - 内部使用嵌套 RGL 网格
  - 支持拖拽、缩放、移出
- 移出组件：拖出或在组内操作
- 解散分组：一键将组内组件放回主画布

## 复用 Stack 的打开逻辑
- 打开组会 push 一个 stack item（例如 `project-group-panel`）。
- stack panel 承载组内网格视图。
- 关闭 stack item 回到主画布。
- 与浏览器/文件查看等 stack 行为一致。

## 交互流程
- 添加组件
  1. 打开组件库
  2. 选择组件
  3. 自动放置到网格
  4. 可选配置
- 编辑布局
  1. 进入编辑模式
  2. 拖拽/缩放
  3. 保存布局
- 合并为组
  1. 拖拽组件叠放
  2. 确认合并
  3. 组卡片替换原组件
- 打开组
  1. 点击组卡片
  2. stack 打开组视图
  3. 关闭返回

## 状态模型（高层）

```ts
export type ProjectWidgetType =
  | "file"
  | "folder"
  | "calendar"
  | "link"
  | "todo"
  | "quick-action"
  | "overview"
  | "search"
  | "group";

export type ProjectWidget = {
  id: string;
  type: ProjectWidgetType;
  title: string;
  config: Record<string, unknown>;
  layoutByBreakpoint: Record<string, RGL.Layout>;
  groupId?: string | null;
};

export type ProjectGroup = {
  id: string;
  title: string;
  widgetIds: string[];
  layoutByBreakpoint: Record<string, RGL.Layout>;
};
```

## 持久化
- 按项目保存布局与组件状态。
- 各断点独立布局。
- 组内容与组内布局独立保存。

## 空状态与模板
- 提供默认布局（4-6 个组件）。
- 提供模板：工作/仪表盘/极简。

## 可访问性
- 键盘导航：方向键聚焦组件，Enter 打开。
- 编辑模式支持快捷键切换。
- 关闭组后，焦点返回组卡片。

## 迁移说明
- 以 RGL 替换现有 Puck 方案。
- 现有内容尽量映射为组件。
- 配置兼容或升级版本化。

## 待确认问题
- 是否允许“组内再建组”。
- 移动端是否全宽堆叠，还是维持网格缩放。
- 默认布局的必选组件清单。
