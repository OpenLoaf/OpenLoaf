---
name: web-layout-structure
description: Use when working on or debugging the web app layout in apps/web/src/components/layout, including header, sidebar, single-view split, left dock stack panels, right chat panel, or layout gates.
---

# Web Layout Structure（apps/web/src/components/layout）

> **术语映射**：代码 `workspace` = 产品「工作空间」（顶层容器），代码 `project` = 产品「项目」（项目文件夹）。

## Overview
单视图架构：没有多 Tab，没有多 Session，没有独立 React Root。一个全局视图 + 一个布局状态，左右面板作为普通 React 子组件直接渲染，通过侧边栏导航切换。

## When to Use
- 需要调整全局布局（Header / Sidebar / 主内容区）
- 需要改动左右分栏、拖拽宽度、聊天面板折叠/展开
- 需要理解 LeftDock 的 base + stack 叠加逻辑
- 需要定位 Loading / Gate / Providers 导致的渲染阻塞
- **维护规则**：只要修改了上述布局相关文件或逻辑，必须第一时间同步更新本 skill。

---

## Architecture Overview

### 组件树

```
RootLayout (layout.tsx)
└── Providers (ThemeProvider, QueryClient, MotionConfig, ...)
    └── ServerConnectionGate
        └── StepUpGate
            └── Page (page.tsx)
                ├── AppBootstrap              ← 初始化：首次加载调用 navigate()
                └── SidebarProvider
                    ├── Header                ← 顶栏
                    ├── AppSidebar            ← 侧边栏导航
                    └── MainContent           ← initialized → TabLayout
                        └── TabLayout         ← 核心布局容器
                            ├── Left (motion.div)
                            │   └── PanelErrorBoundary
                            │       └── TabActiveProvider
                            │           └── LeftDock
                            │               ├── base 面板
                            │               ├── stack 浮层
                            │               └── DockTabs 底部栏
                            ├── Divider (拖拽分割线)
                            └── Right (motion.div)
                                └── PanelErrorBoundary
                                    └── TabActiveProvider
                                        └── RightChatPanel
                                            └── Chat
```

### 数据流

```
Sidebar → navigate() / openPrimaryPageTab()
              ↓
  useAppView (视图状态) + useLayoutState (布局状态)
              ↓
  TabLayout 读取状态 → 计算左右面板宽度 → 直接渲染子组件
```

### 渲染特点

1. **纯 React 组件树** — 左右面板是 TabLayout 的直接子组件，继承主应用全部 Provider（ThemeProvider、QueryClient 等），无 `createRoot()` 独立树
2. **精确 selector 订阅** — TabLayout 和 LeftDock 用 `useLayoutState(s => s.base)` 等精确 selector，而非整个 state 对象。chatSessionId 变化不会触发 TabLayout 重渲染
3. **始终挂载** — 左右面板始终在 DOM 中，通过 CSS `opacity` + `pointerEvents` 控制可见性，切换页面不销毁/重建组件
4. **TabActiveProvider** — 向子组件广播面板是否活跃。Terminal、Browser、Project 通过 `useTabActive()` 读取
5. **PanelErrorBoundary** — 左右面板各自包裹错误边界，渲染崩溃时显示"重新加载面板"按钮

---

## Two Core Stores

### `useAppView`（视图状态）
- 文件：`apps/web/src/hooks/use-app-view.ts`
- 持久化 key：`openloaf:app-view`（localStorage / sessionStorage）

```typescript
interface AppViewState {
  chatSessionId: string           // 当前聊天会话 ID
  chatParams: Record<string, unknown>  // 聊天参数（如 projectId）
  chatLoadHistory: boolean        // 是否加载聊天历史
  projectShell: ProjectShellState | null  // 项目壳状态
  title: string                   // 显示标题
  icon: string                    // 显示图标
  initialized: boolean            // 视图是否已初始化

  navigate(input: NavigateInput): void  // 完整重置并导航到新视图
  setChatSession(id, loadHistory?): void
  setChatParams(patch): void
  setProjectShell(shell): void
  setTitle(title): void
  setIcon(icon): void
}
```

**`navigate()`** 是最重要的方法：
1. 设置所有视图字段 + `initialized = true`
2. 调用 `useLayoutState.getState().applyNavigation()` **一次性**重置并设置布局

### `useLayoutState`（布局状态）
- 文件：`apps/web/src/hooks/use-layout-state.ts`
- 持久化 key：`openloaf:layout-state`

