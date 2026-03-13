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

- 面板容器优先复用统一圆角、边框、背景。**不使用 box-shadow**，通过透明度分层建立层次。
- 面板头部操作保持位置稳定（刷新、最小化、关闭）。
- overlay/floating 与 base panel 使用同一材质家族。

护栏：

- 关闭/最小化行为必须有可预期反馈。
- 不允许面板层级遮挡核心交互入口。
- 面板、卡片、输入框统一 `shadow-none`。

## 6. Inputs and Menus

适用对象：

- 输入框、下拉菜单、上下文菜单

原则：

- 输入控件在同一页面保持尺寸与圆角一致。**输入框禁止 box-shadow**，使用 `shadow-none`，聚焦时仅通过边框色变化反馈。
- 菜单的 hover/active 反馈保持轻量，不做重动效。

护栏：

- focus 态必须可见（通过 border 变化，不依赖 ring/shadow）。
- 禁止依赖颜色唯一表达错误/警告状态。
- 输入框 focus 样式：`focus-visible:ring-0 focus-visible:shadow-none focus-visible:border-border/70`。

## 7. Dialog

适用对象：

- `packages/ui/src/dialog.tsx`（基础 Dialog）
- `packages/ui/src/alert-dialog.tsx`（AlertDialog）
- 所有业务弹窗

### 基础组件（`DialogContent`）

已在 `packages/ui/src/dialog.tsx` 中统一的属性：

- `rounded-xl` — 大圆角，与全站胶囊语法对齐
- `shadow-none` — **禁止 box-shadow**，通过 overlay 背景（`bg-black/50`）建立层次
- `border` — 细描边分割弹窗与背景
- 关闭按钮：`focus-visible:ring-0 focus-visible:shadow-none focus-visible:border-border/70`，不使用 ring

### 结构规范

Dialog 遵循四区结构，每区可选但顺序固定：

- **DialogTitle**：必须存在（无障碍要求）。简洁明确，如”项目重命名”、”删除确认”。
- **DialogDescription**：仅在需要补充说明时使用。简单弹窗（如重命名）**省略 Description**，避免冗余。
- **Body**：表单字段使用堆叠布局（label 在上、input 在下），**不使用 `grid-cols-4` 横向排列**。间距 `gap-2 py-2`。
- **DialogFooter**：取消按钮 `variant=”outline”`，主操作按钮使用语义扁平色。

### 按钮分类与形态

按钮分为两大类，视觉权重不同：

#### Action 按钮（操作型）

触发实际动作的按钮（保存、创建、删除、打开、检查等）。**必须**使用：

- `rounded-full` — 胶囊圆角
- 语义扁平色背景 — 通过颜色传达操作性质
- `shadow-none` — 禁止阴影
- `transition-colors duration-150` — 统一过渡

#### View 按钮（查看/导航型）

仅用于查看信息、跳转链接的按钮（查看日志、查看文档等）。**必须**使用：

- `variant=”ghost”` — 无背景
- `rounded-full` — 胶囊圆角
- `text-muted-foreground` — 低视觉权重
- `shadow-none` — 禁止阴影

View 按钮不需要语义色彩，保持低调以突出 Action 按钮。

### 按钮语义色彩

Action 按钮的颜色由操作语义决定，**禁止所有按钮都用无色 ghost**：

| 语义       | 令牌    | 用法                                                                           |
|-----------|---------|-------------------------------------------------------------------------------|
| 主操作     | blue    | `rounded-full bg-ol-blue-bg text-ol-blue hover:bg-ol-blue-bg-hover shadow-none` |
| 危险操作   | red     | `rounded-full bg-ol-red-bg text-ol-red hover:bg-ol-red-bg-hover shadow-none`    |
| 确认/成功  | green   | `rounded-full bg-ol-green-bg text-ol-green hover:bg-ol-green-bg-hover shadow-none` |
| 调试/代码  | purple  | `rounded-full bg-ol-purple-bg text-ol-purple hover:bg-ol-purple-bg-hover shadow-none` |
| 测试/实验  | amber   | `rounded-full bg-ol-amber-bg text-ol-amber hover:bg-ol-amber-bg-hover shadow-none` |
| 中性操作   | neutral | `rounded-full bg-ol-surface-muted text-ol-text-auxiliary hover:bg-muted shadow-none` |
| 次要操作   | —       | `variant=”outline”` 或 `variant=”ghost”`，同组内至少一个按钮带色                    |

也可直接使用 `semantic-tokens.ts` 中的预组合常量（如 `OL_BLUE.button`）。

