import { contextBridge, ipcRenderer } from 'electron';

type OpenBrowserWindowResult = { id: number };
type OkResult = { ok: true };
type ViewBounds = { x: number; y: number; width: number; height: number };

/**
 * preload 运行在隔离上下文中，是我们向 web UI（apps/web）暴露安全 API 的唯一入口。
 * 需要保持暴露面尽量小，并且用类型约束好输入/输出。
 */
contextBridge.exposeInMainWorld('teatimeElectron', {
  // 请求主进程在独立窗口中打开外部 URL。
  openBrowserWindow: (url: string): Promise<OpenBrowserWindowResult> =>
    ipcRenderer.invoke('teatime:open-browser-window', { url }),
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
});
