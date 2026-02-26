---
name: desktop-widget-development
description: Desktop 区域与 widget 组件开发指南。用于在 apps/web/src/components/desktop 添加或修改 widget 组件、调整 Desktop 布局与编辑交互、更新 widget catalog 或持久化逻辑时使用；也用于快速理解 Desktop 的基本架构与数据流。
---

# Desktop Widget Development

## 目标

- 指导在 `apps/web/src/components/desktop` 里新增/修改 widget 组件
- 提供 Desktop 基本架构与数据流定位地图，便于快速找文件

## Desktop 架构速览

- **入口与编排**: `apps/web/src/components/desktop/DesktopPage.tsx` 负责页面级数据、初始 items、编辑模式、文件夹选择对话框
- **布局引擎**: `apps/web/src/components/desktop/DesktopGrid.tsx` 使用 GridStack 实现拖拽/缩放/断点布局与放置模式
- **单元格容器**: `apps/web/src/components/desktop/DesktopTileGridstack.tsx` 处理每个 tile 的编辑态/上下文菜单/特定 widget 的交互扩展
- **内容渲染**: `apps/web/src/components/desktop/DesktopTileContent.tsx` 根据 `widgetKey`/`iconKey` 渲染实际组件
- **组件库入口**: `apps/web/src/components/desktop/DesktopEditToolbar.tsx` 负责打开组件库并接收 `CustomEvent` 插入 widget
- **组件库面板**: `apps/web/src/components/desktop/DesktopWidgetLibraryPanel.tsx` 展示 catalog 预览与创建流程
- **目录与断点**: `apps/web/src/components/desktop/desktop-breakpoints.ts` 定义三档断点与 `layoutByBreakpoint` 读写
- **持久化**: `apps/web/src/components/desktop/desktop-persistence.ts` 序列化/反序列化 `.openloaf/desktop.openloaf`
- **历史比对**: `apps/web/src/components/desktop/desktop-history.ts` 复制与等价判断，用于撤销/保存判断
- **Catalog**: `apps/web/src/components/desktop/widget-catalog.ts` 定义可插入的 widget 列表、默认尺寸与约束
- **Widgets**: `apps/web/src/components/desktop/widgets/*Widget.tsx` 真实 UI 实现

## 新增 Widget 的标准流程

1. **定义 widgetKey 与可配置字段**
   - 更新 `apps/web/src/components/desktop/types.ts`：
     - 在 `DesktopWidgetItem["widgetKey"]` union 中新增 key
     - 如有自定义设置，新增可选字段（例如 `fooMode?: "a" | "b"`）

2. **创建组件文件**
   - 新建 `apps/web/src/components/desktop/widgets/<WidgetName>Widget.tsx`
   - 保持 `use client`，根节点保证 `h-full w-full`，避免溢出（需要溢出时说明原因）

3. **注册到 catalog**
   - 更新 `apps/web/src/components/desktop/widget-catalog.ts`：设置 `title`、`size`、`constraints`
   - `constraints` 需要与 GridStack 的布局规则一致（`minW/minH/maxW/maxH`）

4. **接入渲染开关**
   - 更新 `apps/web/src/components/desktop/DesktopTileContent.tsx`：按 `widgetKey` 分支渲染

5. **组件库预览与创建**
   - 更新 `apps/web/src/components/desktop/DesktopWidgetLibraryPanel.tsx`：
     - 在 `WidgetEntityPreview` 中补预览
     - 如需创建时输入（例如 URL、文件夹），在面板内完成采集并通过 `DESKTOP_WIDGET_SELECTED_EVENT` 传递
   - 更新 `apps/web/src/components/desktop/DesktopEditToolbar.tsx`：
     - 在 `createWidgetItem` 中设置默认参数与初始布局
     - 扩展 `DesktopWidgetSelectedDetail` 与 `WidgetCreateOptions` 承接新增字段

6. **持久化与恢复**
   - 更新 `apps/web/src/components/desktop/desktop-persistence.ts`：
     - 在 `serializeDesktopItems` 里把自定义字段写入 `params`
     - 在 `deserializeDesktopItems` 里读回并写入 `DesktopWidgetItem`

7. **历史与等价判断**
   - 更新 `apps/web/src/components/desktop/desktop-history.ts`：
     - `cloneDesktopItems` 增加自定义字段的复制
     - `areDesktopItemsEqual` 增加自定义字段的比对

8. **编辑态扩展（如需要）**
   - 如需右键菜单/按钮控制（例如刷新、固定、切换模式），在 `DesktopTileGridstack.tsx` 中补 UI 与逻辑

9. **样式与交互约定**
   - 使用 `@openloaf/ui` 组件与 `lucide-react` 图标保持一致
   - 需要动画时遵循 `basic.uiAnimationLevel`（参考 `DesktopTileGridstack.tsx`）

## 参数设计建议

- **新增字段**: 优先放在 `DesktopWidgetItem` 的显式字段上，不要把运行态数据塞进 `params`
- **可选字段**: 用 `?` 处理向后兼容，避免旧数据反序列化失败
- **标题来源**: 允许 `title` 覆盖，默认使用 catalog title

## 常见问题检查清单

