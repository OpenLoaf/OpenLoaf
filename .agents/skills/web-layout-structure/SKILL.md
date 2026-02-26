---
name: web-layout-structure
description: Use when working on or debugging the web app layout in apps/web/src/components/layout, including header, sidebar, tab split, left dock stack panels, right chat panel, or layout gates.
---

# Web Layout Structure（apps/web/src/components/layout）

## Overview
这个 skill 用来快速理解 Web 端整体布局的结构、渲染顺序和关键状态来源，避免在 Header / Sidebar / TabLayout / LeftDock / Chat 面板之间迷路。

## When to Use
- 需要调整全局布局（Header / Sidebar / 主内容区）
- 需要改动 Tab 左右分栏、拖拽宽度、聊天面板折叠/展开
- 需要理解 LeftDock 的 base + stack 叠加逻辑
- 需要定位 Loading / Gate / Providers 导致的渲染阻塞
- **维护规则**：只要修改了上述布局相关文件或逻辑，必须第一时间同步更新本 skill（保持结构与路径一致）。

## Layout Entry Points
- `apps/web/src/app/layout.tsx`：RootLayout，加载 Providers + 全局 Gate
- `apps/web/src/app/page.tsx`：页面骨架（Header + Sidebar + MainContent）
- `apps/web/src/components/layout/*`：具体布局与面板容器

## Render Tree（高层结构）
```
RootLayout (app/layout.tsx)
└─ Providers
   └─ ServerConnectionGate
      └─ StepUpGate
         └─ grid[rows: auto 1fr]
            └─ Page (app/page.tsx)
               ├─ Header
               └─ main row
                  ├─ AppSidebar
                  └─ SidebarInset
                     └─ MainContent
                        └─ TabLayout
                           ├─ LeftDock (panel host)
                           └─ RightChatPanel (panel host)
```

## Core Regions

### Header
- 文件：`apps/web/src/components/layout/header/Header.tsx`
- 结构：
  - 左侧：侧边栏开关 + 设置入口（`openSettingsTab`）
  - 中间：`HeaderTabs`（工作区内标签页导航/管理）
  - 右侧：`StackDockMenuButton`、`ModeToggle`、聊天面板开关
- Electron / macOS：使用 `--macos-traffic-lights-width` 调整标题栏空间

### Sidebar
- 文件：`apps/web/src/components/layout/sidebar/Sidebar.tsx`
- 逻辑：
  - 使用 `@openloaf/ui/sidebar`，`SidebarProvider` 控制展开状态
  - 窄屏（<900px）直接隐藏侧边栏（`useIsNarrowScreen`）
  - `SidebarHeader` 放入口菜单（搜索、日历、AI、邮箱、技能等）
  - `SidebarContent` 主要是 `SidebarProject`
  - `SidebarFooter` 为反馈入口

### MainContent（Tab Keep-Alive）
- 文件：`apps/web/src/components/layout/MainContext.tsx`
- 逻辑：
  - 仅首次激活时挂载 tab scene
  - tab 关闭后释放对应 mounted 状态
  - 用于“像浏览器 Tab 一样”的状态保留

### TabLayout（左右分栏 + Panel Host）
- 文件：`apps/web/src/components/layout/TabLayout.tsx`
- 关键点：
  - 通过 `bindPanelHost("left"|"right")` 绑定左右容器
  - `renderPanel` / `setPanelActive` / `syncPanelTabs` 管理每个 tab 的面板挂载
  - 左右分栏的三种模式：
    - A：左+右都可见（默认）
    - B：仅左侧可见（右侧折叠）
    - C：仅右侧可见（左侧隐藏）
  - 最小宽度：`LEFT_DOCK_MIN_PX` / `RIGHT_CHAT_MIN_PX`
  - 拖拽分割条会写入 `leftWidthPercent`（`useTabRuntime`）
  - `rightChatCollapsed` 决定右侧是否显示

### LeftDock（Base + Stack）
- 文件：`apps/web/src/components/layout/LeftDock.tsx`
- 结构：
  - `base`：主面板，永远铺底
  - `stack`：叠加面板（只显示 active），可最小化
  - `stackHidden` 决定是否最小化；ESC 会触发 `requestStackMinimize`
  - `PanelFrame` 统一使用 `StackHeader`，支持 refresh / close / minimize
- 重要参数：
  - `__customHeader`：自定义 Header（不渲染 StackHeader）
  - `__refreshKey`：强制 remount 面板
  - `__opaque`：是否使用纯背景

### RightChatPanel
- 文件：`apps/web/src/components/layout/TabLayout.tsx` 内 `RightChatPanel`
- 逻辑：
  - `Chat` 组件挂载在右侧
  - 支持多会话列表（`ChatSessionBarItem`）
  - 新建/删除/切换会话由 `useTabs` 驱动

### StackHeader（统一面板标题栏）
- 文件：`apps/web/src/components/layout/StackHeader.tsx`
- 作用：
  - 统一 Header UI（标题 + 右侧操作）
  - 可选按钮：系统打开、刷新、最小化、关闭

### Loading / Gates
- `ServerConnectionGate`：等待后端健康检查成功
- `StepUpGate`：等待基础配置完成
- `LoadingScreen`：统一加载屏
- `AutoUpdateGate`：更新提示弹窗（在 `Providers` 内挂载）

## Key Data / State
- `useTabs`：tab 列表、activeTab、stack/base 元信息
- `useTabRuntime`：运行时数据（leftWidthPercent、rightChatCollapsed、runtimeByTabId）
- `panel-runtime`：左右面板的 mount/unmount 与 keep-alive 管理

## Common Pitfalls
- 忘记 `bindPanelHost` 或 `syncPanelTabs`，导致面板挂载错位
- 直接改 DOM 结构，绕开 `panel-runtime`（会破坏 keep-alive）
- 修改 `TabLayout` 时忽略 `minLeftWidth` 动画保护，导致宽度抖动
- `stackHidden` 与 `stack` 状态不同步，导致面板“看不见但仍拦截点击”

## Quick File Map
- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/components/layout/MainContext.tsx`
- `apps/web/src/components/layout/TabLayout.tsx`
- `apps/web/src/components/layout/LeftDock.tsx`
- `apps/web/src/components/layout/StackHeader.tsx`
- `apps/web/src/components/layout/header/*`
- `apps/web/src/components/layout/sidebar/*`
- `apps/web/src/components/layout/LoadingScreen.tsx`
- `apps/web/src/components/layout/ServerConnectionGate.tsx`
- `apps/web/src/components/layout/StepUpGate.tsx`
- `apps/web/src/components/layout/AutoUpdateGate.tsx`