**完整令牌定义**见 `apps/web/src/index.css`（CSS 变量）和 `apps/web/src/styles/semantic-tokens.ts`（TS 常量）。

### 按钮通用公式

所有扁平色按钮遵循统一公式：

同一组操作中，主操作与次要操作应有明确视觉层级差异。

### 表单布局

- **简单表单**（1-2 个字段）：堆叠式，label 在上、input 在下，`gap-2`。
- **带图标选择**的表单：图标按钮在左，输入框在右，`flex items-center gap-3`。图标按钮使用 `variant=”ghost”` + emoji 或默认占位图标（如 `SmilePlus`），点击弹出 Popover 内嵌 EmojiPicker。
- **多字段表单**：每个字段独立一行堆叠，字段间 `gap-4`。Switch 类控件使用 `flex items-center gap-3`。
- **禁止** `grid grid-cols-4 items-center gap-4` 的 label-左 input-右 横向布局。

### Input 样式

Dialog 内所有 Input 统一添加：

### 状态重置时机

**多步骤 Dialog 状态重置时机**：内部步骤/表单状态必须在**打开时**重置，**禁止在关闭时重置**。关闭时重置会导致关闭动画（~200ms）期间状态闪回到初始步骤。具体做法：

- **自控 Dialog**（组件内部管理 `open` state）：提取 `openDialog()` 函数，同时 reset 状态并 `setOpen(true)`；`onOpenChange` 关闭时只 `setOpen(false)`。
- **受控 Dialog**（`open` 从 props 传入）：用 `useEffect(() => { if (open) reset() }, [open])` 在打开时自动 reset。
- 如果需要关闭后清理副作用（如取消请求），使用 `setTimeout` 延迟至动画结束后执行。

### 参考实现

- 重命名弹窗：`ProjectTree.tsx`（带图标选择 + 输入框）
- 关闭确认弹窗：`CloseConfirmDialog.tsx`（AlertDialog + Checkbox）
- 图标选择器：`ProjectBasicSettings.tsx`（Popover + EmojiPicker）

## 8. Dividers and Separators

适用对象：

- Settings 列表分割线
- 面板内分组分割

原则：

- 分割线使用低透明度，避免视觉噪音：`divide-border/40`（40% 透明度）。
- 禁止使用全不透明 `divide-border`，视觉过重会破坏呼吸感。
- 分割线仅用于同级元素间的视觉分组，不用于层级分割（层级用间距和背景区分）。

护栏：

- Settings 页面列表项之间统一使用 `divide-y divide-border/40`。
- Dark 模式下分割线同样保持低透明度。

## 9. Settings Item Pattern

适用对象：

- `apps/web/src/components/setting/menus/*`
- 所有设置页面的配置项

### Setting Icon

每个设置项前可带语义图标徽章，使用统一的 `SettingIcon` 模式：

- 外层容器：`h-5 w-5 rounded`（小圆角方块）
- 内层图标：`h-3 w-3`
- 背景色与前景色使用语义扁平色（与按钮色系一致）

语义色彩映射（使用 `ol-*` 设计令牌，自动适配 light/dark）：

| 语义         | bg                 | fg                |
|-------------|--------------------|--------------------|
| 版本/信息    | `bg-ol-blue/10`    | `text-ol-blue`     |
| 安全/许可    | `bg-ol-green/10`   | `text-ol-green`    |
| 调试/代码    | `bg-ol-purple/10`  | `text-ol-purple`   |
| 警告/实验    | `bg-ol-amber/10`   | `text-ol-amber`    |
| 危险/删除    | `bg-ol-red/10`     | `text-ol-red`      |
| 中性/系统    | `bg-ol-surface-muted` | `text-ol-text-auxiliary` |

令牌自动切换 light/dark 模式，无需 `dark:` 前缀。

### Settings 行布局

Settings 配置项使用扁平 flex 布局：

- Icon + 标题 + 操作控件在同一行
- 使用 `gap-2` 控制间距（不要过宽）
- 标题区 `flex-1 min-w-0` 自适应宽度

### 参考实现

- `AboutOpenLoaf.tsx`：完整的 SettingIcon + 扁平色按钮 + 分割线示例

## 10. Motion and State

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

## 11. Dark Mode Consistency

适用对象：

- 全站组件

原则：

- dark 模式为一等公民，不做“亮色迁移后补”。
- 使用 token 映射，不手工散落 dark 颜色。
- 保持透明层与阴影在 dark 下仍有可辨层次。

护栏：

- 任何新增组件需同时定义 light/dark 表达。

## 12. Domain-Specific Application Notes

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
