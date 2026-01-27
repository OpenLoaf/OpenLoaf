import { BrowserWindow, WebContents, WebContentsView } from 'electron';
import { resolveWindowIconPath } from '../resolveWindowIcon';

type ViewBounds = { x: number; y: number; width: number; height: number };
export type UpsertWebContentsViewArgs = {
  key: string;
  url: string;
  bounds: ViewBounds;
  visible?: boolean;
};

const viewMapsByWindowId = new Map<number, Map<string, WebContentsView>>();
const shortcutBridgeInstalled = new WeakSet<WebContentsView>();
const desiredUrlByView = new WeakMap<WebContentsView, string>();
const viewStatusEmitterInstalled = new WeakSet<WebContentsView>();
const windowOpenHandlerInstalled = new WeakSet<WebContentsView>();

type WebContentsViewLoadFailed = {
  errorCode: number;
  errorDescription: string;
  validatedURL: string;
};

export type WebContentsViewStatus = {
  key: string;
  webContentsId: number;
  url?: string;
  title?: string;
  faviconUrl?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  loading?: boolean;
  ready?: boolean;
  failed?: WebContentsViewLoadFailed;
  destroyed?: boolean;
  ts: number;
};

export type WebContentsViewWindowOpen = {
  key: string;
  url: string;
  disposition?: string;
  frameName?: string;
};

const viewStatusByWindowId = new Map<number, Map<string, WebContentsViewStatus>>();

function getOrCreateStatusMapForWindow(win: BrowserWindow) {
  const existing = viewStatusByWindowId.get(win.id);
  if (existing) return existing;
  const map = new Map<string, WebContentsViewStatus>();
  viewStatusByWindowId.set(win.id, map);
  win.on('closed', () => {
    viewStatusByWindowId.delete(win.id);
  });
  return map;
}

function emitViewStatus(
  win: BrowserWindow,
  key: string,
  next: Omit<WebContentsViewStatus, 'key' | 'ts'> & Partial<Pick<WebContentsViewStatus, 'url' | 'title' | 'loading' | 'ready' | 'failed' | 'destroyed'>>
) {
  if (win.isDestroyed()) return;
  const map = getOrCreateStatusMapForWindow(win);
  const prev = map.get(key);
  const payload: WebContentsViewStatus = {
    ...prev,
    ...next,
    key,
    ts: Date.now(),
  };
  map.set(key, payload);
  try {
    win.webContents.send('tenas:webcontents-view:status', payload);
  } catch {
    // ignore
  }
}

/**
 * Get navigation availability for a WebContents instance.
 */
function getNavigationState(webContents: WebContents): { canGoBack: boolean; canGoForward: boolean } {
  return {
    canGoBack: webContents.canGoBack(),
    canGoForward: webContents.canGoForward(),
  };
}

function emitWindowOpen(win: BrowserWindow, payload: WebContentsViewWindowOpen) {
  if (win.isDestroyed()) return;
  try {
    console.log('[webcontents-view] window-open', payload);
    win.webContents.send('tenas:webcontents-view:window-open', payload);
  } catch {
    // ignore
  }
}

/**
 * Install handler to intercept window.open / target=_blank and forward to renderer.
 */
function installWindowOpenHandler(win: BrowserWindow, key: string, view: WebContentsView) {
  if (windowOpenHandlerInstalled.has(view)) return;
  windowOpenHandlerInstalled.add(view);

  view.webContents.setWindowOpenHandler((details) => {
    // 拦截新窗口，交由渲染端决定是否创建浏览器标签页。
    emitWindowOpen(win, {
      key,
      url: details.url,
      disposition: details.disposition,
      frameName: details.frameName,
    });
    return { action: 'deny' };
  });
}

/**
 * 将 WebContentsView 的真实加载状态（dom-ready 等）推送到渲染端：
 * - 由主进程监听 webContents 事件，避免渲染端用定时器猜测
 * - 用于精准控制 loading UI，以及决定何时真正展示 WebContentsView
 */