- 新 widgetKey 是否被 `types.ts`、`widget-catalog.ts`、`DesktopTileContent.tsx` 同步更新
- 组件库是否能展示预览，并能创建带默认参数的 item
- `.openloaf/desktop.openloaf` 是否能序列化/反序列化新字段
- 断点布局是否正确保存到 `layoutByBreakpoint`
- 动态 widget 的 `isDesktopWidgetSupported` 是否对 `"dynamic"` 返回 true（不走 catalog）
- Blob URL 加载前是否调用了 `ensureExternalsRegistered()` + `patchBareImports()`
- 跨 tab 事件的 `detail.tabId` 是否为目标桌面 tab 的 ID（不是来源 tab 的 ID）
- `DesktopEditToolbar` 事件处理器是否从 store 直接读取 `activeTabId`（避免闭包捕获旧值）

## 代码规范与注释规则

- 重要逻辑必须添加备注
- 方法注释使用英文，逻辑注释使用中文（不要加"中文注释:"前缀）
- `apps/web/` React 组件文件名使用 PascalCase

## 动态 Widget 系统

除了内置的静态 widget，系统支持 AI 动态生成的 widget。动态 widget 存储在 `~/.openloaf/dynamic-widgets/` 目录下。

### 架构

```
Widget（React .tsx）
  ↕ @openloaf/widget-sdk（纯桥接，无 UI 依赖）
  ↕ props callback
DynamicWidgetRenderer（Client）/ WidgetTool（Chat 预览）
  ↕ tRPC dynamicWidget router
Server
  - esbuild 编译 widget.tsx（external: react/react-dom/react-jsx-runtime）
  - child_process.spawn 执行 functions.ts
```

### 关键文件

| 文件 | 说明 |
|------|------|
| `packages/widget-sdk/src/index.ts` | SDK 桥接层（WidgetProps, WidgetSDK, createWidgetSDK） |
| `packages/api/src/routers/absDynamicWidget.ts` | 抽象 tRPC 路由定义 |
| `apps/server/src/routers/dynamicWidget.ts` | 路由实现（list/get/save/delete/callFunction/compile） |
| `apps/server/src/modules/dynamic-widget/functionExecutor.ts` | 函数执行器（child_process + .env + 超时） |
| `apps/server/src/modules/dynamic-widget/widgetCompiler.ts` | esbuild 编译器（external 标记 react 等依赖） |
| `apps/web/src/components/desktop/dynamic-widgets/DynamicWidgetRenderer.tsx` | 桌面动态组件渲染器 + SDK 实例化 + ErrorBoundary |
| `apps/web/src/components/desktop/dynamic-widgets/useLoadDynamicComponent.ts` | Blob URL + import() 动态加载（桌面场景） |
| `apps/web/src/components/desktop/dynamic-widgets/widget-externals.ts` | **共享 Blob URL shim 模块**（解决裸模块标识符问题） |
| `apps/web/src/components/ai/message/tools/WidgetTool.tsx` | AI 聊天中的 widget 预览 + "添加到桌面"按钮 |
| `.agents/skills/generate-dynamic-widget/SKILL.md` | AI 生成 widget 的技能规范 |

### widgetKey = "dynamic"

动态 widget 使用 `widgetKey: "dynamic"` + `dynamicWidgetId` 字段标识。在 `DesktopTileContent.tsx` 中通过 `DynamicWidgetRenderer` 渲染。

**重要**：`desktop-support.ts` 中的 `isDesktopWidgetSupported` 对 `widgetKey === "dynamic"` 直接返回 `true`，不走 `desktopWidgetCatalog` 查找。这是因为动态 widget 不在静态 catalog 中注册。

### Blob URL Shim 机制（widget-externals.ts）

esbuild 编译 widget 时将 `react`、`react-dom`、`react/jsx-runtime` 标记为 external，产物中保留 `from 'react'` 等裸模块标识符。浏览器通过 Blob URL `import()` 加载时无法解析裸标识符，需要 shim 层：

1. `ensureExternalsRegistered()` — 将 React 等模块注册到 `window.__OPENLOAF_WIDGET_EXTERNALS__`
2. `patchBareImports(code)` — 用正则将裸标识符替换为 Blob URL shim（shim 从 window 全局读取模块并 re-export）

**两个消费方**：
- `useLoadDynamicComponent.ts`（桌面场景）
- `WidgetTool.tsx`（AI 聊天预览场景）

两者都必须在 `import()` 之前调用 `ensureExternalsRegistered()` + `patchBareImports()`。

### 从 AI 聊天添加到桌面（跨 Tab 事件桥接）

`WidgetTool.tsx` 的"添加到桌面"按钮流程：

1. 从 `useTabRuntime.getState().runtimeByTabId` 查找 `component === 'workspace-desktop'` 的 tab
2. 调用 `useTabs.getState().setActiveTab(desktopTabId)` 切换到桌面 tab
3. 通过 `requestAnimationFrame` 延迟一帧后派发 `DESKTOP_WIDGET_SELECTED_EVENT`
4. `DesktopEditToolbar.tsx` 监听该事件，从 `useTabs.getState().activeTabId` 直接读取最新 tabId（避免闭包捕获旧值）
5. 调用 `createWidgetItem` 创建 widget item 并添加到桌面

**注意**：事件 detail 中的 `tabId` 必须是桌面 tab 的 ID（不是聊天 tab 的 ID），否则 `DesktopEditToolbar` 的 tabId 校验会拒绝该事件。
