import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Logger } from '../logging/startupLogger';
import { restartForUpdates } from '../autoUpdate';
import {
  checkForIncrementalUpdates,
  getIncrementalUpdateStatus,
  resetToBuiltinVersion,
} from '../incrementalUpdate';
import {
  resolveUpdateChannel,
  switchUpdateChannel,
  type UpdateChannel,
} from '../updateConfig';
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
import { createSpeechRecognitionManager } from '../speechRecognition';
import { captureWebMeta } from './captureWebMeta';
import { createCalendarService } from '../calendar/calendarService';
import { createCalendarSync } from '../calendar/calendarSync';
import { resolveWindowIconInfo } from '../resolveWindowIcon';

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

/** Normalize file:// URI for cross-platform parsing. */
function normalizeFileUri(raw: string): string {
  let normalized = raw.trim();
  if (normalized.startsWith('file:/') && !normalized.startsWith('file://')) {
    normalized = `file:///${normalized.slice('file:/'.length)}`;
  } else if (normalized.startsWith('file://') && !normalized.startsWith('file:///')) {
    normalized = `file:///${normalized.slice('file://'.length)}`;
  }
  return normalized.replace(/\\/g, '/');
}

/** Resolve a local filesystem path from a file:// URI or raw path. */
function resolveLocalPath(input: string): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  if (raw.startsWith('file:')) {
    const normalized = normalizeFileUri(raw);
    try {
      return fileURLToPath(normalized);
    } catch {
      // 中文注释：处理非标准 file:// 路径，避免主进程崩溃。
      const stripped = normalized.replace(/^file:\/\//, '');
      const decoded = decodeURIComponent(stripped);
      const withoutHost = decoded.startsWith('localhost/')
        ? decoded.slice('localhost/'.length)
        : decoded;
      let candidate = withoutHost;
      if (candidate.startsWith('/') && /^[a-zA-Z]:/.test(candidate.slice(1))) {
        candidate = candidate.slice(1);
      }
      candidate = candidate.replace(/\//g, path.sep);
      if (path.isAbsolute(candidate) || /^[a-zA-Z]:[\\/]/.test(candidate)) {
        return candidate;
      }
      return null;
    }
  }
  return raw;
}

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
    event.sender.send('tenas:fs:transfer-progress', payload);
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
 * - 渲染端通过 preload 暴露的 `window.tenasElectron` 调用这些能力
 * - 这里保持 handler 数量尽量少、职责清晰
 */
export function registerIpcHandlers(args: { log: Logger }) {
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;
  const speechManager = createSpeechRecognitionManager({ log: args.log });
  const calendarService = createCalendarService({ log: args.log });
  const calendarSync = createCalendarSync({ log: args.log, calendarService });

  // 提供应用版本号给渲染端展示。
  ipcMain.handle('tenas:app:version', async () => app.getVersion());
  // 重启应用以应用更新。
  ipcMain.handle('tenas:app:relaunch', async () => restartForUpdates());

  // Provide runtime port info for renderer initialization.
  ipcMain.on('tenas:runtime:ports', (event) => {
    const serverUrl = process.env.TENAS_SERVER_URL ?? '';
    const webUrl = process.env.TENAS_WEB_URL ?? '';
    event.returnValue = { ok: Boolean(serverUrl), serverUrl, webUrl };
  });

  // Update Windows title bar button symbol color.
  ipcMain.handle(
    'tenas:window:set-titlebar-symbol-color',
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
    'tenas:window:set-titlebar-overlay-height',
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

  // 为用户输入的 URL 打开独立窗口（通常用于外部链接）。
  ipcMain.handle('tenas:open-browser-window', async (_event, payload: { url: string }) => {
    const win = createBrowserWindowForUrl(payload?.url ?? '');
    return { id: win.id };
  });

  // 使用系统默认浏览器打开外部 URL。
  ipcMain.handle('tenas:open-external', async (_event, payload: { url: string }) => {
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
    'tenas:web-meta:fetch',
    async (_event, payload: { url: string; rootUri: string }) => {
      return await captureWebMeta({
        url: String(payload?.url ?? '').trim(),
        rootUri: String(payload?.rootUri ?? '').trim(),
      });
    }
  );

  // 调用系统语音识别（macOS helper）。渲染端通过事件接收识别文本。
  ipcMain.handle('tenas:speech:start', async (event, payload: { language?: string }) => {
    return await speechManager.start({
      language: String(payload?.language ?? '').trim() || undefined,
      webContents: event.sender,
    });
  });

  // 停止系统语音识别。
  ipcMain.handle('tenas:speech:stop', async () => {
    return await speechManager.stop('user');
  });

  // 系统日历权限请求。
  ipcMain.handle('tenas:calendar:permission', async () => {
    return await calendarService.requestPermission();
  });

  // 获取系统日历列表。
  ipcMain.handle('tenas:calendar:list-calendars', async () => {
    return await calendarService.listCalendars();
  });

  // 获取系统提醒事项列表。
  ipcMain.handle('tenas:calendar:list-reminders', async () => {
    return await calendarService.listReminders();
  });

  // 设置系统日历同步范围（页面进入/切换后更新）。
  ipcMain.handle('tenas:calendar:set-sync-range', async (_event, payload: {
    workspaceId: string;
    range?: { start: string; end: string };
  }) => {
    const workspaceId = String(payload?.workspaceId ?? '').trim();
    if (!workspaceId) return { ok: false as const, reason: 'workspaceId required' };
    calendarSync.setSyncContext({ workspaceId, viewRange: payload?.range });
    calendarSync.startTimer();
    return { ok: true as const };
  });

  // 立即触发系统日历同步。
  ipcMain.handle('tenas:calendar:sync', async (_event, payload: {
    workspaceId: string;
    range?: { start: string; end: string };
  }) => {
    const workspaceId = String(payload?.workspaceId ?? '').trim();
    if (!workspaceId) return { ok: false as const, reason: 'workspaceId required' };
    calendarSync.setSyncContext({ workspaceId, viewRange: payload?.range });
    calendarSync.startTimer();
    await calendarSync.syncNow({ workspaceId, viewRange: payload?.range });
    return { ok: true as const };
  });

  // 获取系统日历事件。
  ipcMain.handle('tenas:calendar:get-events', async (_event, payload: { start: string; end: string }) => {
    return await calendarService.getEvents(payload);
  });

  // 获取系统提醒事项。
  ipcMain.handle('tenas:calendar:get-reminders', async (_event, payload: { start: string; end: string }) => {
    return await calendarService.getReminders(payload);
  });

  // 创建系统日历事件。
  ipcMain.handle('tenas:calendar:create-event', async (_event, payload) => {
    return await calendarService.createEvent(payload);
  });

  // 创建系统提醒事项。
  ipcMain.handle('tenas:calendar:create-reminder', async (_event, payload) => {
    return await calendarService.createReminder(payload);
  });

  // 更新系统日历事件。
  ipcMain.handle('tenas:calendar:update-event', async (_event, payload) => {
    return await calendarService.updateEvent(payload);
  });

  // 更新系统提醒事项。
  ipcMain.handle('tenas:calendar:update-reminder', async (_event, payload) => {
    return await calendarService.updateReminder(payload);
  });

  // 删除系统日历事件。
  ipcMain.handle('tenas:calendar:delete-event', async (_event, payload: { id: string }) => {
    return await calendarService.deleteEvent(payload);
  });

  // 删除系统提醒事项。
  ipcMain.handle('tenas:calendar:delete-reminder', async (_event, payload: { id: string }) => {
    return await calendarService.deleteReminder(payload);
  });

  // 启动系统日历变化监听。
  ipcMain.handle('tenas:calendar:watch', async (event) => {
    return calendarService.startWatching(event.sender);
  });

  // 停止系统日历变化监听。
  ipcMain.handle('tenas:calendar:unwatch', async (event) => {
    return calendarService.stopWatching(event.sender);
  });

  // 在调用方的 BrowserWindow 内创建/更新 WebContentsView（用于嵌入式浏览面板）。
  ipcMain.handle('tenas:webcontents-view:upsert', async (event, payload: UpsertWebContentsViewArgs) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    upsertWebContentsView(win, payload);
    return { ok: true };
  });

  // 确保某个 viewKey 对应的 WebContentsView 已存在，并返回其 cdpTargetId，供 server attach 控制。
  ipcMain.handle('tenas:webcontents-view:ensure', async (event, payload: { key: string; url: string }) => {
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
  ipcMain.handle('tenas:webcontents-view:destroy', async (event, payload: { key: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    destroyWebContentsView(win, String(payload?.key ?? ''));
    return { ok: true };
  });

  // WebContentsView 后退导航。
  ipcMain.handle('tenas:webcontents-view:go-back', async (event, payload: { key: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    goBackWebContentsView(win, String(payload?.key ?? ''));
    return { ok: true };
  });

  // WebContentsView 前进导航。
  ipcMain.handle('tenas:webcontents-view:go-forward', async (event, payload: { key: string }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    goForwardWebContentsView(win, String(payload?.key ?? ''));
    return { ok: true };
  });

  // 清除当前窗口内所有 WebContentsView。
  ipcMain.handle('tenas:webcontents-view:clear', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) throw new Error('No BrowserWindow for sender');
    destroyAllWebContentsViews(win);
    return { ok: true };
  });

  // 获取当前窗口内 WebContentsView 数量（渲染端用于展示/诊断）。
  ipcMain.handle('tenas:webcontents-view:count', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { ok: false as const };
    return { ok: true as const, count: getWebContentsViewCount(win) };
  });

  // 手动触发增量更新检查（server/web 增量更新）。
  ipcMain.handle('tenas:incremental-update:check', async () => {
    return await checkForIncrementalUpdates('manual');
  });

  // 获取增量更新状态快照。
  ipcMain.handle('tenas:incremental-update:get-status', async () => {
    return getIncrementalUpdateStatus();
  });

  // 重置到打包版本（删除所有增量更新文件）。
  ipcMain.handle('tenas:incremental-update:reset', async () => {
    return resetToBuiltinVersion();
  });

  // 获取当前更新渠道（stable / beta）。
  ipcMain.handle('tenas:app:get-update-channel', async () => {
    return resolveUpdateChannel();
  });

  // 切换更新渠道并立即触发增量更新检查。
  ipcMain.handle(
    'tenas:app:switch-update-channel',
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
  ipcMain.handle('tenas:fs:open-path', async (_event, payload: { uri: string }) => {
    const targetPath = resolveLocalPath(String(payload?.uri ?? ''));
    if (!targetPath) return { ok: false as const, reason: 'Invalid uri' };
    const result = await shell.openPath(targetPath);
    if (result) return { ok: false as const, reason: result };
    return { ok: true as const };
  });

  // 在系统文件管理器中显示文件/目录。
  ipcMain.handle('tenas:fs:show-in-folder', async (_event, payload: { uri: string }) => {
    const targetPath = resolveLocalPath(String(payload?.uri ?? ''));
    if (!targetPath) return { ok: false as const, reason: 'Invalid uri' };
    shell.showItemInFolder(targetPath);
    return { ok: true as const };
  });

  // 将文件/目录移动到系统回收站。
  ipcMain.handle('tenas:fs:trash-item', async (_event, payload: { uri: string }) => {
    const targetPath = resolveLocalPath(String(payload?.uri ?? ''));
    if (!targetPath) return { ok: false as const, reason: 'Invalid uri' };
    try {
      await shell.trashItem(targetPath);
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, reason: (error as Error)?.message ?? 'Trash failed' };
    }
  });

  // 获取项目缓存目录大小（.tenas-cache）。
  ipcMain.handle('tenas:cache:size', async (_event, payload: { rootUri?: string }) => {
    const rootPath = resolveLocalPath(String(payload?.rootUri ?? ''));
    if (!rootPath) return { ok: false as const, reason: 'Invalid root path' };
    const cachePath = path.join(rootPath, '.tenas-cache');
    const bytes = await getDirectorySizeBytes(cachePath);
    return { ok: true as const, bytes };
  });

  // 清空项目缓存目录（.tenas-cache）。
  ipcMain.handle('tenas:cache:clear', async (_event, payload: { rootUri?: string }) => {
    const rootPath = resolveLocalPath(String(payload?.rootUri ?? ''));
    if (!rootPath) return { ok: false as const, reason: 'Invalid root path' };
    const cachePath = path.join(rootPath, '.tenas-cache');
    try {
      // 逻辑：强制删除缓存目录，不存在时不报错。
      await fs.rm(cachePath, { recursive: true, force: true });
      return { ok: true as const };
    } catch (error) {
      return { ok: false as const, reason: (error as Error)?.message ?? 'Clear cache failed' };
    }
  });

  // 选择本地目录并返回完整路径。
  ipcMain.handle('tenas:fs:pick-directory', async (event, payload?: { defaultPath?: string }) => {
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
    event.sender.send('tenas:fs:drag-log', {
      stage: 'received',
      senderId: event.sender.id,
      senderUrl: event.sender.getURL(),
      rawUris,
      paths,
    });
    if (paths.length === 0) {
      return { ok: false as const, reason: 'Invalid drag payload' };
    }
    const dragSessionId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const icon = await resolveDragIcon(paths);
    event.sender.send('tenas:fs:drag-log', {
      stage: 'pre-start',
      dragSessionId,
      dragCount: paths.length,
    });
    if (paths.length === 1) {
      event.sender.startDrag({ file: paths[0], icon });
    } else {
      event.sender.startDrag({ file: paths[0], files: paths, icon });
    }
    event.sender.send('tenas:fs:drag-log', {
      stage: 'started',
      dragSessionId,
      dragPaths: paths,
    });
    // 中文注释：通过延迟日志确认主进程事件循环是否被拖拽阻塞。
    setTimeout(() => {
      event.sender.send('tenas:fs:drag-log', {
        stage: 'tick',
        dragSessionId,
        afterMs: 500,
      });
    }, 500);
    setTimeout(() => {
      event.sender.send('tenas:fs:drag-log', {
        stage: 'tick',
        dragSessionId,
        afterMs: 2000,
      });
    }, 2000);
    return { ok: true as const };
  };

  // Start OS drag for local project entries (send).
  ipcMain.on('tenas:fs:start-drag', (event, payload: { uris?: string[] }) => {
    void handleStartDrag(event, payload);
  });

  // Start OS drag for local project entries (invoke).
  ipcMain.handle('tenas:fs:start-drag', async (event, payload: { uris?: string[] }) => {
    return await handleStartDrag(event, payload);
  });

  // Show save dialog and write file content.
  ipcMain.handle(
    'tenas:fs:save-file',
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

  // Copy a local file/folder into the workspace and report progress to renderer.
  ipcMain.handle('tenas:fs:transfer-start', async (event, payload: TransferStartPayload) => {
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
      event.sender.send('tenas:fs:transfer-complete', { id });
      return { ok: true as const };
    } catch (error) {
      const reason = (error as Error)?.message ?? 'Transfer failed';
      event.sender.send('tenas:fs:transfer-error', { id, reason });
      return { ok: false as const, reason };
    }
  });

  args.log('IPC handlers registered');
}
