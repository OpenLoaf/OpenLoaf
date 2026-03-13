---
name: web-layout-structure
description: Use when working on or debugging the web app layout in apps/web/src/components/layout, including header, sidebar, single-view split, left dock stack panels, right chat panel, panel-runtime, or layout gates.
---

# Web Layout Structure（apps/web/src/components/layout）

> **术语映射**：代码 `workspace` = 产品「工作空间」（顶层容器），代码 `project` = 产品「项目」（项目文件夹）。

## Overview
单视图架构：没有多 Tab，没有多 Session。一个全局视图 + 一个布局状态，通过侧边栏导航切换。

## When to Use
- 需要调整全局布局（Header / Sidebar / 主内容区）
- 需要改动左右分栏、拖拽宽度、聊天面板折叠/展开
- 需要理解 LeftDock 的 base + stack 叠加逻辑
- 需要理解 panel-runtime 独立 React Root 机制
- 需要定位 Loading / Gate / Providers 导致的渲染阻塞
- **维护规则**：只要修改了上述布局相关文件或逻辑，必须第一时间同步更新本 skill。

---

## Architecture Overview

```
Page (page.tsx)
├── AppBootstrap              ← 初始化：首次加载调用 navigate() 设置默认视图
├── SidebarProvider
│   ├── Header                ← 顶栏（标题、设置、主题切换）
│   ├── AppSidebar            ← 侧边栏导航（普通 / 项目模式）
│   └── MainContent           ← 根据 initialized 决定渲染
│       └── TabLayout         ← 核心布局容器（左右分栏）
```

### 数据流

```
Sidebar → navigate() / openPrimaryPageTab()
              ↓
  useAppView (视图状态) + useLayoutState (布局状态)
              ↓
  TabLayout 读取状态 → 计算左右面板宽度 → panel-runtime 渲染面板
```

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
2. 调用 `useLayoutState.getState().resetLayout()` 重置布局
3. 设置 base / leftWidthPercent / rightChatCollapsed

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

**`normalize()` 函数**：每次 `set` 都通过 normalize 确保状态一致：
- 有 base 但 leftWidthPercent=0 → 自动改为 `LEFT_DOCK_DEFAULT_PERCENT`（30%）
- 无 base 无 stack → leftWidthPercent 强制为 0
- 无 base → rightChatCollapsed 强制为 false

### `useAppState()`（组合 hook）
- 文件：`apps/web/src/hooks/use-app-state.ts`
- 合并 useAppView + useLayoutState 的关键字段，供组件消费

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
div[data-slot="tab-layout"]
├── motion.div (左面板容器，宽度由 splitPercent 驱动)
│   └── div ref={leftHostRef}     ← panel-runtime 左 host
├── motion.div (分割线，可拖拽)
└── motion.div (右面板容器，flex-1)
    └── div ref={rightHostRef}    ← panel-runtime 右 host
```

### 宽度计算逻辑

```javascript
hasLeftContent = Boolean(base) || stack.length > 0
storedLeftWidthPercent = hasLeftContent ? leftWidthPercent : 0
isRightChatDisabled = shouldDisableRightChat(appState)
isRightCollapsed = Boolean(base) && (isRightChatDisabled || rightChatCollapsed)

isLeftVisible  = storedLeftWidthPercent > 0
isRightVisible = !isRightCollapsed

// 三种布局模式：
if (!isLeftVisible && isRightVisible)  → 纯聊天（左0% 右100%）— AI 助手
if (isLeftVisible && !isRightVisible)  → 全屏左面板（左100%）— 项目列表、画布列表等
else                                    → 分栏（左N% 右rest）— 项目+聊天
```

### shouldDisableRightChat（隐藏右聊天面板的页面）
- 定义在 `layout-utils.ts`
- 返回 true 的前景组件：
  - `settings-page`, `project-settings-page`
  - `project-list-page`, `workbench-page`, `canvas-list-page`
  - 文件预览类（`file-viewer`, `code-viewer`, `markdown-viewer` 等）
  - 项目壳内的 `board-viewer`（`projectShell.section === "canvas"`）
  - `plant-page` 的 `index` / `canvas` / `files` / `tasks` 子页

---

## panel-runtime（独立 React Root）

文件：`apps/web/src/lib/panel-runtime.tsx`

### 核心设计
左右面板不在 TabLayout 的 React 树中，而是通过 `createRoot` 创建**独立 React 根**。这样面板切换时不需要重新挂载，只改 opacity/pointerEvents。

### 关键 API

| 函数 | 作用 |
|------|------|
| `bindPanelHost(side, host)` | 绑定 DOM 宿主元素，切换宿主时异步清理旧面板 |
| `renderPanel(side, tabId, element, active)` | 创建面板节点 + React root，渲染组件 |
| `setPanelActive(side, tabId, active)` | 切换 opacity/pointerEvents，不重建 DOM |
| `hasPanel(side, tabId)` | 检查面板是否存在 |
| `syncPanelTabs(side, tabIds)` | 清理不再需要的面板 |

### 面板包裹结构
```
PanelProviders
├── ThemeProvider
├── QueryClientProvider (共享 queryClient)
├── ThemeSettingsBootstrap
├── AppBootstrap (initialized=true 时空操作)
└── PanelErrorBoundary
    └── TabActiveProvider
        └── 实际内容 (LeftDock / RightChatPanel)
