/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { app, BrowserWindow, dialog, ipcMain, nativeImage, nativeTheme, Notification, shell } from 'electron';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from '../logging/startupLogger';
import { checkForUpdates, getAutoUpdateStatus, restartForUpdates } from '../autoUpdate';
import {
  checkForIncrementalUpdates,
  fetchJson,
  getIncrementalUpdateStatus,
  resetToBuiltinVersion,
  resolveDesktopVersionManifest,
} from '../incrementalUpdate';
import {
  resolveUpdateBaseUrl,
  resolveUpdateChannel,
  switchUpdateChannel,
  type UpdateChannel,
} from '../updateConfig';
import {
  destroyAllWebContentsViews,
  destroyWebContentsView,
  getWebContentsView,
  getWebContentsViewCount,
  goBackWebContentsView,
  goForwardWebContentsView,
  upsertWebContentsView,
  type UpsertWebContentsViewArgs,
} from './webContentsViews';
import { createSpeechRecognitionManager } from '../speechRecognition';
import { captureWebMeta } from './captureWebMeta';
import { createCalendarService } from '../calendar/calendarService';
import { createCalendarSync } from '../calendar/calendarSync';
import { convertDocxToSfdt } from '../docxSfdt';
import { resolveLocalPath } from '../resolveLocalPath';
import { resolveWindowIconInfo } from '../resolveWindowIcon';
import { updateTrayBadge, refreshTrayMenu } from '../tray';
import { setLanguage, getMinimizeToTray, setMinimizeToTray } from '../updateConfig';
import { createProjectWindow } from '../windows/projectWindow';
import { createBoardWindow } from '../windows/boardWindow';
import { openUrlInBrowserWindow } from '../windows/browserWindow';

let ipcHandlersRegistered = false;

type TransferStartPayload = {
  id: string;
  sourcePath: string;
  targetPath: string;
  kind?: 'file' | 'folder';
};

type TransferProgressPayload = {
  id: string;
  currentName: string;
  percent: number;
};

const TRANSFER_PROGRESS_THROTTLE_MS = 120;
// 中文注释：兜底拖拽图标，保证 macOS 上 icon 非空。
const FALLBACK_DRAG_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+AP7n2U8VQAAAABJRU5ErkJggg==';

/** Compute directory size recursively. */
async function getDirectorySizeBytes(dirPath: string): Promise<number> {
  let total = 0;
  let entries: Array<import('node:fs').Dirent>;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const nextPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await getDirectorySizeBytes(nextPath);
      continue;
    }
    if (entry.isFile()) {
      try {
        const stat = await fs.stat(nextPath);
        total += stat.size;
      } catch {
        // 逻辑：单文件读取失败时忽略，继续统计其他项。
      }
    }
  }
  return total;
}

/** Build a throttled progress emitter for file transfers. */
function createTransferProgressEmitter(
  event: Electron.IpcMainInvokeEvent,
  transferId: string
) {
  let lastSent = 0;
  return (currentName: string, percent: number) => {
    const now = Date.now();
    // 中文注释：限制进度事件发送频率，避免渲染端过载。
    if (percent < 100 && now - lastSent < TRANSFER_PROGRESS_THROTTLE_MS) return;
    lastSent = now;
    const payload: TransferProgressPayload = { id: transferId, currentName, percent };
    event.sender.send('openloaf:fs:transfer-progress', payload);
  };
}

/** Copy a single file with progress reporting. */
async function copyFileWithProgress(args: {
  sourcePath: string;
  targetPath: string;
  onProgress: (currentName: string, percent: number) => void;
}) {
  const stat = await fs.stat(args.sourcePath);
  if (!stat.isFile()) {
    throw new Error('Source is not a file');
  }
  await fs.mkdir(path.dirname(args.targetPath), { recursive: true });
  const total = stat.size;
  let copied = 0;
  const currentName = path.basename(args.sourcePath);
  args.onProgress(currentName, total === 0 ? 100 : 0);
  await new Promise<void>((resolve, reject) => {
    const reader = createReadStream(args.sourcePath);
    const writer = createWriteStream(args.targetPath);
    reader.on('data', (chunk: Buffer) => {
      // 中文注释：按读取块累计字节数，驱动单文件进度。
      copied += chunk.length;
      const percent = total === 0 ? 100 : Math.min(100, Math.round((copied / total) * 100));
      args.onProgress(currentName, percent);
    });
    reader.on('error', reject);
    writer.on('error', reject);
    writer.on('close', resolve);
    reader.pipe(writer);
  });
  args.onProgress(currentName, 100);
}

