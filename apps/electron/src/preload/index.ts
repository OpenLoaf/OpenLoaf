import { contextBridge, ipcRenderer } from 'electron';

type OpenBrowserWindowResult = { id: number };
type OkResult = { ok: true };
type CountResult = { ok: true; count: number } | { ok: false };
type ViewBounds = { x: number; y: number; width: number; height: number };

/**
 * preload 运行在隔离上下文中，是我们向 web UI（apps/web）暴露安全 API 的唯一入口。
 * 需要保持暴露面尽量小，并且用类型约束好输入/输出。
 */
contextBridge.exposeInMainWorld('teatimeElectron', {
  // 请求主进程在独立窗口中打开外部 URL。
  openBrowserWindow: (url: string): Promise<OpenBrowserWindowResult> =>
    ipcRenderer.invoke('teatime:open-browser-window', { url }),
  // 确保某个 viewKey 对应的 WebContentsView 已存在，并返回 cdpTargetId（供 server attach）。
  ensureWebContentsView: (args: { key: string; url: string }): Promise<{ ok: true; webContentsId: number; cdpTargetId?: string } | { ok: false }> =>
    ipcRenderer.invoke('teatime:webcontents-view:ensure', args),
  // 请求主进程使用 WebContentsView 将 URL 嵌入当前窗口。
  upsertWebContentsView: (args: {
    key: string;
    url: string;
    bounds: ViewBounds;
    visible?: boolean;
  }): Promise<OkResult> => ipcRenderer.invoke('teatime:webcontents-view:upsert', args),
  // 请求主进程移除某个嵌入的 WebContentsView。
  destroyWebContentsView: (key: string): Promise<OkResult> =>
    ipcRenderer.invoke('teatime:webcontents-view:destroy', { key }),
  // 获取当前窗口内 WebContentsView 数量（用于设置页展示/诊断）。
  getWebContentsViewCount: (): Promise<CountResult> =>
    ipcRenderer.invoke('teatime:webcontents-view:count'),
});

// 主进程会推送 WebContentsView 的真实加载状态（dom-ready 等），这里转成 window 事件给 web UI 消费。
ipcRenderer.on('teatime:webcontents-view:status', (_event, detail) => {
  try {
    window.dispatchEvent(
      new CustomEvent('teatime:webcontents-view:status', { detail })
    );
  } catch {
    // ignore
  }
});
