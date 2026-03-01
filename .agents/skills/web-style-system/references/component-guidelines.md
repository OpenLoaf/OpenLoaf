# Component Guidelines (Full-Site)

本文件定义“全站强一致”的落地规则，表达方式为“原则优先 + 护栏指标”。

## 1. Shell Layout

适用对象：

- `Header`
- `Sidebar`
- `MainContent`
- `TabLayout`

原则：

- 使用稳定骨架分层：顶部导航、侧边导航、主内容区。
- 控制显隐使用状态与过渡，不做结构跳变。
- 宽度变化优先平滑插值，避免硬切。

护栏：

- 折叠/展开必须有清晰状态反馈。
- 可交互区域不得被 `drag` 区误吞（Electron 场景）。

## 2. Header and Header Tabs

适用对象：

- `Header.tsx`
- `HeaderTabs.tsx`
- `packages/ui/src/animated-tabs.tsx`

原则：

- 保持高密度、低视觉负担导航语法。
- active tab 强调可见，但不压制同层信息。
- 支持拖拽、固定、关闭、历史切换时保持视觉稳定。

护栏：

- active/inactive/focus 必须可区分。
- 单个 tab 内容过长时必须可截断。

## 3. Dock Tabs (Expandable Pattern)

适用对象：

- `ExpandableDockTabs`
- 其他需要“图标主导 + 文本展开”的 tabs/dock

原则：

- 以胶囊为主形态。
- 以 icon 为默认入口，label 由 active 态展开。
- 空间受限时先折叠表达，不移除入口。

护栏：

- 展开与收起动效节奏一致。
- stack 入口在窄空间必须可达（icon 或 count badge）。

## 4. Sidebar Menu and Secondary Navigation

适用对象：

- `layout/sidebar/*`
- 其他二级导航、菜单列表

原则：

- 主图标 + 文本 + 可选快捷键提示形成统一行语法。
- hover/focus 时增强可感知性，但避免过度闪烁。
- 选中态使用语义背景与前景对比，不依赖单一颜色。

护栏：

- 图标按钮需可键盘聚焦。
- 文本与背景对比保持可读。

## 5. Panel Frame and Content Containers

适用对象：

- `LeftDock`
- `StackHeader`
- 业务面板容器（file/chat/board/project/settings 等）

原则：

- 面板容器优先复用统一圆角、边框、背景与阴影。
- 面板头部操作保持位置稳定（刷新、最小化、关闭）。
- overlay/floating 与 base panel 使用同一材质家族。

护栏：

- 关闭/最小化行为必须有可预期反馈。
- 不允许面板层级遮挡核心交互入口。

## 6. Inputs, Dialogs, Menus

适用对象：

- 输入框、下拉菜单、上下文菜单、弹窗

原则：

- 输入控件在同一页面保持尺寸与圆角一致。
- 对话框优先遵循“标题-描述-主体-动作区”结构。
- 菜单的 hover/active 反馈保持轻量，不做重动效。

护栏：

- focus 态必须可见。
- 禁止依赖颜色唯一表达错误/警告状态。
- **多步骤 Dialog 状态重置时机**：内部步骤/表单状态必须在**打开时**重置，**禁止在关闭时重置**。关闭时重置会导致关闭动画（~200ms）期间状态闪回到初始步骤。具体做法：
  - **自控 Dialog**（组件内部管理 `open` state）：提取 `openDialog()` 函数，同时 reset 状态并 `setOpen(true)`；`onOpenChange` 关闭时只 `setOpen(false)`。
  - **受控 Dialog**（`open` 从 props 传入）：用 `useEffect(() => { if (open) reset() }, [open])` 在打开时自动 reset。
  - 如果需要关闭后清理副作用（如取消请求），使用 `setTimeout` 延迟至动画结束后执行。

## 7. Motion and State

适用对象：

- 所有交互组件

原则：

- 动效承担“状态沟通”职责。
- 使用少量关键动效替代大面积碎片动效。
- 遵守同模块统一曲线与时长。

护栏：

- 主要过渡优先 `0.16s ~ 0.24s`。
- 避免大位移与长时动画影响可用性。
- 需考虑 reduced-motion 退化。

## 8. Dark Mode Consistency

适用对象：

- 全站组件

原则：

- dark 模式为一等公民，不做“亮色迁移后补”。
- 使用 token 映射，不手工散落 dark 颜色。
- 保持透明层与阴影在 dark 下仍有可辨层次。

护栏：

- 任何新增组件需同时定义 light/dark 表达。

## 9. Domain-Specific Application Notes

建议优先级：

1. `layout + tabs + dock`
2. `project + file + chat`
3. `board + desktop + settings`
4. 其余模块

当前基线采样排除：

- 邮箱页
- 技能页

说明：

- 排除仅针对“基线抽样”，不代表不适用规范。