function installViewStatusEmitter(win: BrowserWindow, key: string, view: WebContentsView) {
  if (viewStatusEmitterInstalled.has(view)) return;
  viewStatusEmitterInstalled.add(view);

  const wc = view.webContents;

  // 中文注释：只跟踪主框架的加载状态，避免子 frame 加载造成 UI 闪烁。
  let mainFrameLoading = false;
  let mainFrameReady = false;

  emitViewStatus(win, key, {
    webContentsId: wc.id,
    url: wc.getURL() || undefined,
    loading: false,
    ...getNavigationState(wc),
    ready: false,
  });

  wc.on('did-start-loading', () => {
    if (mainFrameReady) return;
    if (!mainFrameLoading) mainFrameLoading = true;
    emitViewStatus(win, key, {
      webContentsId: wc.id,
      url: wc.getURL() || undefined,
      loading: true,
      ...getNavigationState(wc),
      ready: false,
      failed: undefined,
      destroyed: false,
    });
  });

  // 用户选择以 dom-ready 作为“页面可展示”的 ready 信号。
  wc.on('dom-ready', () => {
    mainFrameLoading = false;
    mainFrameReady = true;
    emitViewStatus(win, key, {
      webContentsId: wc.id,
      url: wc.getURL() || undefined,
      loading: false,
      ...getNavigationState(wc),
      ready: true,
      failed: undefined,
      destroyed: false,
    });
  });

  wc.on('did-stop-loading', () => {
    if (!mainFrameLoading) return;
    mainFrameLoading = false;
    emitViewStatus(win, key, {
      webContentsId: wc.id,
      url: wc.getURL() || undefined,
      loading: false,
      ...getNavigationState(wc),
      destroyed: false,
    });
  });

  wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    mainFrameLoading = false;
    mainFrameReady = false;
    emitViewStatus(win, key, {
      webContentsId: wc.id,
      url: wc.getURL() || undefined,
      loading: false,
      ...getNavigationState(wc),
      ready: false,
      failed: { errorCode, errorDescription, validatedURL },
      destroyed: false,
    });
  });

  wc.on('did-navigate', (_event, url) => {
    mainFrameReady = false;
    emitViewStatus(win, key, {
      webContentsId: wc.id,
      url,
      loading: mainFrameLoading,
      ...getNavigationState(wc),
      ready: false,
      failed: undefined,
      destroyed: false,
    });
  });

  wc.on('did-navigate-in-page', (_event, url) => {
    mainFrameLoading = false;
    mainFrameReady = true;
    emitViewStatus(win, key, {
      webContentsId: wc.id,
      url,
      loading: false,
      ...getNavigationState(wc),
      // in-page navigation（hash/history）不一定触发 dom-ready，保持 ready=true。
      ready: true,
      destroyed: false,
    });
  });

  wc.on('page-title-updated', (_event, title) => {
    emitViewStatus(win, key, {
      webContentsId: wc.id,
      title: title || undefined,
      ...getNavigationState(wc),
      destroyed: false,
    });
  });

  wc.on('page-favicon-updated', (_event, favicons) => {
    const faviconUrl = Array.isArray(favicons) ? favicons[0] : undefined;
    emitViewStatus(win, key, {
      webContentsId: wc.id,
      url: wc.getURL() || undefined,
      faviconUrl,
      ...getNavigationState(wc),
      destroyed: false,
    });
  });

  wc.on('did-start-navigation', (_event, url, _isInPlace, isMainFrame) => {
    if (!isMainFrame) return;
    mainFrameLoading = true;
    mainFrameReady = false;
    emitViewStatus(win, key, {
      webContentsId: wc.id,
      url,
      loading: true,
      ...getNavigationState(wc),
      ready: false,
      failed: undefined,
      destroyed: false,
    });
  });

  wc.on('did-frame-finish-load', (_event, isMainFrame) => {
    if (!isMainFrame) return;
    mainFrameLoading = false;
    if (!mainFrameReady) mainFrameReady = true;
    emitViewStatus(win, key, {
      webContentsId: wc.id,
      url: wc.getURL() || undefined,
      loading: false,
      ...getNavigationState(wc),
      ready: mainFrameReady,
      destroyed: false,
    });
  });
}

/**
 * 安全释放 WebContents：
 * - Electron 的类型定义中未暴露 `webContents.destroy()`，但部分运行时对象确实存在该方法
 * - 优先调用 destroy，兜底调用 close
 */
function safeDisposeWebContents(webContents: WebContents) {
  const maybe = webContents as unknown as { destroy?: () => void; close?: () => void };
  if (typeof maybe.destroy === 'function') {
    maybe.destroy();
    return;
  }
  if (typeof maybe.close === 'function') {
    maybe.close();
  }
}


/**
 * Convert `before-input-event`'s `input.key` into an Electron `sendInputEvent`
 * `keyCode` that works well with accelerators (e.g. `'w'` -> `'W'`).
 */