/** Copy a directory recursively with progress reporting. */
async function copyDirectoryWithProgress(args: {
  sourcePath: string;
  targetPath: string;
  onProgress: (currentName: string, percent: number) => void;
}) {
  const stat = await fs.stat(args.sourcePath);
  if (!stat.isDirectory()) {
    throw new Error('Source is not a directory');
  }
  const totalBytes = await getDirectorySizeBytes(args.sourcePath);
  let copiedBytes = 0;
  const baseName = path.basename(args.sourcePath);

  const emitProgress = (currentName: string) => {
    const percent =
      totalBytes === 0 ? 100 : Math.min(100, Math.round((copiedBytes / totalBytes) * 100));
    args.onProgress(currentName, percent);
  };

  const copyDir = async (sourceDir: string, targetDir: string) => {
    await fs.mkdir(targetDir, { recursive: true });
    let entries: Array<import('node:fs').Dirent>;
    try {
      entries = await fs.readdir(sourceDir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.length === 0) {
      emitProgress(baseName);
    }
    for (const entry of entries) {
      const nextSource = path.join(sourceDir, entry.name);
      const nextTarget = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        await copyDir(nextSource, nextTarget);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativeName = path.relative(args.sourcePath, nextSource) || entry.name;
      await fs.mkdir(path.dirname(nextTarget), { recursive: true });
      await new Promise<void>((resolve, reject) => {
        const reader = createReadStream(nextSource);
        const writer = createWriteStream(nextTarget);
        reader.on('data', (chunk: Buffer) => {
          // 中文注释：按文件块累计总进度，统一映射到目录进度。
          copiedBytes += chunk.length;
          emitProgress(relativeName);
        });
        reader.on('error', reject);
        writer.on('error', reject);
        writer.on('close', resolve);
        reader.pipe(writer);
      });
    }
  };

  await copyDir(args.sourcePath, args.targetPath);
  emitProgress(baseName);
}

/** Resolve a drag icon for the given paths (async). */
async function resolveDragIcon(paths: string[]): Promise<Electron.NativeImage> {
  const primaryPath = paths[0];
  if (primaryPath) {
    try {
      const fileIcon = await app.getFileIcon(primaryPath);
      if (!fileIcon.isEmpty()) return fileIcon;
    } catch {
      // 中文注释：获取文件图标失败时回退到应用图标。
    }
  }
  const windowIcon = resolveWindowIconInfo();
  if (windowIcon?.image && !windowIcon.image.isEmpty()) {
    return windowIcon.image;
  }
  return nativeImage.createFromDataURL(FALLBACK_DRAG_ICON_DATA_URL);
}

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
 * - 渲染端通过 preload 暴露的 `window.openloafElectron` 调用这些能力
 * - 这里保持 handler 数量尽量少、职责清晰
 */
export function registerIpcHandlers(args: { log: Logger }) {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;
  const speechManager = createSpeechRecognitionManager({ log: args.log });
  const calendarService = createCalendarService({ log: args.log });
  const calendarSync = createCalendarSync({
    log: args.log,
    calendarService,
    getPermissionCache: () => calendarService.getPermissionCache(),
    onWatchExit: (cb) => calendarService.onWatchExit(cb),
    tryStartWatch: () => calendarService.tryRestartWatch(),
  });

  // 提供应用版本号给渲染端展示。
  ipcMain.handle('openloaf:app:version', async () => app.getVersion());
  // 重启应用以应用更新。
  ipcMain.handle('openloaf:app:relaunch', async () => restartForUpdates());
  // 获取 desktop 整包更新状态快照。
  ipcMain.handle('openloaf:auto-update:get-status', async () => getAutoUpdateStatus());
  // 手动触发 desktop 整包更新检查。
  ipcMain.handle('openloaf:auto-update:check', async () => checkForUpdates('manual'));

  // Provide runtime port info for renderer initialization.
  ipcMain.on('openloaf:runtime:ports', (event) => {
    const serverUrl = process.env.OPENLOAF_SERVER_URL ?? '';
    const webUrl = process.env.OPENLOAF_WEB_URL ?? '';
    event.returnValue = { ok: Boolean(serverUrl), serverUrl, webUrl };
  });

  // Update Windows title bar button symbol color.
  ipcMain.handle(
    'openloaf:window:set-titlebar-symbol-color',
    async (event, payload: { symbolColor?: string }) => {
      if (process.platform !== 'win32') {
        return { ok: false as const, reason: 'Unsupported platform' };
      }
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return { ok: false as const, reason: 'No window for sender' };
      if (typeof win.setTitleBarOverlay !== 'function') {
        return { ok: false as const, reason: 'Unsupported window API' };
      }
      const symbolColor = String(payload?.symbolColor ?? '').trim();
      if (!symbolColor) {
        return { ok: false as const, reason: 'Missing symbolColor' };
      }
      win.setTitleBarOverlay({ symbolColor });
      return { ok: true as const };
    }
  );

  // Update Windows title bar overlay height.
  ipcMain.handle(
    'openloaf:window:set-titlebar-overlay-height',
    async (event, payload: { height?: number }) => {
      if (process.platform !== 'win32') {
        return { ok: false as const, reason: 'Unsupported platform' };
      }
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return { ok: false as const, reason: 'No window for sender' };
      if (typeof win.setTitleBarOverlay !== 'function') {
        return { ok: false as const, reason: 'Unsupported window API' };
      }
      const height = Number(payload?.height);
      if (!Number.isFinite(height) || height <= 0) {
        return { ok: false as const, reason: 'Invalid height' };
      }
      win.setTitleBarOverlay({ height: Math.round(height) });
      return { ok: true as const };
    }
  );

  // 在标签浏览器窗口中打开 URL（单例窗口，多标签页管理）。
  ipcMain.handle('openloaf:open-browser-window', async (_event, payload: { url: string }) => {
    return openUrlInBrowserWindow(payload?.url ?? '');
  });

  // 在独立应用窗口中打开项目上下文。
  ipcMain.handle(
    'openloaf:open-project-window',
    async (
      _event,
      payload: {
        projectId?: string;
        rootUri?: string;
        title?: string;
        icon?: string | null;
      },
    ) => {
      const projectId = String(payload?.projectId ?? '').trim();
      const rootUri = String(payload?.rootUri ?? '').trim();
      const title = String(payload?.title ?? '').trim();
      if (!projectId || !rootUri || !title) {
        throw new Error('Invalid project window payload');
      }
      const webUrl = process.env.OPENLOAF_WEB_URL || (app.isPackaged ? 'app://localhost' : 'http://127.0.0.1:3000');
      const win = createProjectWindow({
        log: args.log,
        webUrl,
        projectId,
        rootUri,
        title,
        icon: payload?.icon ?? undefined,
      });
      return { id: win.id };
    },
  );

  // 在独立应用窗口中打开画布。
  ipcMain.handle(
    'openloaf:open-board-window',
    async (
      _event,
      payload: {
        boardId?: string;
        boardFolderUri?: string;
        boardFileUri?: string;
        rootUri?: string;
        title?: string;
        projectId?: string;
      },
    ) => {
      const boardId = String(payload?.boardId ?? '').trim();
      const boardFolderUri = String(payload?.boardFolderUri ?? '').trim();
      const boardFileUri = String(payload?.boardFileUri ?? '').trim();
      const rootUri = String(payload?.rootUri ?? '').trim();
      const title = String(payload?.title ?? '').trim();
      if (!boardId || !boardFolderUri || !boardFileUri || !rootUri) {
        throw new Error('Invalid board window payload');
      }
      const webUrl = process.env.OPENLOAF_WEB_URL || (app.isPackaged ? 'app://localhost' : 'http://127.0.0.1:3000');
      const win = createBoardWindow({
        log: args.log,
        webUrl,
        boardId,
        boardFolderUri,
        boardFileUri,
        rootUri,
        title,
        projectId: payload?.projectId?.trim() || undefined,
      });
      return { id: win.id };
    },
  );

  // 使用系统默认浏览器打开外部 URL。
  ipcMain.handle('openloaf:open-external', async (_event, payload: { url: string }) => {
    const url = String(payload?.url ?? '').trim();
    if (!url) return { ok: false as const, reason: 'Invalid url' };
    args.log(`[open-external] ${url}`);
    try {
      await shell.openExternal(url);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, reason: (error as Error)?.message ?? 'Open external failed' };
    }
  });

  // 抓取网页元数据与截图（仅 Electron 模式）。
  ipcMain.handle(
    'openloaf:web-meta:fetch',
    async (_event, payload: { url: string; rootUri: string }) => {
      return await captureWebMeta({
        url: String(payload?.url ?? '').trim(),
        rootUri: String(payload?.rootUri ?? '').trim(),
      });
    }
  );

  // 本地 DOCX 转 SFDT，供桌面端 Syncfusion 文档编辑器离线导入。
  ipcMain.handle(
    'openloaf:office:convert-docx-to-sfdt',
    async (_event, payload: { uri?: string }) => {
      return await convertDocxToSfdt({
        uri: String(payload?.uri ?? '').trim(),
        log: args.log,
      });
    },
  );

  // 调用系统语音识别（macOS helper）。渲染端通过事件接收识别文本。
  ipcMain.handle('openloaf:speech:start', async (event, payload: { language?: string }) => {
    return await speechManager.start({
      language: String(payload?.language ?? '').trim() || undefined,
      webContents: event.sender,
    });
  });

  // 停止系统语音识别。
  ipcMain.handle('openloaf:speech:stop', async () => {
    return await speechManager.stop('user');
  });

  // 轻量级日历权限状态检查（不触发权限弹窗）。
  ipcMain.handle('openloaf:calendar:check-permission', async () => {
    return await calendarService.checkPermission();
  });

  // 系统日历权限请求。
  ipcMain.handle('openloaf:calendar:permission', async () => {
    return await calendarService.requestPermission();
  });

  // 获取系统日历列表。
  ipcMain.handle('openloaf:calendar:list-calendars', async () => {
    return await calendarService.listCalendars();
  });

  // 获取系统提醒事项列表。
  ipcMain.handle('openloaf:calendar:list-reminders', async () => {
    return await calendarService.listReminders();
  });

  // 设置系统日历同步范围（页面进入/切换后更新）。
  ipcMain.handle('openloaf:calendar:set-sync-range', async (_event, payload: {
    range?: { start: string; end: string };
  }) => {
    calendarSync.setSyncContext({ viewRange: payload?.range });
    return { ok: true as const };
  });

  // 立即触发系统日历同步。
  ipcMain.handle('openloaf:calendar:sync', async (_event, payload: {
    range?: { start: string; end: string };
  }) => {
    calendarSync.setSyncContext({ viewRange: payload?.range });
    await calendarSync.syncNow({ viewRange: payload?.range });
    return { ok: true as const };
  });

  // 获取系统日历事件。
  ipcMain.handle('openloaf:calendar:get-events', async (_event, payload: { start: string; end: string }) => {
    return await calendarService.getEvents(payload);
  });

  // 获取系统提醒事项。
  ipcMain.handle('openloaf:calendar:get-reminders', async (_event, payload: { start: string; end: string }) => {
    return await calendarService.getReminders(payload);
  });

  // 创建系统日历事件。
  ipcMain.handle('openloaf:calendar:create-event', async (_event, payload) => {
    return await calendarService.createEvent(payload);
  });

  // 创建系统提醒事项。
  ipcMain.handle('openloaf:calendar:create-reminder', async (_event, payload) => {
    return await calendarService.createReminder(payload);
  });

  // 更新系统日历事件。
  ipcMain.handle('openloaf:calendar:update-event', async (_event, payload) => {
    return await calendarService.updateEvent(payload);
  });

  // 更新系统提醒事项。
  ipcMain.handle('openloaf:calendar:update-reminder', async (_event, payload) => {
    return await calendarService.updateReminder(payload);
  });

  // 删除系统日历事件。
  ipcMain.handle('openloaf:calendar:delete-event', async (_event, payload: { id: string }) => {
    return await calendarService.deleteEvent(payload);
  });

  // 删除系统提醒事项。
  ipcMain.handle('openloaf:calendar:delete-reminder', async (_event, payload: { id: string }) => {
    return await calendarService.deleteReminder(payload);
  });

  // 启动系统日历变化监听。
  ipcMain.handle('openloaf:calendar:watch', async (event) => {
    return calendarService.startWatching(event.sender);
  });

  // 停止系统日历变化监听。
  ipcMain.handle('openloaf:calendar:unwatch', async (event) => {
    return calendarService.stopWatching(event.sender);
  });

  // 在调用方的 BrowserWindow 内创建/更新 WebContentsView（用于嵌入式浏览面板）。
  ipcMain.handle('openloaf:webcontents-view:upsert', async (event, payload: UpsertWebContentsViewArgs) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    upsertWebContentsView(win, payload);
    return { ok: true };
  });

  // 确保某个 viewKey 对应的 WebContentsView 已存在，并返回其 cdpTargetId，供 server attach 控制。
  ipcMain.handle('openloaf:webcontents-view:ensure', async (event, payload: { key: string; url: string }) => {
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
  ipcMain.handle('openloaf:webcontents-view:destroy', async (event, payload: { key: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    destroyWebContentsView(win, String(payload?.key ?? ''));
    return { ok: true };
  });

  // WebContentsView 后退导航。
  ipcMain.handle('openloaf:webcontents-view:go-back', async (event, payload: { key: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    goBackWebContentsView(win, String(payload?.key ?? ''));
    return { ok: true };
  });

  // WebContentsView 前进导航。
  ipcMain.handle('openloaf:webcontents-view:go-forward', async (event, payload: { key: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    goForwardWebContentsView(win, String(payload?.key ?? ''));
    return { ok: true };
  });

  // 清除当前窗口内所有 WebContentsView。
  ipcMain.handle('openloaf:webcontents-view:clear', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    destroyAllWebContentsViews(win);
    return { ok: true };
  });

  // 获取当前窗口内 WebContentsView 数量（渲染端用于展示/诊断）。
  ipcMain.handle('openloaf:webcontents-view:count', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { ok: false as const };
    return { ok: true as const, count: getWebContentsViewCount(win) };
  });

  // 使用系统文件管理器打开应用日志目录（userData）。
  ipcMain.handle('openloaf:open-logs-folder', async () => {
    try {
      const logsDir = app.getPath('userData');
      const result = await shell.openPath(logsDir);
      if (result) return { ok: false as const, reason: result };
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, reason: String(error) };
    }
  });

  // 读取 startup.log 内容（最后 5000 字符），供崩溃反馈时附带。
  ipcMain.handle('openloaf:startup-log:read', async () => {
    try {
      const logPath = path.join(app.getPath('userData'), 'startup.log');
      const content = await fs.readFile(logPath, 'utf-8');
      // 截取最后 5000 字符，避免反馈体积过大
      const tail = content.length > 5000 ? content.slice(-5000) : content;
      return { ok: true as const, content: tail };
    } catch {
      return { ok: false as const, reason: 'Failed to read startup log' };
    }
  });

  // 手动触发增量更新检查（server/web 增量更新）。
  ipcMain.handle('openloaf:incremental-update:check', async () => {
    return await checkForIncrementalUpdates('manual');
  });

  // 获取增量更新状态快照。
  ipcMain.handle('openloaf:incremental-update:get-status', async () => {
    return getIncrementalUpdateStatus();
  });

  // 重置到打包版本（删除所有增量更新文件）。
  ipcMain.handle('openloaf:incremental-update:reset', async () => {
    return resetToBuiltinVersion();
  });

  // 获取当前更新渠道（stable / beta）。
  ipcMain.handle('openloaf:app:get-update-channel', async () => {
    return resolveUpdateChannel();
  });

  // 切换更新渠道并立即触发增量更新检查。
  ipcMain.handle(
    'openloaf:app:switch-update-channel',
    async (_event, payload: { channel: UpdateChannel }) => {
      const channel = payload?.channel;
      if (channel !== 'stable' && channel !== 'beta') {
        return { ok: false as const, reason: 'Invalid channel' };
      }
      switchUpdateChannel(channel);
      args.log(`[update-channel] Switched to ${channel}`);
      // 切换后立即触发增量更新检查
      void checkForIncrementalUpdates('channel-switch');
      return { ok: true as const };
    }
  );

  // 使用系统默认程序打开文件/目录。
  ipcMain.handle('openloaf:fs:open-path', async (_event, payload: { uri: string }) => {
    const targetPath = resolveLocalPath(String(payload?.uri ?? ''));
    if (!targetPath) return { ok: false as const, reason: 'Invalid uri' };
    const result = await shell.openPath(targetPath);
    if (result) return { ok: false as const, reason: result };
    return { ok: true as const };
  });

  // 在系统文件管理器中显示文件/目录。
  ipcMain.handle('openloaf:fs:show-in-folder', async (_event, payload: { uri: string }) => {
    const targetPath = resolveLocalPath(String(payload?.uri ?? ''));
    if (!targetPath) return { ok: false as const, reason: 'Invalid uri' };
    shell.showItemInFolder(targetPath);
    return { ok: true as const };
  });

  // 将文件/目录移动到系统回收站。
  ipcMain.handle('openloaf:fs:trash-item', async (_event, payload: { uri: string }) => {
    const targetPath = resolveLocalPath(String(payload?.uri ?? ''));
    if (!targetPath) return { ok: false as const, reason: 'Invalid uri' };
    try {
      await shell.trashItem(targetPath);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, reason: (error as Error)?.message ?? 'Trash failed' };
    }
  });

  // 获取项目缓存目录大小（.openloaf-cache）。
  ipcMain.handle('openloaf:cache:size', async (_event, payload: { rootUri?: string }) => {
    const rootPath = resolveLocalPath(String(payload?.rootUri ?? ''));
    if (!rootPath) return { ok: false as const, reason: 'Invalid root path' };
    const cachePath = path.join(rootPath, '.openloaf-cache');
    const bytes = await getDirectorySizeBytes(cachePath);
    return { ok: true as const, bytes };
  });

  // 清空项目缓存目录（.openloaf-cache）。
  ipcMain.handle('openloaf:cache:clear', async (_event, payload: { rootUri?: string }) => {
    const rootPath = resolveLocalPath(String(payload?.rootUri ?? ''));
    if (!rootPath) return { ok: false as const, reason: 'Invalid root path' };
    const cachePath = path.join(rootPath, '.openloaf-cache');
    try {
      // 逻辑：强制删除缓存目录，不存在时不报错。
      await fs.rm(cachePath, { recursive: true, force: true });
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, reason: (error as Error)?.message ?? 'Clear cache failed' };
    }
  });

  // 选择本地目录并返回完整路径。
  ipcMain.handle('openloaf:fs:pick-directory', async (event, payload?: { defaultPath?: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const defaultPathRaw = String(payload?.defaultPath ?? '').trim();
    let defaultPath: string | undefined;
    if (defaultPathRaw) {
      if (defaultPathRaw.startsWith('file://')) {
        try {
          defaultPath = fileURLToPath(defaultPathRaw);
        } catch {
          defaultPath = undefined;
        }
      } else {
        defaultPath = defaultPathRaw;
      }
    }
    // 逻辑：默认打开当前路径，减少目录跳转成本。
    const result = await dialog.showOpenDialog(win ?? undefined, {
      properties: ['openDirectory'],
      ...(defaultPath ? { defaultPath } : {}),
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: false as const };
    }
    return { ok: true as const, path: result.filePaths[0] };
  });

  // Handle native OS drag requests from renderer.
  const handleStartDrag = async (
    event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent,
    payload: { uris?: string[] }
  ) => {
    const rawUris = Array.isArray(payload?.uris) ? payload?.uris : [];
    const paths = rawUris
      .map((uri) => resolveLocalPath(String(uri ?? '')))
      .filter((item): item is string => Boolean(item));
    // 中文注释：将主进程收到的信息回传到渲染端，便于定位 IPC 链路问题。
    event.sender.send('openloaf:fs:drag-log', {
      stage: 'received',
      senderId: event.sender.id,
      senderUrl: event.sender.getURL(),
      rawUris,
      paths,
    });
    if (paths.length === 0) {
      return { ok: false as const, reason: 'Invalid drag payload' };
    }
    const dragSessionId = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const icon = await resolveDragIcon(paths);
    event.sender.send('openloaf:fs:drag-log', {
      stage: 'pre-start',
      dragSessionId,
      dragCount: paths.length,
    });
    if (paths.length === 1) {
      event.sender.startDrag({ file: paths[0], icon });
    } else {
      event.sender.startDrag({ file: paths[0], files: paths, icon });
    }
    event.sender.send('openloaf:fs:drag-log', {
      stage: 'started',
      dragSessionId,
      dragPaths: paths,
    });
    // 中文注释：通过延迟日志确认主进程事件循环是否被拖拽阻塞。
    setTimeout(() => {
      event.sender.send('openloaf:fs:drag-log', {
        stage: 'tick',
        dragSessionId,
        afterMs: 500,
      });
    }, 500);
    setTimeout(() => {
      event.sender.send('openloaf:fs:drag-log', {
        stage: 'tick',
        dragSessionId,
        afterMs: 2000,
      });
    }, 2000);
    return { ok: true as const };
  };

  // Start OS drag for local project entries (send).
  ipcMain.on('openloaf:fs:start-drag', (event, payload: { uris?: string[] }) => {
    void handleStartDrag(event, payload);
  });

  // Start OS drag for local project entries (invoke).
  ipcMain.handle('openloaf:fs:start-drag', async (event, payload: { uris?: string[] }) => {
    return await handleStartDrag(event, payload);
  });

  // Show save dialog and write file content.
  ipcMain.handle(
    'openloaf:fs:save-file',
    async (
      event,
      payload: {
        contentBase64?: string;
        defaultDir?: string;
        suggestedName?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }
    ) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const defaultDirRaw = String(payload?.defaultDir ?? '').trim();
      const suggestedName = String(payload?.suggestedName ?? '').trim();
      let defaultDir = app.getPath('downloads');
      if (defaultDirRaw) {
        if (defaultDirRaw.startsWith('file://')) {
          try {
            defaultDir = fileURLToPath(defaultDirRaw);
          } catch {
            defaultDir = app.getPath('downloads');
          }
        } else {
          defaultDir = defaultDirRaw;
        }
      }
      const defaultPath = suggestedName
        ? path.join(defaultDir, suggestedName)
        : defaultDir;
      const result = await dialog.showSaveDialog(win ?? undefined, {
        defaultPath,
        filters: payload?.filters,
      });
      if (result.canceled || !result.filePath) {
        return { ok: false as const, canceled: true as const };
      }
      const contentBase64 = String(payload?.contentBase64 ?? '');
      if (!contentBase64) {
        return { ok: false as const, reason: 'Missing content' };
      }
      try {
        const buffer = Buffer.from(contentBase64, 'base64');
        await fs.writeFile(result.filePath, buffer);
        return { ok: true as const, path: result.filePath };
      } catch (error) {
        return { ok: false as const, reason: (error as Error)?.message ?? 'Save failed' };
      }
    }
  );

  // Copy a local file/folder into the project storage root and report progress to renderer.
  ipcMain.handle('openloaf:fs:transfer-start', async (event, payload: TransferStartPayload) => {
    const id = String(payload?.id ?? '').trim();
    const sourcePath = resolveLocalPath(payload?.sourcePath ?? '');
    const targetPath = resolveLocalPath(payload?.targetPath ?? '');
    if (!id || !sourcePath || !targetPath) {
      return { ok: false as const, reason: 'Invalid transfer payload' };
    }
    const emitProgress = createTransferProgressEmitter(event, id);
    try {
      const stat = await fs.stat(sourcePath);
      if (stat.isDirectory()) {
        await copyDirectoryWithProgress({
          sourcePath,
          targetPath,
          onProgress: emitProgress,
        });
      } else {
        await copyFileWithProgress({
          sourcePath,
          targetPath,
          onProgress: emitProgress,
        });
      }
      event.sender.send('openloaf:fs:transfer-complete', { id });
      return { ok: true as const };
    } catch (error) {
      const reason = (error as Error)?.message ?? 'Transfer failed';
      event.sender.send('openloaf:fs:transfer-error', { id, reason });
      return { ok: false as const, reason };
    }
  });

  // 显示 OS 原生通知（任务状态变更等）。
  ipcMain.handle(
    'openloaf:notification:show',
    async (event, payload: { title: string; body: string; taskId?: string }) => {
      const title = String(payload?.title ?? '').trim()
      const body = String(payload?.body ?? '').trim()
      if (!title) return { ok: false as const, reason: 'Missing title' }

      const notification = new Notification({ title, body })
      notification.on('click', () => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (win) {
          if (win.isMinimized()) win.restore()
          win.focus()
        }
        // Forward click event to renderer for navigation
        event.sender.send('openloaf:notification:click', {
          taskId: payload?.taskId,
        })
      })
      notification.show()
      return { ok: true as const }
    }
  )

  // 同步 UI 主题到主进程 nativeTheme（影响浏览器标签栏等子窗口）。
  ipcMain.handle('openloaf:app:set-native-theme', async (_event, payload: { theme: string }) => {
    const theme = String(payload?.theme ?? '').trim();
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
      nativeTheme.themeSource = theme;
    }
    return { ok: true as const };
  });

  // 同步 UI 语言到主进程（用于托盘菜单、对话框等原生 UI 翻译）。
  ipcMain.handle('openloaf:app:set-language', async (_event, payload: { language: string }) => {
    const lang = String(payload?.language ?? '').trim();
    if (!lang) return { ok: false as const, reason: 'Missing language' };
    setLanguage(lang);
    // 刷新托盘菜单文本。
    refreshTrayMenu();
    args.log(`[i18n] Language synced: ${lang}`);
    return { ok: true as const };
  });

  // 更新系统托盘角标计数。
  ipcMain.handle('openloaf:tray:set-badge', async (_event, payload: { count: number }) => {
    const count = Number(payload?.count ?? 0);
    updateTrayBadge(count);
    // macOS 同时更新 Dock 角标数字。
    if (process.platform === 'darwin') {
      app.dock?.setBadge(count > 0 ? String(count) : '');
    }
    return { ok: true as const };
  });

  // 读取"关闭时最小化到托盘"偏好。
  ipcMain.handle('openloaf:app:get-minimize-to-tray', async () => {
    return { ok: true as const, value: getMinimizeToTray() };
  });

  // 设置"关闭时最小化到托盘"偏好。
  ipcMain.handle('openloaf:app:set-minimize-to-tray', async (_event, payload: { value: boolean }) => {
    setMinimizeToTray(payload?.value === true);
    return { ok: true as const };
  });

  // 获取最新安装包下载 URL（兜底恢复用）。
  ipcMain.handle('openloaf:app:get-latest-installer-url', async () => {
    try {
      const baseUrl = resolveUpdateBaseUrl();
      const channel = resolveUpdateChannel();

      // 1. 读取渠道 manifest → 获取最新 desktop 版本号
      const channelManifest = (await fetchJson(`${baseUrl}/${channel}/manifest.json`)) as {
        desktop?: { version?: string };
      };
      const desktopVersion = channelManifest?.desktop?.version;
      if (!desktopVersion) return { ok: false as const, reason: 'no-desktop-version' };

      // 2. 读取版本 manifest → 获取平台下载 URL
      const versionManifest = (await resolveDesktopVersionManifest(baseUrl, desktopVersion)) as {
        platforms?: Record<string, { url?: string }>;
      };
      const platforms = versionManifest?.platforms;
      if (!platforms) return { ok: false as const, reason: 'no-platforms' };

      // 3. 根据当前平台+架构选择下载链接
      const platformKey = `${process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux'}-${process.arch}`;
      const platformInfo = platforms[platformKey];
      if (!platformInfo?.url) return { ok: false as const, reason: 'no-platform-match' };

      return { ok: true as const, url: platformInfo.url, version: desktopVersion };
    } catch (error) {
      return { ok: false as const, reason: String(error) };
    }
  });

  // 应用退出时清理日历子进程，防止孤儿进程泄漏。
  app.on('will-quit', () => {
    calendarSync.stopTimer();
    calendarService.destroy();
  });

  args.log('IPC handlers registered');
}
