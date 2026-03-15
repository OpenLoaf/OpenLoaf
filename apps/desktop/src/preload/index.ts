/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron';

type OpenBrowserWindowResult = { id: number };
type OpenProjectWindowResult = { id: number };
type OkResult = { ok: true };
type CountResult = { ok: true; count: number } | { ok: false };
type ViewBounds = { x: number; y: number; width: number; height: number };
type IncrementalUpdateComponentInfo = {
  version: string;
  source: 'bundled' | 'updated';
  newVersion?: string;
  releaseNotes?: string;
  changelogUrl?: string;
};
type IncrementalUpdateStatus = {
  state: 'idle' | 'checking' | 'downloading' | 'ready' | 'error';
  server: IncrementalUpdateComponentInfo;
  web: IncrementalUpdateComponentInfo;
  progress?: { component: 'server' | 'web'; percent: number };
  lastCheckedAt?: number;
  error?: string;
  ts: number;
};
type WebMetaCaptureResult = {
  ok: boolean;
  url: string;
  title?: string;
  description?: string;
  logoPath?: string;
  previewPath?: string;
  error?: string;
};
type CalendarPermissionState = "granted" | "denied" | "prompt" | "unsupported";
type CalendarRange = { start: string; end: string };
type CalendarItem = {
  id: string;
  title: string;
  color?: string;
  readOnly?: boolean;
  isSubscribed?: boolean;
};
type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  description?: string;
  location?: string;
  color?: string;
  calendarId?: string;
  recurrence?: string;
};
type CalendarResult<T> = { ok: true; data: T } | { ok: false; reason: string; code?: string };
type DocxToSfdtFailureCode =
  | "unsupported"
  | "helper_missing"
  | "invalid_input"
  | "file_not_found"
  | "license_missing"
  | "timeout"
  | "parse_error"
  | "convert_failed";
type DocxToSfdtResult =
  | { ok: true; data: { sfdt: string } }
  | { ok: false; reason: string; code: DocxToSfdtFailureCode };

/**
 * preload 运行在隔离上下文中，是我们向 web UI（apps/web）暴露安全 API 的唯一入口。
 * 需要保持暴露面尽量小，并且用类型约束好输入/输出。
 */