```

### 面板挂载时序（TabLayout mount）
1. `useLayoutEffect([])` → `bindPanelHost("left/right", ref)` 绑定 host
2. `useEffect([])` → `renderPanel("left", "main", <LeftDock/>)` + `renderPanel("right", "main", <RightChatPanel/>)`
3. `useEffect([deps])` → 布局变化时更新面板可见性，恢复丢失的面板

### 重要注意事项
- `bindPanelHost` 切换宿主时通过 `setTimeout(0)` **异步卸载**旧面板，避免与 React 渲染冲突
- React StrictMode 的 mount→unmount→remount 周期会导致面板丢失；必须在 `useLayoutEffect` cleanup 中重置 `mountedRef.current = false`
- 布局变化 effect 中需同时检查左右面板是否存在，缺失时重新创建

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

### 1. `navigate()`（完整重置）
- 用于：新建视图、打开项目壳、openTempChat、openTempCanvas
- 调用：`useAppView.getState().navigate(input)`
- 行为：重置所有状态（resetLayout → setBase → setLeftWidthPercent → ...）

### 2. `openPrimaryPageTab()`（轻量切换）
- 用于：侧边栏主页面切换（项目空间、个性看板、智能画布）
- 调用：`setBase()` + `clearStack()` + `setTitle()` + `setIcon()`
- **不调用 resetLayout**，不重置 chatSession
- `normalize()` 自动确保 leftWidthPercent 非零

### 3. 侧边栏历史记录
- `openChat(chatId)` → `setChatSession(chatId, true)`
- `openBoard(params)` → `pushStackItem(boardItem)`
- `openProject(projectId)` → `openProjectShell({...})`

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
| `useAppState()` | `hooks/use-app-state.ts` | 组合 hook（合并上述两个 store） |
| `getAppState()` | `hooks/use-app-state.ts` | 非 React 调用（如 tab-snapshot-sync） |

- 项目独立窗口使用 `sessionStorage`，主窗口使用 `localStorage`（通过 `isProjectWindowMode()` 判断）
- 旧的 `useTabs` / `useTabRuntime` / `useTabView` 已删除

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
- 忘记 `bindPanelHost` 或面板恢复逻辑，导致面板消失（尤其 React StrictMode 下）
- `openPrimaryPageTab` 不调用 `navigate()`，不会重置 session；如需重置用 `navigate()`
- `normalize()` 会自动设置 leftWidthPercent，直接调 `setBase()` 不需要手动设宽度
- `stackHidden` 与 `stack` 状态不同步，导致面板"看不见但仍拦截点击"
- 修改 `TabLayout` 时忽略 `minLeftWidth` 动画保护，导致宽度抖动
- 直接改 DOM 结构绕开 `panel-runtime`（会破坏独立 root 机制）
- panel-runtime 的异步卸载（setTimeout(0)）可能与新面板创建竞态；确保 bindPanelHost 在 useLayoutEffect，renderPanel 在 useEffect

## Quick File Map
- `apps/web/src/app/layout.tsx` — RootLayout + Providers
- `apps/web/src/app/page.tsx` — 页面骨架
- `apps/web/src/components/layout/AppBootstrap.tsx` — 初始化
- `apps/web/src/components/layout/MainContext.tsx` — initialized 门控
- `apps/web/src/components/layout/TabLayout.tsx` — 核心布局 + RightChatPanel
- `apps/web/src/components/layout/LeftDock.tsx` — 左面板（base + stack）
- `apps/web/src/components/layout/StackHeader.tsx` — 统一面板标题栏
- `apps/web/src/components/layout/header/*` — Header
- `apps/web/src/components/layout/sidebar/*` — Sidebar
- `apps/web/src/lib/panel-runtime.tsx` — 面板独立 React Root 管理
- `apps/web/src/hooks/use-app-view.ts` — 视图状态 store
- `apps/web/src/hooks/use-layout-state.ts` — 布局状态 store
- `apps/web/src/hooks/use-app-state.ts` — 组合 hook
- `apps/web/src/hooks/layout-utils.ts` — 布局工具函数
- `apps/web/src/lib/project-shell.ts` — 项目壳导航
- `apps/web/src/hooks/use-sidebar-navigation.ts` — 侧边栏导航动作
- `apps/web/src/lib/globalShortcuts.ts` — 全局快捷键
