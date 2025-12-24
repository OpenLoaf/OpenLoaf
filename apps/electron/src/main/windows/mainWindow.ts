import { app, BrowserWindow, screen } from 'electron';
import type { Logger } from '../logging/startupLogger';
import type { ServiceManager } from '../services/serviceManager';
import { waitForUrlOk } from '../services/urlHealth';
import { WEBPACK_ENTRIES } from '../webpackEntries';

/**
 * 根据当前屏幕工作区估算一个合适的默认窗口大小，并限制最小/最大值与宽高比。
 */
function getDefaultWindowSize(): { width: number; height: number } {
  const MIN_WIDTH = 800;
  const MIN_HEIGHT = 640;
  const MAX_WIDTH = 2000;
  const ASPECT_W = 16;
  const ASPECT_H = 10;

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const workAreaWidth = display.workAreaSize.width;

  let width = Math.round(workAreaWidth * 0.8);
  width = Math.min(width, MAX_WIDTH);
  width = Math.max(width, MIN_WIDTH);

  let height = Math.round((width * ASPECT_H) / ASPECT_W);
  if (height < MIN_HEIGHT) {
    height = MIN_HEIGHT;
    width = Math.round((height * ASPECT_W) / ASPECT_H);
    width = Math.min(width, MAX_WIDTH);
    width = Math.max(width, MIN_WIDTH);
  }

  return { width, height };
}

/**
 * Keeps the window title pinned to the app display name.
 */
function bindWindowTitle(win: BrowserWindow): void {
  const displayName = app.name || 'TeaTime';
  // 固定窗口标题，避免被 web 的 <title> 覆盖。
  win.setTitle(displayName);
  win.on('page-title-updated', (event) => {
    event.preventDefault();
    win.setTitle(displayName);
  });
}

/**
 * Creates the main window and loads UI:
 * - Load the local loading page first (fast, no dependencies)
 * - Switch to webUrl after apps/web is available
 * - Fall back to the bundled page when loading fails
 */
export async function createMainWindow(args: {
  log: Logger;
  services: ServiceManager;
  entries: typeof WEBPACK_ENTRIES;
  initialServerUrl: string;
  initialWebUrl: string;
  initialCdpPort: number;
}): Promise<{ win: BrowserWindow; serverUrl: string; webUrl: string }> {
  args.log('createMainWindow called');

  const { width, height } = getDefaultWindowSize();
  const isMac = process.platform === 'darwin';

  const mainWindow = new BrowserWindow({
    height,
    width,
    minWidth: 800,
    minHeight: 640,
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 12, y: 12 },
        }
      : {}),
    webPreferences: {
      // preload 提供最小、可类型约束的桥接（`window.teatimeElectron`），用于调用主进程 IPC。
      preload: args.entries.mainPreload,
      // 渲染进程安全默认值：页面不允许直接使用 Node.js。
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // webview 用于应用内嵌浏览面板（WebContentsView 相关功能）。
      webviewTag: true,
    },
  });

  bindWindowTitle(mainWindow);
  args.log('Window created. Loading loading screen...');
  await mainWindow.loadURL(args.entries.loadingWindow);

  try {
    // 确保服务可用：dev 下复用/启动 server & web；prod 下启动 server.mjs + 本地静态站点服务。该调用是幂等的。
    const { webUrl, serverUrl } = await args.services.start({
      initialServerUrl: args.initialServerUrl,
      initialWebUrl: args.initialWebUrl,
      cdpPort: args.initialCdpPort,
    });

    const targetUrl = `${webUrl}/`;
    args.log(`Waiting for web URL: ${targetUrl}`);

    // 等待 apps/web 响应后，把窗口从 loading 页面切换到真实 UI。
    const ok = await waitForUrlOk(targetUrl, {
      timeoutMs: 60_000,
      intervalMs: 300,
    });

    if (ok) {
      const healthUrl = `${serverUrl}/trpc/health`;
      args.log(`Web URL ok: ${targetUrl}. Waiting for server health: ${healthUrl}`);
      // 流程：先确认 apps/web 可访问，再等待 server health 正常后切换到主界面，避免 UI 先加载但后端未就绪。
      const healthOk = await waitForUrlOk(healthUrl, {
        timeoutMs: 60_000,
        intervalMs: 300,
      });
      if (!healthOk) {
        args.log('Server health check failed. Loading fallback renderer entry.');
        await mainWindow.loadURL(args.entries.mainWindow);
        return { win: mainWindow, serverUrl, webUrl };
      }
      args.log(`Server health ok. Loading ${targetUrl}...`);
      await mainWindow.loadURL(targetUrl);
      return { win: mainWindow, serverUrl, webUrl };
    }

    args.log('Web URL check failed. Loading fallback renderer entry.');
    // fallback 是 Forge 打包进来的极小本地页面，用于排查“为什么 web 没启动/没加载”。
    await mainWindow.loadURL(args.entries.mainWindow);
    return { win: mainWindow, serverUrl, webUrl };
  } catch (err) {
    args.log(`Failed to start/load services: ${String(err)}`);
    await mainWindow.loadURL(args.entries.mainWindow);
    return { win: mainWindow, serverUrl: args.initialServerUrl, webUrl: args.initialWebUrl };
  }
}
