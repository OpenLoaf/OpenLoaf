# Browser Web UI

## Overview

Web 侧负责浏览器面板 UI、browserTabs 状态与 open-url 前端执行链路。核心组件为 `ElectrronBrowserWindow`（注意拼写是 Electrron）。

## Core Components

- `ElectrronBrowserWindow.tsx`
  - 管理浏览器子标签、激活 tab、viewKey 生成与状态同步。
  - 通过 `openloafElectron.ensureWebContentsView` 获取 `cdpTargetId`。
  - 监听 `openloaf:webcontents-view:status` 更新 loading/ready/error。
  - 监听 `openloaf:webcontents-view:window-open` 转为新标签页。

- `BrowserTabsBar.tsx`
  - 标签栏 UI（切换/新建/关闭/编辑地址）。

- `BrowserProgressBar.tsx`
  - 顶部 loading 动画条（与 loading 状态绑定）。

- `BrowserLoadingOverlay.tsx`
  - 加载遮罩 + 估算进度 + 下载速度（来自 status 事件的网络统计字段）。

- `BrowserErrorOverlay.tsx`
  - 展示离线/加载失败，支持重试。

- `BrowserHome.tsx`
  - 新标签页（收藏夹、最近关闭）。

## Data Model & Flow

- `BrowserTab` 定义在 `packages/api/src/types/tabs.ts`。
- `browserTabs` 存放在 stack item `params` 内，由 `normalizeBrowserWindowItem` 统一合并：
  - `params.__open` 追加并激活新标签（open-url 使用）。
  - `params.browserTabs` 全量覆盖（由 UI 内部切换/关闭使用）。
  - `params.activeBrowserTabId` 存放当前激活标签。

- `open-url` 前端执行（`frontend-tool-executor.ts`）：
  - 生成 `viewKey`，通过 `pushStackItem` 注入 `__open`。
  - Electron 环境下等待 `waitForWebContentsViewReady(viewKey)` 回执。

## Storage

- `browser-storage.ts` 使用 localStorage：
  - `openloaf:browser:favorites`
  - `openloaf:browser:recently-closed`
  - 通过 `openloaf:browser-storage` 事件通知 UI 刷新。

## UI Event Channels

- `openloaf:webcontents-view:status`
  - 由 Electron 主进程发出，用于 loading/ready/error/favIcon/网络统计。

- `openloaf:webcontents-view:window-open`
  - 主进程拦截 `window.open`，Renderer 转成新标签页。

## Notes

- `normalizeUrl` 在多个组件中复用（`browser-utils.ts`）。
- browser tabs 的 viewKey 生成包含 `workspaceId/tabId/chatSessionId`，避免冲突。
- tab snapshot 由 `upsertTabSnapshotNow` 上报给 server，确保 CDP 工具可用。
