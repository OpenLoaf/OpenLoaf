import { BrowserWindow, ipcMain } from 'electron';
import type { Logger } from '../logging/startupLogger';
import { getAppId } from '../runtime/appId';
import {
  createBrowserWindowForUrl,
  destroyWebContentsView,
  upsertWebContentsView,
  type UpsertWebContentsViewArgs,
} from './webContentsViews';

let ipcHandlersRegistered = false;

/**
 * 注册主进程 IPC handlers（只注册一次）：
 * - 渲染端通过 preload 暴露的 `window.teatimeElectron` 调用这些能力
 * - 这里保持 handler 数量尽量少、职责清晰
 */
export function registerIpcHandlers(args: { log: Logger }) {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  // 提供 Electron appId 给渲染端（apps/web），用于请求中携带 appId。
  ipcMain.handle('teatime:get-app-id', async () => {
    return getAppId();
  });
  ipcMain.on('teatime:get-app-id-sync', (event) => {
    event.returnValue = getAppId();
  });

  // 为用户输入的 URL 打开独立窗口（通常用于外部链接）。
  ipcMain.handle('teatime:open-browser-window', async (_event, payload: { url: string }) => {
    const win = createBrowserWindowForUrl(payload?.url ?? '');
    return { id: win.id };
  });

  // 在调用方的 BrowserWindow 内创建/更新 WebContentsView（用于嵌入式浏览面板）。
  ipcMain.handle('teatime:webcontents-view:upsert', async (event, payload: UpsertWebContentsViewArgs) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    upsertWebContentsView(win, payload);
    return { ok: true };
  });

  // 销毁先前通过 `upsert` 创建的 WebContentsView。
  ipcMain.handle('teatime:webcontents-view:destroy', async (event, payload: { key: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    destroyWebContentsView(win, String(payload?.key ?? ''));
    return { ok: true };
  });

  args.log('IPC handlers registered');
}
