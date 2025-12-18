import { BrowserWindow, WebContentsView, shell } from 'electron';

type ViewBounds = { x: number; y: number; width: number; height: number };
export type UpsertWebContentsViewArgs = {
  key: string;
  url: string;
  bounds: ViewBounds;
  visible?: boolean;
};

const viewMapsByWindowId = new Map<number, Map<string, WebContentsView>>();
const shortcutBridgeInstalled = new WeakSet<WebContentsView>();
const openInCurrentTabInstalled = new WeakSet<WebContentsView>();
const desiredUrlByView = new WeakMap<WebContentsView, string>();

/**
 * 禁止网页在「新标签页/新窗口」中打开内容（例如 target=_blank / window.open）：
 * - 统一改为在当前 WebContentsView 中跳转
 * - 避免 Electron 默认创建新窗口导致“一个标签页打开另一个标签页”的体验
 */
function installOpenInCurrentTab(view: WebContentsView) {
  if (openInCurrentTabInstalled.has(view)) return;
  openInCurrentTabInstalled.add(view);

  const navigateInCurrentView = (rawUrl: string) => {
    try {
      const url = normalizeExternalUrl(rawUrl);
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        // 注意：这里是“用户侧导航”，不要更新 desiredUrlByView，
        // 否则下一次渲染端 upsert 可能会把页面强制拉回到旧 URL。
        setImmediate(() => void view.webContents.loadURL(parsed.toString()));
        return;
      }
      void shell.openExternal(parsed.toString());
    } catch {
      // ignore
    }
  };

  // Electron >= 13: 用 setWindowOpenHandler 拦截 window.open / target=_blank。
  if (typeof view.webContents.setWindowOpenHandler === 'function') {
    view.webContents.setWindowOpenHandler((details) => {
      navigateInCurrentView(details.url);
      return { action: 'deny' };
    });
    return;
  }

  // 兼容旧版本 Electron：使用 deprecated 的 new-window 事件。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (view.webContents as any).on('new-window', (event: Electron.Event, url: string) => {
    event.preventDefault();
    navigateInCurrentView(url);
  });
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
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    parent: parent ?? undefined,
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
        view.webContents.destroy();
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
 * - 用于 runtime/tool 在主进程侧做后续操作（例如获取 webContentsId / debugger attach）
 */
export function getWebContentsView(win: BrowserWindow, key: string): WebContentsView | undefined {
  const map = viewMapsByWindowId.get(win.id);
  return map?.get(key);
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
    map.set(key, view);
    win.contentView.addChildView(view);
    // Install once per view; this prevents app-level shortcuts (e.g. Cmd+W)
    // from being hijacked by the embedded web contents.
    installShortcutBridge(win, view);
    // Install once per view; force "new tab" navigations to stay in the same view.
    installOpenInCurrentTab(view);
  }

  try {
    // @ts-expect-error Electron runtime provides setVisible on View.
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
    void view.webContents.loadURL(desiredUrl);
  }
}

/**
 * 从指定窗口中移除并销毁某个 WebContentsView。
 */
export function destroyWebContentsView(win: BrowserWindow, key: string) {
  const map = viewMapsByWindowId.get(win.id);
  const view = map?.get(key);
  if (!map || !view) return;

  map.delete(key);
  try {
    win.contentView.removeChildView(view);
  } catch {
    // ignore
  }
  try {
    view.webContents.destroy();
  } catch {
    // ignore
  }
}