function toAcceleratorKeyCode(key: string): string {
  if (!key) return '';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/**
 * Decide which shortcuts should be "owned" by the host app even when the
 * embedded WebContentsView is focused.
 *
 * Problem this solves:
 * - When WebContentsView has focus, Electron's default menu/window shortcuts
 *   can run and override the app's own shortcut handling.
 * - On macOS, `Cmd+W` commonly closes tabs in apps, but Electron may close the
 *   entire BrowserWindow if the embedded view is focused.
 *
 * We keep this allowlist small to avoid breaking normal website shortcuts.
 */
function shouldForwardShortcut(input: Electron.Input): boolean {
  const key = input.key?.toLowerCase();
  if (!key) return false;

  const cmdOrCtrl = process.platform === 'darwin' ? input.meta : input.control;
  if (!cmdOrCtrl) return false;

  // Keep this list minimal and focused on app-level shortcuts that would
  // otherwise fall back to the default Electron window/menu behaviors.
  return key === 'w';
}

/**
 * Install a "shortcut bridge" for a given embedded view:
 * - intercepts specific shortcuts in the view
 * - prevents Electron default handling (menu/window)
 * - re-dispatches the same keyboard event to the host renderer so the app's
 *   shortcut system continues to work even when the embedded view is focused
 */
function installShortcutBridge(win: BrowserWindow, view: WebContentsView) {
  if (shortcutBridgeInstalled.has(view)) return;
  shortcutBridgeInstalled.add(view);

  view.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' && input.type !== 'keyUp') return;
    if (!shouldForwardShortcut(input)) return;

    // Prevent default page key handling and Electron menu shortcuts (e.g. Cmd+W
    // closing the window), then re-dispatch to the host renderer so the app's
    // own shortcut handler can run even when the embedded view is focused.
    event.preventDefault();

    const keyCode = toAcceleratorKeyCode(input.key);
    if (!keyCode) return;

    const modifiers: Array<
      | 'shift'
      | 'control'
      | 'ctrl'
      | 'alt'
      | 'meta'
      | 'command'
      | 'cmd'
    > = [];
    if (input.shift) modifiers.push('shift');
    if (input.control) modifiers.push('control');
    if (input.alt) modifiers.push('alt');
    if (input.meta) modifiers.push(process.platform === 'darwin' ? 'command' : 'meta');

    win.webContents.sendInputEvent({
      type: input.type,
      keyCode,
      modifiers,
    });
  });
}

/**
 * 将 bounds 规整为安全值（取整、非负），避免传入 NaN/负值导致渲染异常或崩溃。
 */
function clampViewBounds(bounds: ViewBounds): ViewBounds {
  const safe = {
    x: Number.isFinite(bounds.x) ? Math.round(bounds.x) : 0,
    y: Number.isFinite(bounds.y) ? Math.round(bounds.y) : 0,
    width: Number.isFinite(bounds.width) ? Math.round(bounds.width) : 0,
    height: Number.isFinite(bounds.height) ? Math.round(bounds.height) : 0,
  };
  safe.width = Math.max(0, safe.width);
  safe.height = Math.max(0, safe.height);
  return safe;
}

/**
 * 规范化外部 URL：
 * - 支持无协议的 `example.com`（默认补 https）
 * - 支持 `localhost:xxxx`（默认补 http）
 * - 其余必须是显式协议的 URL
 */
function normalizeExternalUrl(raw: string): string {
  const value = raw.trim();
  if (!value) {
    throw new Error('URL is empty');
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) return value;
  if (/^localhost(:\d+)?(\/|$)/.test(value)) return `http://${value}`;
  return `https://${value}`;
}

/**
 * 为指定 URL 创建一个独立的 BrowserWindow 并加载。
 * 用于“外部链接”场景，不污染主窗口。
 */
export function createBrowserWindowForUrl(url: string): BrowserWindow {
  const normalized = normalizeExternalUrl(url);
  const parsed = new URL(normalized);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  const parent = BrowserWindow.getAllWindows()[0];
  const windowIcon = resolveWindowIconPath();
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    parent: parent ?? undefined,
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  void win.loadURL(parsed.toString());
  return win;
}

/**
 * 获取/创建某个窗口的 WebContentsView map，并在窗口关闭时统一清理。
 */
function getOrCreateViewMapForWindow(
  win: BrowserWindow
): Map<string, WebContentsView> {
  const existing = viewMapsByWindowId.get(win.id);
  if (existing) return existing;

  const map = new Map<string, WebContentsView>();
  viewMapsByWindowId.set(win.id, map);

  win.on('closed', () => {
    for (const view of map.values()) {
      try {
        win.contentView.removeChildView(view);
      } catch {
        // ignore
      }
      try {
        safeDisposeWebContents(view.webContents);
      } catch {
        // ignore
      }
    }
    viewMapsByWindowId.delete(win.id);
  });

  return map;
}