contextBridge.exposeInMainWorld('openloafElectron', {
  // 请求主进程在独立窗口中打开外部 URL。
  openBrowserWindow: (url: string): Promise<OpenBrowserWindowResult> =>
    ipcRenderer.invoke('openloaf:open-browser-window', { url }),
  // 请求主进程在独立应用窗口中打开一个项目上下文。
  openProjectWindow: (payload: {
    projectId: string;
    rootUri: string;
    title: string;
    icon?: string | null;
  }): Promise<OpenProjectWindowResult> =>
    ipcRenderer.invoke('openloaf:open-project-window', payload),
  // 请求主进程在独立应用窗口中打开一个画布。
  openBoardWindow: (payload: {
    boardId: string;
    boardFolderUri: string;
    boardFileUri: string;
    rootUri: string;
    title: string;
    projectId?: string;
  }): Promise<OpenProjectWindowResult> =>
    ipcRenderer.invoke('openloaf:open-board-window', payload),
  // 使用系统默认浏览器打开外部 URL。
  openExternal: (url: string): Promise<{ ok: true } | { ok: false; reason?: string }> =>
    ipcRenderer.invoke('openloaf:open-external', { url }),
  // 抓取网页元数据与截图（仅 Electron 模式）。
  fetchWebMeta: (payload: { url: string; rootUri: string }): Promise<WebMetaCaptureResult> =>
    ipcRenderer.invoke('openloaf:web-meta:fetch', payload),
  // 确保某个 viewKey 对应的 WebContentsView 已存在，并返回 cdpTargetId（供 server attach）。
  ensureWebContentsView: (args: { key: string; url: string }): Promise<{ ok: true; webContentsId: number; cdpTargetId?: string } | { ok: false }> =>
    ipcRenderer.invoke('openloaf:webcontents-view:ensure', args),
  // 请求主进程使用 WebContentsView 将 URL 嵌入当前窗口。
  upsertWebContentsView: (args: {
    key: string;
    url: string;
    bounds: ViewBounds;
    visible?: boolean;
  }): Promise<OkResult> => ipcRenderer.invoke('openloaf:webcontents-view:upsert', args),
  // 请求主进程移除某个嵌入的 WebContentsView。
  destroyWebContentsView: (key: string): Promise<OkResult> =>
    ipcRenderer.invoke('openloaf:webcontents-view:destroy', { key }),
  // Navigate back within a WebContentsView.
  goBackWebContentsView: (key: string): Promise<OkResult> =>
    ipcRenderer.invoke('openloaf:webcontents-view:go-back', { key }),
  // Navigate forward within a WebContentsView.
  goForwardWebContentsView: (key: string): Promise<OkResult> =>
    ipcRenderer.invoke('openloaf:webcontents-view:go-forward', { key }),
  // Clear all WebContentsViews for the current window.
  clearWebContentsViews: (): Promise<OkResult> =>
    ipcRenderer.invoke('openloaf:webcontents-view:clear'),
  // 获取当前窗口内 WebContentsView 数量（用于设置页展示/诊断）。
  getWebContentsViewCount: (): Promise<CountResult> =>
    ipcRenderer.invoke('openloaf:webcontents-view:count'),
  // 获取应用版本号。
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('openloaf:app:version'),
  // Restart the app to apply updates.
  relaunchApp: (): Promise<{ ok: true } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('openloaf:app:relaunch'),
  // Fetch runtime server/web URLs synchronously for early init.
  getRuntimePortsSync: (): { ok: boolean; serverUrl?: string; webUrl?: string } =>
    ipcRenderer.sendSync('openloaf:runtime:ports'),
  // Update Windows title bar button symbol color.
  setTitleBarSymbolColor: (payload: {
    symbolColor: string;
  }): Promise<{ ok: true } | { ok: false; reason?: string }> =>
    ipcRenderer.invoke('openloaf:window:set-titlebar-symbol-color', payload),
  // Update Windows title bar overlay height.
  setTitleBarOverlayHeight: (payload: {
    height: number;
  }): Promise<{ ok: true } | { ok: false; reason?: string }> =>
    ipcRenderer.invoke('openloaf:window:set-titlebar-overlay-height', payload),
  // 使用系统文件管理器打开应用日志目录。
  openLogsFolder: (): Promise<{ ok: true } | { ok: false; reason?: string }> =>
    ipcRenderer.invoke('openloaf:open-logs-folder'),
  // 读取 startup.log 内容（崩溃反馈时附带）。
  readStartupLog: (): Promise<{ ok: true; content: string } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('openloaf:startup-log:read'),
  // 手动触发增量更新检查（server/web）。
  checkIncrementalUpdate: (): Promise<{ ok: true } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('openloaf:incremental-update:check'),
  // 获取增量更新状态快照。
  getIncrementalUpdateStatus: (): Promise<IncrementalUpdateStatus> =>
    ipcRenderer.invoke('openloaf:incremental-update:get-status'),
  // 获取 desktop 整包更新状态快照。
  getAutoUpdateStatus: (): Promise<unknown> =>
    ipcRenderer.invoke('openloaf:auto-update:get-status'),
  // 手动触发 desktop 整包更新检查。
  checkDesktopUpdate: (): Promise<{ ok: true } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('openloaf:auto-update:check'),
  // 重置增量更新到打包版本。
  resetIncrementalUpdate: (): Promise<{ ok: true } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('openloaf:incremental-update:reset'),
  // 获取当前更新渠道（stable / beta）。
  getUpdateChannel: (): Promise<'stable' | 'beta'> =>
    ipcRenderer.invoke('openloaf:app:get-update-channel'),
  // 切换更新渠道（stable / beta）并立即触发检查。
  switchUpdateChannel: (channel: 'stable' | 'beta'): Promise<{ ok: true } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('openloaf:app:switch-update-channel', { channel }),
  // 使用系统默认程序打开文件/目录。
  openPath: (payload: { uri: string }): Promise<{ ok: true } | { ok: false; reason?: string }> =>
    ipcRenderer.invoke('openloaf:fs:open-path', payload),
  // 在系统文件管理器中定位文件/目录。
  showItemInFolder: (payload: { uri: string }): Promise<{ ok: true } | { ok: false; reason?: string }> =>
    ipcRenderer.invoke('openloaf:fs:show-in-folder', payload),
  // 移动文件/目录到系统回收站。
  trashItem: (payload: { uri: string }): Promise<{ ok: true } | { ok: false; reason?: string }> =>
    ipcRenderer.invoke('openloaf:fs:trash-item', payload),
  // 获取项目缓存目录大小。
  getCacheSize: (payload: { rootUri?: string }): Promise<{ ok: true; bytes: number } | { ok: false; reason?: string }> =>
    ipcRenderer.invoke('openloaf:cache:size', payload),
  // 清空项目缓存目录。
  clearCache: (payload: { rootUri?: string }): Promise<{ ok: true } | { ok: false; reason?: string }> =>
    ipcRenderer.invoke('openloaf:cache:clear', payload),
  // 选择本地目录并返回完整路径。
  pickDirectory: (payload?: { defaultPath?: string }): Promise<
    { ok: true; path: string } | { ok: false }
  > => ipcRenderer.invoke('openloaf:fs:pick-directory', payload),
  // Start OS drag from renderer selection.
  startDrag: (payload: { uris: string[] }): void => {
    console.log('[drag-out] preload send', {
      url: window.location?.href ?? '',
      count: payload?.uris?.length ?? 0,
    });
    ipcRenderer.send('openloaf:fs:start-drag', payload);
  },
  // Show save dialog and write base64 payload to file.
  saveFile: (payload: {
    contentBase64: string;
    defaultDir?: string;
    suggestedName?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<{ ok: true; path: string } | { ok: false; canceled?: boolean; reason?: string }> =>
    ipcRenderer.invoke('openloaf:fs:save-file', payload),
  // Start a local file/folder transfer into the target root.
  startTransfer: (payload: {
    id: string;
    sourcePath: string;
    targetPath: string;
    kind?: "file" | "folder";
  }): Promise<{ ok: true } | { ok: false; reason?: string }> =>
    ipcRenderer.invoke('openloaf:fs:transfer-start', payload),
  // Start OS speech recognition (macOS helper).
  startSpeechRecognition: (payload: { language?: string }): Promise<{ ok: true } | { ok: false; reason?: string }> =>
    ipcRenderer.invoke('openloaf:speech:start', payload),
  // Stop OS speech recognition.
  stopSpeechRecognition: (): Promise<{ ok: true } | { ok: false; reason?: string }> =>
    ipcRenderer.invoke('openloaf:speech:stop'),
  // Show OS native notification (task status changes, etc.).
  showNotification: (payload: {
    title: string;
    body: string;
    taskId?: string;
  }): Promise<{ ok: true } | { ok: false; reason?: string }> =>
    ipcRenderer.invoke('openloaf:notification:show', payload),
  // 更新系统托盘角标计数（0 表示清除角标）。
  setTrayBadge: (payload: { count: number }): Promise<{ ok: true }> =>
    ipcRenderer.invoke('openloaf:tray:set-badge', payload),
  // 同步 UI 主题到主进程 nativeTheme（影响浏览器标签栏等子窗口）。
  setNativeTheme: (theme: 'light' | 'dark' | 'system'): Promise<{ ok: true }> =>
    ipcRenderer.invoke('openloaf:app:set-native-theme', { theme }),
  // 同步 UI 语言到主进程（托盘菜单、对话框等原生 UI 翻译）。
  setLanguage: (language: string): Promise<{ ok: true } | { ok: false; reason: string }> =>
    ipcRenderer.invoke('openloaf:app:set-language', { language }),
  // 关闭确认对话框：web 端将用户选择发回主进程。
  respondCloseConfirm: (payload: {
    action: 'cancel' | 'minimize' | 'quit';
    minimizeToTray?: boolean;
  }): void => {
    ipcRenderer.send('openloaf:confirm-close:response', payload)
  },
  // 读取"关闭时最小化到托盘"偏好。
  getMinimizeToTray: (): Promise<{ ok: true; value: boolean }> =>
    ipcRenderer.invoke('openloaf:app:get-minimize-to-tray'),
  // 设置"关闭时最小化到托盘"偏好。
  setMinimizeToTray: (value: boolean): Promise<{ ok: true }> =>
    ipcRenderer.invoke('openloaf:app:set-minimize-to-tray', { value }),
  // 获取最新安装包下载 URL（兜底恢复用）。
  getLatestInstallerUrl: (): Promise<
    { ok: true; url: string; version: string } | { ok: false; reason: string }
  > => ipcRenderer.invoke('openloaf:app:get-latest-installer-url'),
  // Resolve local file path from a File object.
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  // Local Office helpers.
  office: {
    convertDocxToSfdt: (payload: { uri: string }): Promise<DocxToSfdtResult> =>
      ipcRenderer.invoke('openloaf:office:convert-docx-to-sfdt', payload),
  },
  // System calendar access.
  calendar: {
    requestPermission: (): Promise<CalendarResult<CalendarPermissionState>> =>
      ipcRenderer.invoke('openloaf:calendar:permission'),
    getCalendars: (): Promise<CalendarResult<CalendarItem[]>> =>
      ipcRenderer.invoke('openloaf:calendar:list-calendars'),
    getReminderLists: (): Promise<CalendarResult<CalendarItem[]>> =>
      ipcRenderer.invoke('openloaf:calendar:list-reminders'),
    setSyncRange: (payload: { range?: CalendarRange }): Promise<{ ok: true } | { ok: false; reason?: string }> =>
      ipcRenderer.invoke('openloaf:calendar:set-sync-range', payload),
    syncNow: (payload: { range?: CalendarRange }): Promise<{ ok: true } | { ok: false; reason?: string }> =>
      ipcRenderer.invoke('openloaf:calendar:sync', payload),
    getEvents: (range: CalendarRange): Promise<CalendarResult<CalendarEvent[]>> =>
      ipcRenderer.invoke('openloaf:calendar:get-events', range),
    getReminders: (range: CalendarRange): Promise<CalendarResult<CalendarEvent[]>> =>
      ipcRenderer.invoke('openloaf:calendar:get-reminders', range),
    createEvent: (payload: Omit<CalendarEvent, "id">): Promise<CalendarResult<CalendarEvent>> =>
      ipcRenderer.invoke('openloaf:calendar:create-event', payload),
    createReminder: (payload: Omit<CalendarEvent, "id">): Promise<CalendarResult<CalendarEvent>> =>
      ipcRenderer.invoke('openloaf:calendar:create-reminder', payload),
    updateEvent: (payload: CalendarEvent): Promise<CalendarResult<CalendarEvent>> =>
      ipcRenderer.invoke('openloaf:calendar:update-event', payload),
    updateReminder: (payload: CalendarEvent): Promise<CalendarResult<CalendarEvent>> =>
      ipcRenderer.invoke('openloaf:calendar:update-reminder', payload),
    deleteEvent: (payload: { id: string }): Promise<CalendarResult<{ id: string }>> =>
      ipcRenderer.invoke('openloaf:calendar:delete-event', payload),
    deleteReminder: (payload: { id: string }): Promise<CalendarResult<{ id: string }>> =>
      ipcRenderer.invoke('openloaf:calendar:delete-reminder', payload),
    subscribeChanges: (handler: (detail: { source: "system" }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, detail: { source: "system" }) => {
        handler(detail);
      };
      ipcRenderer.on('openloaf:calendar:changed', listener);
      // 逻辑：首次订阅时告知主进程开始监听系统日历。
      ipcRenderer.invoke('openloaf:calendar:watch').catch((): void => {});
      return () => {
        ipcRenderer.removeListener('openloaf:calendar:changed', listener);
        ipcRenderer.invoke('openloaf:calendar:unwatch').catch((): void => {});
      };
    },
  },
});

// 主进程会推送 WebContentsView 的真实加载状态（dom-ready 等），这里转成 window 事件给 web UI 消费。
ipcRenderer.on('openloaf:webcontents-view:status', (_event, detail) => {
  try {
    window.dispatchEvent(
      new CustomEvent('openloaf:webcontents-view:status', { detail })
    );
  } catch {
    // ignore
  }
});

ipcRenderer.on('openloaf:webcontents-view:window-open', (_event, detail) => {
  try {
    window.dispatchEvent(
      new CustomEvent('openloaf:webcontents-view:window-open', { detail })
    );
  } catch {
    // ignore
  }
});

ipcRenderer.on('openloaf:fs:transfer-progress', (_event, detail) => {
  try {
    window.dispatchEvent(
      new CustomEvent('openloaf:fs:transfer-progress', { detail })
    );
  } catch {
    // ignore
  }
});

ipcRenderer.on('openloaf:fs:drag-log', (_event, detail) => {
  try {
    window.dispatchEvent(
      new CustomEvent('openloaf:fs:drag-log', { detail })
    );
  } catch {
    // ignore
  }
});

ipcRenderer.on('openloaf:fs:transfer-error', (_event, detail) => {
  try {
    window.dispatchEvent(
      new CustomEvent('openloaf:fs:transfer-error', { detail })
    );
  } catch {
    // ignore
  }
});

ipcRenderer.on('openloaf:fs:transfer-complete', (_event, detail) => {
  try {
    window.dispatchEvent(
      new CustomEvent('openloaf:fs:transfer-complete', { detail })
    );
  } catch {
    // ignore
  }
});

ipcRenderer.on('openloaf:incremental-update:status', (_event, detail) => {
  try {
    window.dispatchEvent(
      new CustomEvent('openloaf:incremental-update:status', { detail })
    );
  } catch {
    // ignore
  }
});

ipcRenderer.on('openloaf:auto-update:status', (_event, detail) => {
  try {
    window.dispatchEvent(
      new CustomEvent('openloaf:auto-update:status', { detail })
    );
  } catch {
    // ignore
  }
});

ipcRenderer.on('openloaf:speech:result', (_event, detail) => {
  try {
    window.dispatchEvent(
      new CustomEvent('openloaf:speech:result', { detail })
    );
  } catch {
    // ignore
  }
});

ipcRenderer.on('openloaf:speech:state', (_event, detail) => {
  try {
    window.dispatchEvent(
      new CustomEvent('openloaf:speech:state', { detail })
    );
  } catch {
    // ignore
  }
});

ipcRenderer.on('openloaf:speech:error', (_event, detail) => {
  try {
    window.dispatchEvent(
      new CustomEvent('openloaf:speech:error', { detail })
    );
  } catch {
    // ignore
  }
});

ipcRenderer.on('openloaf:notification:click', (_event, detail) => {
  try {
    window.dispatchEvent(
      new CustomEvent('openloaf:notification:click', { detail })
    );
  } catch {
    // ignore
  }
});

ipcRenderer.on('openloaf:server-crash', (_event, detail) => {
  try {
    window.dispatchEvent(
      new CustomEvent('openloaf:server-crash', { detail })
    );
  } catch {
    // ignore
  }
});

// 托盘菜单"新建对话"事件转发到 web 端。
ipcRenderer.on('openloaf:tray:new-conversation', () => {
  try {
    window.dispatchEvent(
      new CustomEvent('openloaf:tray:new-conversation')
    );
  } catch {
    // ignore
  }
});

// 托盘菜单导航事件转发到 web 端。
ipcRenderer.on('openloaf:tray:navigate', (_event, detail) => {
  try {
    window.dispatchEvent(
      new CustomEvent('openloaf:tray:navigate', { detail })
    );
  } catch {
    // ignore
  }
});

// 主进程请求关闭确认：转发到 web 端弹出 UI 对话框。
ipcRenderer.on('openloaf:confirm-close', (_event, detail) => {
  try {
    // 立即发送 ack，告知主进程 Web 端已收到请求并将弹出对话框，
    // 使主进程取消超时保护，等待用户操作。
    ipcRenderer.send('openloaf:confirm-close:ack');
    window.dispatchEvent(
      new CustomEvent('openloaf:confirm-close', { detail })
    );
  } catch {
    // ignore
  }
});
