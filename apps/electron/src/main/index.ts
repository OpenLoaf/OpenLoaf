import { app, BrowserWindow, Menu, session } from 'electron';
import {
  createStartupLogger,
  registerProcessErrorLogging,
  type Logger,
} from './logging/startupLogger';
import { registerIpcHandlers } from './ipc';
import { createServiceManager, type ServiceManager } from './services/serviceManager';
import { WEBPACK_ENTRIES } from './webpackEntries';
import { createMainWindow } from './windows/mainWindow';
import { getCdpConfig } from '@teatime-ai/config';

/**
 * A 方案架构说明：
 * - Electron 只做原生“壳”，不承载业务渲染逻辑
 * - UI 来自 `apps/web` (Next.js)，通过 `webUrl` 加载（dev: next dev；prod: 本地静态导出并由 Electron 内置 http 服务提供）
 * - Backend 来自 `apps/server`，通过 `serverUrl` 访问（dev: `pnpm --filter server dev`；prod: `server.mjs`）
 */
const DEFAULT_SERVER_URL = 'http://127.0.0.1:3000';
const DEFAULT_WEB_URL = 'http://127.0.0.1:3001';

const { log } = createStartupLogger();
registerProcessErrorLogging(log);

log(`App starting. UserData: ${app.getPath('userData')}`);
log(`Executable: ${process.execPath}`);
log(`Resources Path: ${process.resourcesPath}`);

app.commandLine.appendSwitch(
  'remote-debugging-port',
  String(getCdpConfig().port)
);

let services: ServiceManager | null = null;
let mainWindow: BrowserWindow | null = null;

type ProxyConfig = {
  rules: string;
  bypassRules?: string;
};

/**
 * Ensures localhost and loopback hosts are bypassed by proxy settings.
 */
function ensureLocalNoProxy(): void {
  const raw = process.env.NO_PROXY ?? process.env.no_proxy ?? '';
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const existing = new Set(items);
  const required = ['localhost', '127.0.0.1', '::1'];
  // 追加本地回环地址，避免 dev 启动期请求被代理卡住。
  for (const host of required) {
    if (!existing.has(host)) items.push(host);
  }
  if (items.length === 0) return;
  const merged = items.join(',');
  process.env.NO_PROXY = merged;
  process.env.no_proxy = merged;
}

/**
 * Reads the first non-empty environment variable from a list of keys.
 */
