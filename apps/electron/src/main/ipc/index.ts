import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import type { Logger } from '../logging/startupLogger';
import { checkForUpdates, getAutoUpdateStatus, installUpdate } from '../autoUpdate';
import {
  createBrowserWindowForUrl,
  destroyAllWebContentsViews,
  destroyWebContentsView,
  getWebContentsView,
  getWebContentsViewCount,
  goBackWebContentsView,
  goForwardWebContentsView,
  upsertWebContentsView,
  type UpsertWebContentsViewArgs,
} from './webContentsViews';

let ipcHandlersRegistered = false;

/**
 * Get CDP targetId for a given webContents using Electron's debugger API.
 */
async function getCdpTargetId(webContents: Electron.WebContents): Promise<string | undefined> {
  const dbg = webContents.debugger;
  let attachedHere = false;
  try {
    if (!dbg.isAttached()) {
      dbg.attach('1.3');
      attachedHere = true;
    }
    // 通过 Target.getTargetInfo 获取当前 webContents 对应的 CDP targetId。
    const info = (await dbg.sendCommand('Target.getTargetInfo')) as {
      targetInfo?: { targetId?: string };
    };
    const id = String(info?.targetInfo?.targetId ?? '');
    return id || undefined;
  } catch {
    return undefined;
  } finally {
    if (attachedHere) {
      try {
        dbg.detach();
      } catch {
        // ignore
      }
    }
  }
}

/**
 * 注册主进程 IPC handlers（只注册一次）：
 * - 渲染端通过 preload 暴露的 `window.teatimeElectron` 调用这些能力
 * - 这里保持 handler 数量尽量少、职责清晰
 */
export function registerIpcHandlers(args: { log: Logger }) {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  // 提供应用版本号给渲染端展示。
  ipcMain.handle('teatime:app:version', async () => app.getVersion());

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

  // 确保某个 viewKey 对应的 WebContentsView 已存在，并返回其 cdpTargetId，供 server attach 控制。
  ipcMain.handle('teatime:webcontents-view:ensure', async (event, payload: { key: string; url: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    const key = String(payload?.key ?? '').trim();
    const url = String(payload?.url ?? '').trim();
    if (!key) throw new Error('Missing view key');
    if (!url) throw new Error('Missing url');

    // 先创建/复用 view；bounds 由渲染端后续 upsert 时持续同步。
    upsertWebContentsView(win, { key, url, bounds: { x: 0, y: 0, width: 0, height: 0 }, visible: false });

    const view = getWebContentsView(win, key);
    const wc = view?.webContents;
    if (!wc) return { ok: false as const };

    const cdpTargetId = await getCdpTargetId(wc);
    return {
      ok: true as const,
      webContentsId: wc.id,
      cdpTargetId,
    };
  });

  // 销毁先前通过 `upsert` 创建的 WebContentsView。
  ipcMain.handle('teatime:webcontents-view:destroy', async (event, payload: { key: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    destroyWebContentsView(win, String(payload?.key ?? ''));
    return { ok: true };
  });

  // WebContentsView 后退导航。
  ipcMain.handle('teatime:webcontents-view:go-back', async (event, payload: { key: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    goBackWebContentsView(win, String(payload?.key ?? ''));
    return { ok: true };
  });

  // WebContentsView 前进导航。
  ipcMain.handle('teatime:webcontents-view:go-forward', async (event, payload: { key: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    goForwardWebContentsView(win, String(payload?.key ?? ''));
    return { ok: true };
  });

  // 清除当前窗口内所有 WebContentsView。
  ipcMain.handle('teatime:webcontents-view:clear', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    destroyAllWebContentsViews(win);
    return { ok: true };
  });

  // 获取当前窗口内 WebContentsView 数量（渲染端用于展示/诊断）。
  ipcMain.handle('teatime:webcontents-view:count', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { ok: false as const };
    return { ok: true as const, count: getWebContentsViewCount(win) };
  });

  // 手动触发更新检查（用于设置页“检测更新”按钮）。
  ipcMain.handle('teatime:auto-update:check', async () => {
    return await checkForUpdates('manual');
  });

  // 获取最新更新状态快照（用于设置页首次渲染）。
  ipcMain.handle('teatime:auto-update:status', async () => {
    return getAutoUpdateStatus();
  });

  // 安装已下载的更新并重启。
  ipcMain.handle('teatime:auto-update:install', async () => {
    return installUpdate();
  });

  // 使用系统默认程序打开文件/目录。
  ipcMain.handle('teatime:fs:open-path', async (_event, payload: { uri: string }) => {
    const uri = String(payload?.uri ?? '');
    if (!uri.startsWith('file://')) return { ok: false as const, reason: 'Invalid uri' };
    const targetPath = fileURLToPath(uri);
    const result = await shell.openPath(targetPath);
    if (result) return { ok: false as const, reason: result };
    return { ok: true as const };
  });

  // 在系统文件管理器中显示文件/目录。
  ipcMain.handle('teatime:fs:show-in-folder', async (_event, payload: { uri: string }) => {
    const uri = String(payload?.uri ?? '');
    if (!uri.startsWith('file://')) return { ok: false as const, reason: 'Invalid uri' };
    const targetPath = fileURLToPath(uri);
    shell.showItemInFolder(targetPath);
    return { ok: true as const };
  });

  // 将文件/目录移动到系统回收站。
  ipcMain.handle('teatime:fs:trash-item', async (_event, payload: { uri: string }) => {
    const uri = String(payload?.uri ?? '');
    if (!uri.startsWith('file://')) return { ok: false as const, reason: 'Invalid uri' };
    const targetPath = fileURLToPath(uri);
    try {
      await shell.trashItem(targetPath);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, reason: (error as Error)?.message ?? 'Trash failed' };
    }
  });


  args.log('IPC handlers registered');
}
