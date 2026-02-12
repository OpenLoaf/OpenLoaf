# Style DNA: Layout + Tabs + Dock

## Source Files

- `apps/web/src/components/ui/ExpandableDockTabs.tsx`
- `apps/web/src/components/layout/header/HeaderTabs.tsx`
- `packages/ui/src/animated-tabs.tsx`
- `apps/web/src/components/layout/LeftDock.tsx`
- `apps/web/src/index.css`

## 1. Visual Material Language

### Glass Capsule Surface

主容器语法：

- 大圆角胶囊（如 `rounded-3xl`）
- 半透明背景（如 `bg-white/40`、dark 下深色透明）
- 细描边（light/dark 各有透明度）
- 柔和大阴影（不追求锐利高对比）
- 背景模糊与饱和度增强（`backdrop-blur` + `backdrop-saturate`）

表达目标：

- 让控件浮在内容之上，但不压过内容。
- 突出层次，不制造强噪声。

## 2. Geometry and Sizing Rhythm

`ExpandableDockTabs` 尺寸系统（母版）：

- `sm`: `height 34`, `activeWidth 104`, `inactiveWidth 35`
- `md`: `height 37`, `activeWidth 116`, `inactiveWidth 39`
- `lg`: `height 40`, `activeWidth 129`, `inactiveWidth 42`

关键几何模式：

- 激活项扩展宽度，非激活项保持紧凑图标态
- icon + label 在激活态展开，非激活态收敛
- 分隔线用于“功能区切换”，而非纯装饰

## 3. Color Strategy

全局基底：

- 依赖 `index.css` 中的中性 token（`--background`, `--foreground`, `--sidebar-*`）
- 保持低饱和中性背景作为主承载层

局部强调：

- tabs tone 使用低透明彩色背景 + 对应文字色（`sky/emerald/amber/violet/slate`）
- 彩色只承载状态识别，不做大面积背景

## 4. Motion Grammar

动效语法（母版）：

- 主切换时长集中在 `0.18~0.22s`
- 宽度切换使用短时长 easeOut
- 细节交互（hover/nudge/button）使用 spring
- 出入场以 `opacity + y + scale` 小幅组合为主

动效目标：

- 明确状态变化
- 保持轻盈，不拖慢操作节奏

## 5. Information Density Handling

空间不足时的退化策略：

1. 展示可见 stack icon
2. 不足时退化为数量 badge（`+N`）
3. 通过 tray 展开隐藏项

原则：

- 先折叠表现，不直接丢失信息入口。
- 用 tooltip 补足标签语义。

## 6. Header Tabs Syntax

`HeaderTabs` 语法特征：

- 轨道与 tab 高度较小（`h-7`），偏高密度
- active tab 用浅底高亮，不使用重阴影
- 支持历史前进后退、固定与普通 tab 分区、拖拽重排
- 运行态可叠加“思考边框”状态，不破坏主结构

## 7. Do / Don't

### Do

- 保持胶囊、透明层、柔和阴影的一致组合。
- 优先使用 token 与语义色，而非魔法色值。
- 保持 tabs 与 dock 的状态语法一致（active/inactive/hover/focus）。
- 优先通过布局密度和层次解决信息拥挤。

### Don't

- 不要在同一导航区混用多种完全不同圆角体系。
- 不要用高饱和大色块覆盖整个导航容器。
- 不要把动效时长拉长到影响操作节奏。
- 不要把“异常页面样式”反向当作主设计基线。