function getEnvValue(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * Parses a proxy string into a Chromium-compatible host token.
 */
function parseProxyTarget(raw: string): { hostPort: string; protocol?: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 带协议的代理用 URL 解析，避免重复拼接协议导致 Chromium 无法识别。
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
  if (!hasScheme) return { hostPort: trimmed };

  try {
    const url = new URL(trimmed);
    if (!url.host) return { hostPort: trimmed };
    const auth =
      url.username && url.password
        ? `${url.username}:${url.password}@`
        : url.username
          ? `${url.username}@`
          : '';
    return {
      hostPort: `${auth}${url.host}`,
      protocol: url.protocol.replace(':', '').toLowerCase(),
    };
  } catch {
    return { hostPort: trimmed };
  }
}

/**
 * Masks proxy credentials in log output.
 */
function maskProxyValue(value: string): string {
  if (!value) return value;
  return value
    .replace(/\/\/([^/@:]+):([^/@]+)@/g, (_match, user) => `//${user}:***@`)
    .replace(/([^/@:]+):([^/@]+)@/g, (_match, user) => `${user}:***@`);
}

/**
 * Builds a proxy rules string for Electron's session.setProxy.
 */
function buildProxyRules(input: {
  http?: string;
  https?: string;
  all?: string;
}): string | null {
  const httpTarget = input.http ? parseProxyTarget(input.http) : null;
  const httpsTarget = input.https ? parseProxyTarget(input.https) : null;
  const allTarget = input.all ? parseProxyTarget(input.all) : null;

  const rules: string[] = [];
  if (httpTarget) rules.push(`http=${httpTarget.hostPort}`);
  if (httpsTarget) rules.push(`https=${httpsTarget.hostPort}`);

  if (rules.length > 0) return rules.join(';');

  if (!allTarget) return null;
  if (allTarget.protocol) return `${allTarget.protocol}://${allTarget.hostPort}`;
  return allTarget.hostPort;
}

/**
 * Normalizes the no_proxy list into Chromium bypass rules.
 */
function buildProxyBypassRules(raw?: string): string | undefined {
  if (!raw) return undefined;
  const rules = raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (rules.length === 0) return undefined;
  return rules.join(',');
}

/**
 * Resolves proxy settings from environment variables.
 */
function resolveProxyConfig(): ProxyConfig | null {
  const httpProxy = getEnvValue(['http_proxy', 'HTTP_PROXY']);
  const httpsProxy = getEnvValue(['https_proxy', 'HTTPS_PROXY']);
  const allProxy = getEnvValue(['all_proxy', 'ALL_PROXY']);
  const noProxy = getEnvValue(['no_proxy', 'NO_PROXY']);

  // 未设置任何代理时保持系统默认设置。
  if (!httpProxy && !httpsProxy && !allProxy) return null;

  const rules = buildProxyRules({ http: httpProxy, https: httpsProxy, all: allProxy });
  if (!rules) return null;

  return {
    rules,
    bypassRules: buildProxyBypassRules(noProxy),
  };
}

/**
 * Applies proxy configuration to the default Electron session.
 */
async function configureProxy(log: Logger) {
  const config = resolveProxyConfig();
  if (!config) return;

  // 仅当环境变量提供代理时才显式设置，避免覆盖用户系统代理。
  try {
    await session.defaultSession.setProxy({
      proxyRules: config.rules,
      proxyBypassRules: config.bypassRules,
    });
    const maskedRules = maskProxyValue(config.rules);
    const maskedBypass = config.bypassRules ? maskProxyValue(config.bypassRules) : undefined;
    const message = maskedBypass
      ? `Proxy configured: ${maskedRules} (bypass: ${maskedBypass})`
      : `Proxy configured: ${maskedRules}`;
    log(message);
    console.info(message);
  } catch (error) {
    const maskedRules = maskProxyValue(config.rules);
    log(`Proxy setup failed: ${String(error)} (rules: ${maskedRules})`);
    console.warn(`Proxy setup failed: ${String(error)} (rules: ${maskedRules})`);
  }
}

function installApplicationMenu() {
  // On macOS, Electron will create a default menu that includes "Close Window"
  // with the `Cmd+W` accelerator. This conflicts with our app-level shortcut
  // (Cmd+W closes a tab/stack in the renderer). Provide an explicit app menu and
  // rebind "Close Window" to `Cmd+Shift+W` instead.
  if (process.platform !== 'darwin') return;

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'close', accelerator: 'Command+Shift+W' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * 应用启动主流程：
 * - 注册 IPC
 * - 启动/确认 dev/prod 服务
 * - 创建主窗口并加载 apps/web
 */
async function boot() {
  installApplicationMenu();

  ensureLocalNoProxy();
  await configureProxy(log);

  // IPC handlers 必须先注册，避免渲染端（apps/web）调用时找不到处理器。
  registerIpcHandlers({ log });

  // service manager 统一管理：dev 下的子进程（server/web），prod 下的本地静态服务 + server 进程。
  services = createServiceManager(log);

  const initialServerUrl = process.env.TEATIME_SERVER_URL ?? DEFAULT_SERVER_URL;
  const initialWebUrl = process.env.TEATIME_WEB_URL ?? DEFAULT_WEB_URL;

  // 主窗口先展示轻量 loading 页面，待 `apps/web` 可用后再切换到真实 UI。
  const created = await createMainWindow({
    log,
    services,
    entries: WEBPACK_ENTRIES,
    initialServerUrl,
    initialWebUrl,
  });
  mainWindow = created.win;

  if (!app.isPackaged) {
    // 开发体验：dev 模式默认打开 DevTools。
    mainWindow.webContents.openDevTools();
  }
}

// 防止多开：避免重复启动两套 server/web 进程组。
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log('Could not get single instance lock. Quitting.');
  app.quit();
} else {
  // 第二个实例启动时：把现有窗口拉到前台即可。
  app.on('second-instance', () => {
    log('Second instance detected.');
    const win = mainWindow ?? BrowserWindow.getAllWindows()[0] ?? null;
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  // 退出前：清理子进程/本地服务。
  app.on('before-quit', () => {
    log('Before quit.');
    // 尽力清理：关闭我们启动的子进程/本地服务，避免退出卡住。
    services?.stop();
  });

  app.whenReady().then(() => {
    log('App ready.');
    void boot();
  });

  // 除 macOS 外：所有窗口关闭即退出。
  app.on('window-all-closed', () => {
    log('All windows closed.');
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // macOS：点击 dock 图标且没有窗口时重新创建主窗口。
  app.on('activate', () => {
    log('Activate event.');
    if (BrowserWindow.getAllWindows().length === 0) {
      void boot();
    }
  });
}