/**
 * 获取指定窗口内某个 key 对应的 WebContentsView（只读）。
 * - 用于主进程侧做后续操作（例如获取 webContentsId / debugger attach）
 */
export function getWebContentsView(win: BrowserWindow, key: string): WebContentsView | undefined {
  const map = viewMapsByWindowId.get(win.id);
  return map?.get(key);
}

/**
 * Get the number of WebContentsViews created for the given BrowserWindow.
 * This uses the internal view map as the single source of truth.
 */
export function getWebContentsViewCount(win: BrowserWindow): number {
  const map = viewMapsByWindowId.get(win.id);
  return map?.size ?? 0;
}

/**
 * 在指定窗口内创建或更新一个 WebContentsView：
 * - key 用于标识某个“嵌入面板”
 * - bounds 用于定位/大小（来自渲染端 DOM rect）
 * - visible 控制视图显示（尽力调用 setVisible）
 */
export function upsertWebContentsView(
  win: BrowserWindow,
  args: UpsertWebContentsViewArgs
) {
  const key = String(args.key ?? '').trim();
  if (!key) throw new Error('Missing view key');

  const url = normalizeExternalUrl(args.url ?? '');
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }

  const bounds = clampViewBounds(args.bounds);
  const map = getOrCreateViewMapForWindow(win);
  let view = map.get(key);

  if (!view) {
    // Each embedded panel is its own WebContentsView. Once created, we keep it
    // alive and only update bounds / URL.
    view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    console.log('[webcontents-view] create', { key, url });
    map.set(key, view);
    win.contentView.addChildView(view);
    // Install once per view; this prevents app-level shortcuts (e.g. Cmd+W)
    // from being hijacked by the embedded web contents.
    installShortcutBridge(win, view);
    // 拦截 window.open，避免弹出独立窗口。
    installWindowOpenHandler(win, key, view);
    // 把 WebContentsView 的真实加载状态（dom-ready 等）推送到渲染端。
    installViewStatusEmitter(win, key, view);
  }

  try {
    view.setVisible(args.visible !== false);
  } catch {
    // ignore
  }

  view.setBounds(bounds);

  // 仅当“渲染端传入的 URL 发生变化”时才主动 loadURL。
  // 否则如果用户在页面内导航（点击链接/输入地址），每次更新 bounds 都会把页面强制拉回初始 URL。
  const desiredUrl = parsed.toString();
  const lastDesiredUrl = desiredUrlByView.get(view);
  if (lastDesiredUrl !== desiredUrl) {
    desiredUrlByView.set(view, desiredUrl);
    console.log('[webcontents-view] load-url', { key, url: desiredUrl });
    void view.webContents.loadURL(desiredUrl);
  }
}

/**
 * 从指定窗口中移除并销毁某个 WebContentsView。
 */
export function destroyWebContentsView(win: BrowserWindow, key: string) {
  const map = viewMapsByWindowId.get(win.id);
  const view = map?.get(key);
  console.log('[webcontents-view] destroy', { key, exists: Boolean(view) });
  if (!map || !view) return;

  map.delete(key);
  // 通知渲染端该 viewKey 已销毁，避免 UI 继续使用旧状态。
  emitViewStatus(win, key, {
    webContentsId: view.webContents.id,
    destroyed: true,
    loading: false,
    ready: false,
  });
  const statusMap = viewStatusByWindowId.get(win.id);
  statusMap?.delete(key);
  try {
    win.contentView.removeChildView(view);
  } catch {
    // ignore
  }
  try {
    safeDisposeWebContents(view.webContents);
  } catch {
    // ignore
  }
}

/**
 * Navigate backward for the given WebContentsView if available.
 */
export function goBackWebContentsView(win: BrowserWindow, key: string) {
  const view = getWebContentsView(win, key);
  const wc = view?.webContents;
  if (!wc || !wc.canGoBack()) return;
  wc.goBack();
}

/**
 * Navigate forward for the given WebContentsView if available.
 */
export function goForwardWebContentsView(win: BrowserWindow, key: string) {
  const view = getWebContentsView(win, key);
  const wc = view?.webContents;
  if (!wc || !wc.canGoForward()) return;
  wc.goForward();
}

/**
 * Destroy all WebContentsViews for the given BrowserWindow.
 */
export function destroyAllWebContentsViews(win: BrowserWindow) {
  const map = viewMapsByWindowId.get(win.id);
  if (!map || map.size === 0) return;

  // 复制 key 列表，避免遍历过程中 map 被修改。
  const keys = Array.from(map.keys());
  for (const key of keys) {
    destroyWebContentsView(win, key);
  }
}