```typescript
interface LayoutState {
  base?: DockItem               // 左面板底层组件
  stack: DockItem[]             // 左面板叠加层（board-viewer, terminal 等）
  leftWidthPercent: number      // 左面板宽度百分比
  minLeftWidth?: number         // 左面板最小宽度 (px)
  rightChatCollapsed?: boolean  // 右聊天面板是否折叠
  stackHidden?: boolean         // stack 是否最小化
  activeStackItemId?: string    // 活跃的 stack 项 ID
}
```

**关键方法**：
- `applyNavigation({ base, leftWidthPercent, rightChatCollapsed })` — 一次性重置并设置布局（单次 normalize）
- `setBase()` / `pushStackItem()` / `removeStackItem()` / `clearStack()` — 增量修改

**`normalize()` 函数**：每次 `set` 都通过 normalize 确保状态一致：
- 有 base 但 leftWidthPercent=0 → 自动改为 `LEFT_DOCK_DEFAULT_PERCENT`（30%）
- 无 base 无 stack → leftWidthPercent 强制为 0
- 无 base → rightChatCollapsed 强制为 false

### `useAppState()`（组合 hook）
- 文件：`apps/web/src/hooks/use-app-state.ts`
- 合并 useAppView + useLayoutState 的关键字段
- **注意**：订阅 14 个字段，适用于需要完整状态的场景。高频渲染组件应使用精确 selector 直接订阅

---

## Layout Entry Points

### page.tsx（页面骨架）
```
<AppBootstrap />          ← 只在 initialized=false 时触发 navigate()
<SidebarProvider>
  <Header />
  <AppSidebar />
  <MainContent />         ← initialized=true 时渲染 <TabLayout />
</SidebarProvider>
```

### AppBootstrap
- 文件：`apps/web/src/components/layout/AppBootstrap.tsx`
- 首次加载（initialized=false）时调用 `navigate()` 设置默认 AI 助手视图
- 项目窗口模式下调用 `openProjectShell()` 进入项目
- initialized=true 时不做任何事

### MainContent
- 文件：`apps/web/src/components/layout/MainContext.tsx`
- `initialized=false` → 显示 "Loading..."
- `initialized=true` → 渲染 `<TabLayout />`

---

## TabLayout（核心布局容器）

文件：`apps/web/src/components/layout/TabLayout.tsx`

### DOM 结构
```
div[data-slot="tab-layout"]  (flex 容器，pointer 事件接收)
├── motion.div (左面板容器，宽度由 splitPercent spring 驱动)
│   └── div (pointerEvents 控制)
│       └── PanelErrorBoundary
│           └── TabActiveProvider active={isLeftVisible}
│               └── LeftDock tabId="main"
├── motion.div (分割线，可拖拽 col-resize)
└── motion.div (右面板容器，flex-1)
    └── div (pointerEvents 控制)
        └── PanelErrorBoundary
            └── TabActiveProvider active={isRightVisible}
                └── RightChatPanel → Chat
```

### 三种布局模式

```
模式 1: 纯聊天 (leftWidthPercent = 0)
┌──────────────────────────────────┐
│          RightChatPanel          │
│            (Chat)                │
│           width: 100%            │
└──────────────────────────────────┘

模式 2: 左满屏 (shouldDisableRightChat = true)
┌──────────────────────────────────┐
│           LeftDock               │
│    (项目空间/画布列表/设置/...)     │
│           width: 100%            │
└──────────────────────────────────┘

模式 3: 左右分栏 (项目 + 聊天)
┌──────────────────┬─┬─────────────┐
│    LeftDock      │ │ RightChat   │
│  (plant-page)    │ │  (Chat)     │
│   30~70%         │ │  剩余空间    │
│  min: 680px      │ │ min: 360px  │
└──────────────────┴─┴─────────────┘
                   ↑ 拖拽分割线
```

### 宽度计算逻辑

```javascript
hasLeftContent = Boolean(base) || stack.length > 0
storedLeftWidthPercent = hasLeftContent ? leftWidthPercent : 0
isRightChatDisabled = shouldDisableRightChat(layoutSnapshot)
isRightCollapsed = Boolean(base) && (isRightChatDisabled || rightChatCollapsed)

isLeftVisible  = storedLeftWidthPercent > 0
isRightVisible = !isRightCollapsed

// splitPercent 使用 motion/react 的 useSpring 驱动（stiffness:140, damping:30）
// 拖拽时 splitPercent.jump() 直接更新，非拖拽时 spring 动画过渡
```

