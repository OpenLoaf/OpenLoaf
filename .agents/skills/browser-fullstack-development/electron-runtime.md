# Electron Runtime (WebContentsView & IPC)

## Overview

Electron 主进程负责创建/管理 WebContentsView，并通过 IPC 向 Renderer 推送加载状态与窗口事件。所有浏览器自动化与 CDP 连接也依赖 Electron 的远程调试端口配置。

## Preload API (tenasElectron)

来自 `apps/desktop/src/preload/index.ts`：

- `ensureWebContentsView({ key, url })`
  - 确保 viewKey 对应的 WebContentsView 存在，并返回 `cdpTargetId`。
- `upsertWebContentsView({ key, url, bounds, visible })`
  - 更新/创建嵌入式 view（bounds 驱动布局）。
- `destroyWebContentsView(key)`
- `goBackWebContentsView(key)` / `goForwardWebContentsView(key)`
- `clearWebContentsViews()` / `getWebContentsViewCount()`

## Event Channels

- `tenas:webcontents-view:status`
  - 由 `webContentsViews.ts` 统一 emit。
  - 字段：`loading/ready/failed/canGoBack/canGoForward/bytesPerSecond/...`。

- `tenas:webcontents-view:window-open`
  - `window.open` 被拦截并转换为事件，Renderer 决定是否新建标签页。

## WebContentsView Lifecycle

核心逻辑位于 `apps/desktop/src/main/ipc/webContentsViews.ts`：

- `upsertWebContentsView` 创建并复用 `WebContentsView`。
- 监听 `did-start-loading` / `dom-ready` / `did-fail-load` 推送 status。
- `windowOpenHandler` 拦截新窗口并 emit `window-open` 事件。
- 维护网络统计数据，用于加载速度与进度。

## CDP Port & Debugging

- CDP 端口由 `portAllocation.ts` 分配，默认优先端口 53664。
- 环境变量：`TENAS_REMOTE_DEBUGGING_PORT` / `TENAS_REMOTE_DEBUGGING_HOST`。
- 主进程会设置 `app.commandLine.appendSwitch('remote-debugging-port', ...)`。

## Notes

- status 事件是 Renderer 侧 loading/overlay 的唯一可信来源。
- WebContentsView 的 UA 会被替换为 Chrome-like UA，避免 Electron 标识。
