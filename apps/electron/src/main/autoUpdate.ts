import { app, BrowserWindow } from 'electron';
import {
  autoUpdater,
  type ProgressInfo,
  type UpdateInfo,
} from 'electron-updater';
import type { Logger } from './logging/startupLogger';

type AutoUpdateOptions = {
  log: Logger;
};

type AutoUpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export type AutoUpdateStatus = {
  state: AutoUpdateState;
  currentVersion: string;
  nextVersion?: string;
  releaseNotes?: string;
  lastCheckedAt?: number;
  progress?: {
    percent: number;
    transferred: number;
    total: number;
    bytesPerSecond: number;
  };
  error?: string;
  ts: number;
};

let autoUpdateInstalled = false;
let cachedLog: Logger | null = null;
let checkTimer: NodeJS.Timeout | null = null;
let lastStatus: AutoUpdateStatus = {
  state: 'idle',
  currentVersion: app.getVersion(),
  ts: Date.now(),
};

type AutoUpdateResult = { ok: true } | { ok: false; reason: string };

/**
 * Returns the latest auto-update status snapshot.
 */
export function getAutoUpdateStatus(): AutoUpdateStatus {
  return lastStatus;
}

/**
 * Triggers an update check (packaged builds only).
 */
export async function checkForUpdates(reason = 'manual'): Promise<AutoUpdateResult> {
  if (!app.isPackaged) {
    cachedLog?.(`Auto update skipped (${reason}): not packaged.`);
    return { ok: false, reason: 'not-packaged' };
  }

  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cachedLog?.(`Auto update check failed (${reason}): ${message}`);
    emitStatus({
      state: 'error',
      error: message,
      lastCheckedAt: Date.now(),
      progress: undefined,
    });
    return { ok: false, reason: message };
  }
}

/**
 * Installs a downloaded update and restarts the app.
 */
export function installUpdate(): AutoUpdateResult {
  if (!app.isPackaged) {
    cachedLog?.('Auto update install skipped: not packaged.');
    return { ok: false, reason: 'not-packaged' };
  }

  try {
    autoUpdater.quitAndInstall();
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cachedLog?.(`Auto update install failed: ${message}`);
    emitStatus({ state: 'error', error: message, progress: undefined });
    return { ok: false, reason: message };
  }
}

/**
 * Normalizes release notes into a single string.
 */
function normalizeReleaseNotes(info: UpdateInfo): string | undefined {
  const notes = info.releaseNotes;
  if (!notes) return undefined;
  if (typeof notes === 'string') return notes;
  if (Array.isArray(notes)) {
    const merged = notes
      .map((entry) => (entry && typeof entry.note === 'string' ? entry.note : ''))
      .filter(Boolean)
      .join('\n');
    return merged || undefined;
  }
  return undefined;
}

/**
 * Broadcasts update status to all renderer windows.
 */
function emitStatus(next: Omit<AutoUpdateStatus, 'currentVersion' | 'ts'> & Partial<Pick<AutoUpdateStatus, 'currentVersion' | 'ts'>>) {
  const payload: AutoUpdateStatus = {
    ...lastStatus,
    ...next,
    currentVersion: app.getVersion(),
    ts: Date.now(),
  };
  lastStatus = payload;

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send('tenas:auto-update:status', payload);
    } catch {
      // ignore
    }
  }
}

/**
 * Converts download progress into status payload.
 */
function toProgressStatus(progress: ProgressInfo): AutoUpdateStatus {
  return {
    ...lastStatus,
    state: 'downloading',
    currentVersion: app.getVersion(),
    progress: {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    },
    ts: Date.now(),
  };
}

/**
 * Sets up auto-update checks for packaged builds.
 */
export function installAutoUpdate(options: AutoUpdateOptions): void {
  const { log } = options;
  cachedLog = log;

  if (!app.isPackaged) {
    // 仅在打包环境启用更新，避免 dev 模式触发无效检查。
    log('Auto update skipped (not packaged).');
    return;
  }

  if (autoUpdateInstalled) {
    // 防止多次注册更新监听导致重复触发。
    log('Auto update already initialized.');
    return;
  }
  autoUpdateInstalled = true;

  autoUpdater.autoDownload = true;

  // 监听更新流程事件，便于定位更新失败原因。
  autoUpdater.on('checking-for-update', () => {
    log('Checking for updates...');
    emitStatus({
      state: 'checking',
      lastCheckedAt: Date.now(),
      error: undefined,
      progress: undefined,
    });
  });
  autoUpdater.on('update-available', (info) => {
    log('Update available.');
    emitStatus({
      state: 'available',
      nextVersion: info.version,
      releaseNotes: normalizeReleaseNotes(info),
      lastCheckedAt: Date.now(),
      progress: undefined,
    });
  });
  autoUpdater.on('update-not-available', () => {
    log('No updates available.');
    emitStatus({
      state: 'not-available',
      nextVersion: undefined,
      releaseNotes: undefined,
      error: undefined,
      lastCheckedAt: Date.now(),
      progress: undefined,
    });
  });
  autoUpdater.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    log(`Auto update error: ${message}`);
    emitStatus({ state: 'error', error: message, progress: undefined });
  });
  autoUpdater.on('download-progress', (progress) => {
    log(`Update download progress: ${Math.round(progress.percent)}%`);
    emitStatus(toProgressStatus(progress));
  });
  autoUpdater.on('update-downloaded', (info) => {
    log('Update downloaded. It will be installed on quit.');
    emitStatus({
      state: 'downloaded',
      nextVersion: info.version,
      releaseNotes: normalizeReleaseNotes(info),
      progress: undefined,
    });
  });

  emitStatus({ state: 'idle', progress: undefined });
  // 延迟一次检测，避免启动阶段竞争网络/IO。
  setTimeout(() => {
    void checkForUpdates('startup');
  }, 8000);

  // 周期性检测（默认 6 小时），避免长时间运行错过更新。
  if (!checkTimer) {
    checkTimer = setInterval(() => {
      void checkForUpdates('scheduled');
    }, 6 * 60 * 60 * 1000);
  }
}