### shouldDisableRightChat（隐藏右聊天面板的页面）
- 定义在 `layout-utils.ts`
- 返回 true 的前景组件：
  - `settings-page`, `project-settings-page`
  - `project-list-page`, `workbench-page`, `canvas-list-page`
  - 文件预览类（`file-viewer`, `code-viewer`, `markdown-viewer` 等）
  - 项目壳内的 `board-viewer`（`projectShell.section === "canvas"`）
  - `plant-page` 的 `index` / `canvas` / `files` / `tasks` 子页

### TabLayout 订阅模式
TabLayout 使用精确 selector 订阅，避免不必要的重渲染：
```typescript
const base = useLayoutState((s) => s.base)
const stack = useLayoutState((s) => s.stack)
const leftWidthPercent = useLayoutState((s) => s.leftWidthPercent)
const chatParams = useAppView((s) => s.chatParams)
const projectShell = useAppView((s) => s.projectShell)
// ... 只订阅实际使用的字段
```

---

## LeftDock（Base + Stack）

文件：`apps/web/src/components/layout/LeftDock.tsx`

### 结构
```
LeftDock
├── base 层：renderDockItem(base)
│   └── 各种页面组件：project-list-page, workbench-page, plant-page, canvas-list-page...
├── stack 叠加层（只显示 activeStackId）
│   └── PanelFrame → StackHeader + renderDockItem(stackItem)
│       └── board-viewer, terminal, browser, tool-result 等
├── ProjectDockTabs (base=plant-page 时，项目底部导航)
└── GlobalEntryDockTabs (base=calendar/email/tasks/workbench 时，全局底部导航)
```

### LeftDock 订阅模式
LeftDock 只订阅 `useLayoutState`，不依赖 `useAppView`：
```typescript
const base = useLayoutState((s) => s.base)
const stack = useLayoutState((s) => s.stack) ?? []
const stackHidden = Boolean(useLayoutState((s) => s.stackHidden))
const activeStackItemId = useLayoutState((s) => s.activeStackItemId)
```

### 重要参数
| 参数 | 说明 |
|------|------|
| `__customHeader` | 自定义 Header（不渲染 StackHeader） |
| `__refreshKey` | 强制 remount 面板 |
| `__opaque` | 使用纯背景 |
| `__isStreaming` | AI 正在思考时显示动画边框 |
| `__restoreStackHidden` | 关闭此 stack 项时恢复最小化状态 |

### Stack 行为
- `pushStackItem` 添加/更新 stack 项，自动显示 stack
- `removeStackItem` 移除 stack 项，支持 board 全屏退出恢复
- `clearStack` 清空所有 stack 项
- `stackHidden` 最小化 stack（保持 DOM 挂载），ESC 触发
- BrowserWindow / TerminalWindow 是特殊的 singleton stack 项

---

## RightChatPanel

定义在 `TabLayout.tsx` 内的 `RightChatPanel` 函数组件。

### 职责
- 渲染单个 `<Chat>` 组件（单会话，无多会话切换）
- 同步 board 画布的聊天会话
- 记录实体访问（recordEntityVisit）
- 根据 chatParams.projectId 自动创建/更新 plant-page base

---

## Navigation（导航方式）

| 方式 | 触发者 | 行为 |
|------|--------|------|
| `navigate()` | Sidebar 主入口、项目 shell、openTempChat | 全量重置：调用 `applyNavigation()` 一次性清空 stack、重设 base/width/collapsed，新建 session |
| `setBase()` + `clearStack()` | Sidebar `openPrimaryPageTab()` | 轻量切换：只换 base 面板，`normalize()` 自动修正宽度。**不调用 navigate**，不重置 session |
| `pushStackItem()` | AI 工具、用户操作 | 叠加浮层到 stack，不影响 base |
| `setChatSession()` | 侧边栏历史 `openChat()` | 只切换聊天 session |

---

## Header

文件：`apps/web/src/components/layout/header/Header.tsx`

- 左侧：侧边栏开关 + 设置入口
- 中间：`PageTitle`（从 useAppView 读取 title）
- 右侧：`StackDockMenuButton`、`ModeToggle`、聊天面板开关
- 设置页可见时高亮设置按钮、隐藏 chat 开关
- 项目壳场景下标题回退到 `projectShell.title`

## Sidebar

文件：`apps/web/src/components/layout/sidebar/Sidebar.tsx`

- 使用 `@openloaf/ui/sidebar`
- 窄屏（<900px）隐藏侧边栏
- 项目模式通过 `resolveProjectModeProjectShell()` 判断，切换为 `ProjectSidebar`
- 普通 Sidebar 与 ProjectSidebar 切换动画只切内部内容，外壳不变
- 历史列表平铺显示，隐藏项目类型记录，默认按首次访问时间排序

---

## Loading / Gates
- `ServerConnectionGate`：等待后端健康检查成功
- `StepUpGate`：等待基础配置完成
- `LoadingScreen`：统一加载屏
- `AutoUpdateGate`：更新提示弹窗

---

## Key State Sources

| Store | 文件 | 职责 |
|-------|------|------|
| `useAppView` | `hooks/use-app-view.ts` | 视图状态（session、project shell、title） |
| `useLayoutState` | `hooks/use-layout-state.ts` | 布局状态（base、stack、宽度、折叠） |
| `useAppState()` | `hooks/use-app-state.ts` | 组合 hook（合并上述两个 store，14 字段全订阅） |
| `getAppState()` | `hooks/use-app-state.ts` | 非 React 调用 |

- 项目独立窗口使用 `sessionStorage`，主窗口使用 `localStorage`（通过 `isProjectWindowMode()` 判断）

---

## layout-utils.ts 工具函数

文件：`apps/web/src/hooks/layout-utils.ts`

| 函数 | 用途 |
|------|------|
| `shouldDisableRightChat(layout)` | 判断前景页面是否应隐藏右聊天 |
| `getLayoutForegroundComponent(layout)` | 解析当前前景组件（stack优先，回退base） |
| `isSettingsForegroundPage(layout)` | 判断是否在设置页 |
| `getActiveStackItem(layout)` | 获取活跃的 stack 项 |
| `isBoardStackFull(layout)` | 判断画布是否处于全屏模式 |
| `clampPercent(value)` | 限制百分比在 [0, 100] |

常量：
- `LEFT_DOCK_MIN_PX = 680`
- `LEFT_DOCK_DEFAULT_PERCENT = 30`
- `BOARD_VIEWER_COMPONENT = "board-viewer"`

---

## Common Pitfalls
- `openPrimaryPageTab` 不调用 `navigate()`，不会重置 session；如需重置用 `navigate()`
- `normalize()` 会自动设置 leftWidthPercent，直接调 `setBase()` 不需要手动设宽度
- `stackHidden` 与 `stack` 状态不同步，导致面板"看不见但仍拦截点击"
- 修改 `TabLayout` 时忽略 `minLeftWidth` 动画保护，导致宽度抖动
- 高频渲染组件（TabLayout、LeftDock）应使用精确 selector，避免 `useAppState()` 导致的过度订阅
- `applyNavigation()` 是原子操作（单次 normalize），不要拆成多次 set 调用

## Quick File Map
- `apps/web/src/app/layout.tsx` — RootLayout + Providers
- `apps/web/src/app/page.tsx` — 页面骨架
- `apps/web/src/components/layout/AppBootstrap.tsx` — 初始化
- `apps/web/src/components/layout/MainContext.tsx` — initialized 门控
- `apps/web/src/components/layout/TabLayout.tsx` — 核心布局 + RightChatPanel + PanelErrorBoundary
- `apps/web/src/components/layout/LeftDock.tsx` — 左面板（base + stack）
- `apps/web/src/components/layout/TabActiveContext.tsx` — 面板活跃状态 Context
- `apps/web/src/components/layout/StackHeader.tsx` — 统一面板标题栏
- `apps/web/src/components/layout/header/*` — Header
- `apps/web/src/components/layout/sidebar/*` — Sidebar
- `apps/web/src/hooks/use-app-view.ts` — 视图状态 store
- `apps/web/src/hooks/use-layout-state.ts` — 布局状态 store
- `apps/web/src/hooks/use-app-state.ts` — 组合 hook
- `apps/web/src/hooks/layout-utils.ts` — 布局工具函数
- `apps/web/src/lib/project-shell.ts` — 项目壳导航
- `apps/web/src/hooks/use-sidebar-navigation.ts` — 侧边栏导航动作
- `apps/web/src/lib/globalShortcuts.ts` — 全局快捷键
