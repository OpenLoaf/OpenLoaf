import { app, BrowserWindow, Menu, session, nativeImage } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import Module from 'node:module';
import path from 'path';
import { installAutoUpdate } from './autoUpdate';
import { installIncrementalUpdate } from './incrementalUpdate';

// 打包后原生模块（sharp、@libsql 等）位于 Resources/node_modules 目录。
// Node.js 标准解析会从 asar 向上查找到 Resources/node_modules/，
// globalPaths 作为额外保障。
if (app.isPackaged) {
  const moduleGlobalPaths = (Module as unknown as { globalPaths: string[] }).globalPaths;
  moduleGlobalPaths.push(path.join(process.resourcesPath, 'node_modules'));
}
import {
  createStartupLogger,
  registerProcessErrorLogging,
  type Logger,
} from './logging/startupLogger';
import { registerIpcHandlers } from './ipc';
import { createServiceManager, type ServiceManager } from './services/serviceManager';
import { resolveRuntimePorts, type RuntimePorts } from './services/portAllocation';
import { WEBPACK_ENTRIES } from './webpackEntries';
import { createMainWindow } from './windows/mainWindow';
import {
  resolveWindowIconImage,
  resolveWindowIconInfo,
  resolveWindowIconPath,
} from './resolveWindowIcon';

const APP_DISPLAY_NAME = 'Tenas';
// 中文注释：桌面端协议名称，用于从浏览器唤起应用。
const APP_PROTOCOL = 'tenas';
// 中文注释：协议唤起 URL 前缀。
const APP_PROTOCOL_PREFIX = `${APP_PROTOCOL}://`;

/**
 * A 方案架构说明：
 * - Electron 只做原生“壳”，不承载业务渲染逻辑
 * - UI 来自 `apps/web` (Next.js)，通过 `webUrl` 加载（dev: next dev；prod: 本地静态导出并由 Electron 内置 http 服务提供）
 * - Backend 来自 `apps/server`，通过 `serverUrl` 访问（dev: `pnpm --filter server dev`；prod: `server.mjs`）
 */
const { log } = createStartupLogger();
registerProcessErrorLogging(log);

// 强制对齐 macOS 菜单栏与 Dock 的应用显示名（dev 模式默认会显示 Electron）。
app.setName(APP_DISPLAY_NAME);
// 同步 macOS 关于面板的应用显示名，避免 dev 模式仍显示 Electron。
app.setAboutPanelOptions({ applicationName: APP_DISPLAY_NAME });
registerProtocolClient(log);

log(`App starting. UserData: ${app.getPath('userData')}`);
log(`Executable: ${process.execPath}`);
log(`Resources Path: ${process.resourcesPath}`);

let runtimePorts: RuntimePorts | null = null;
const runtimePortsReady = resolveRuntimePorts({
  serverUrlEnv: process.env.TENAS_SERVER_URL,
  webUrlEnv: process.env.TENAS_WEB_URL,
  cdpPortEnv: process.env.TENAS_REMOTE_DEBUGGING_PORT,
  cdpHostEnv: process.env.TENAS_REMOTE_DEBUGGING_HOST,
})
  .then((ports) => {
    // 中文注释：提前锁定随机端口并写回环境变量，保证 web/server/CDP 同步。
    process.env.TENAS_REMOTE_DEBUGGING_PORT = String(ports.cdpPort);
    process.env.TENAS_SERVER_URL = ports.serverUrl;
    process.env.TENAS_WEB_URL = ports.webUrl;
    app.commandLine.appendSwitch('remote-debugging-port', String(ports.cdpPort));
    runtimePorts = ports;
    return ports;
  })
  .catch((err) => {
    log(`Failed to resolve runtime ports: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  });

let services: ServiceManager | null = null;
let mainWindow: BrowserWindow | null = null;
/** Whether React DevTools has been installed in this session. */
let reactDevToolsInstalled = false;
// 中文注释：应用未就绪前缓存的协议唤起链接。
let pendingProtocolUrl: string | null = null;
let servicesStopped = false;

function stopServices(reason: string) {
  if (servicesStopped) return;
  servicesStopped = true;
  log(`Stopping managed services (${reason}).`);
  services?.stop();
}

/** Extract protocol URL from a argv list. */
function extractProtocolUrl(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith(APP_PROTOCOL_PREFIX)) ?? null;
}

/** Register the app as the default protocol client. */
function registerProtocolClient(log: Logger): void {
  if (app.isPackaged) {
    const registered = app.setAsDefaultProtocolClient(APP_PROTOCOL);
    log(`Protocol client registration (${APP_PROTOCOL}): ${registered ? 'ok' : 'failed'}`);
    return;
  }
  const appEntry = process.argv[1];
  if (!appEntry) {
    const registered = app.setAsDefaultProtocolClient(APP_PROTOCOL);
    log(`Protocol client registration (${APP_PROTOCOL}): ${registered ? 'ok' : 'failed'}`);
    return;
  }
  const registered = app.setAsDefaultProtocolClient(APP_PROTOCOL, process.execPath, [
    path.resolve(appEntry),
  ]);
  log(`Protocol client registration (${APP_PROTOCOL}): ${registered ? 'ok' : 'failed'}`);
}

/** Focus the existing main window if possible. */
function focusMainWindow(): BrowserWindow | null {
  const win = mainWindow ?? BrowserWindow.getAllWindows()[0] ?? null;
  if (!win) return null;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  return win;
}

/** Handle incoming protocol URL. */
function handleProtocolUrl(url: string): void {
  // 中文注释：协议唤起时优先聚焦主窗口，后续可扩展为路由跳转。
  if (!focusMainWindow()) {
    pendingProtocolUrl = url;
    return;
  }
  pendingProtocolUrl = null;
  log(`Protocol URL handled: ${url}`);
}

// 中文注释：记录启动时传入的协议链接，待窗口准备就绪后处理。
const initialProtocolUrl = extractProtocolUrl(process.argv);
if (initialProtocolUrl) {
  pendingProtocolUrl = initialProtocolUrl;
}

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
/** Hosts that must never go through a proxy (Electron → local server). */
const LOCAL_BYPASS_RULES = 'localhost,127.0.0.1,::1';

async function configureProxy(log: Logger) {
  const config = resolveProxyConfig();
  if (!config) {
    // 即使没有显式代理环境变量，macOS 系统代理（ClashX/Surge 等）也会生效。
    // 强制绕过本地回环，避免 Electron 到本地 server 的请求被代理转发，
    // 导致 server 看到的 remote address 不是 127.0.0.1。
    try {
      await session.defaultSession.setProxy({
        proxyBypassRules: LOCAL_BYPASS_RULES,
      });
      log(`Local proxy bypass configured: ${LOCAL_BYPASS_RULES}`);
    } catch (error) {
      log(`Local proxy bypass failed: ${String(error)}`);
    }
    return;
  }

  // 显式代理模式：合并用户 bypass 规则与本地回环绕过。
  const mergedBypass = config.bypassRules
    ? `${config.bypassRules},${LOCAL_BYPASS_RULES}`
    : LOCAL_BYPASS_RULES;

  try {
    await session.defaultSession.setProxy({
      proxyRules: config.rules,
      proxyBypassRules: mergedBypass,
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
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: APP_DISPLAY_NAME,
      submenu: [
        {
          label: `About ${APP_DISPLAY_NAME}`,
          click: () => app.showAboutPanel(),
        },
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
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
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
 * Installs React DevTools in development mode.
 */
async function installReactDevTools(log: Logger): Promise<void> {
  if (app.isPackaged) return;
  if (reactDevToolsInstalled) return;
  try {
    await installExtension(REACT_DEVELOPER_TOOLS, {
      loadExtensionOptions: { allowFileAccess: true },
    });
    reactDevToolsInstalled = true;
    log('React DevTools installed.');
  } catch (error) {
    // 逻辑：调试工具安装失败不阻塞启动。
    log(`React DevTools install failed: ${String(error)}`);
  }
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
  await installReactDevTools(log);

  // IPC handlers 必须先注册，避免渲染端（apps/web）调用时找不到处理器。
  registerIpcHandlers({ log });

  // service manager 统一管理：dev 下的子进程（server/web），prod 下的本地静态服务 + server 进程。
  services = createServiceManager(log);

  const ports = runtimePorts ?? (await runtimePortsReady);
  const initialServerUrl = ports.serverUrl;
  const initialWebUrl = ports.webUrl;
  const initialCdpPort = ports.cdpPort;

  // 主窗口先展示轻量 loading 页面，待 `apps/web` 可用后再切换到真实 UI。
  const created = await createMainWindow({
    log,
    services,
    entries: WEBPACK_ENTRIES,
    initialServerUrl,
    initialWebUrl,
    initialCdpPort,
  });
  mainWindow = created.win;
  if (pendingProtocolUrl) {
    handleProtocolUrl(pendingProtocolUrl);
  }

  // 打包版自动检查 Electron 本体更新；dev 模式会自动跳过。
  installAutoUpdate({ log });
  // 增量更新（server/web）；dev 模式会自动跳过。
  installIncrementalUpdate({ log });

  if (!app.isPackaged) {
    // 逻辑：开发环境默认打开 DevTools，方便调试。
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    log('DevTools opened (dev mode).');
  }
}

// 防止多开：避免重复启动两套 server/web 进程组。
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log('Could not get single instance lock. Quitting.');
  app.quit();
} else {
  app.on('open-url', (event, url) => {
    // 中文注释：macOS 协议唤起回调。
    event.preventDefault();
    handleProtocolUrl(url);
  });

  // 第二个实例启动时：把现有窗口拉到前台即可。
  app.on('second-instance', (_event, argv) => {
    log('Second instance detected.');
    const protocolUrl = extractProtocolUrl(argv);
    if (protocolUrl) {
      handleProtocolUrl(protocolUrl);
      return;
    }
    focusMainWindow();
  });

  // 退出前：清理子进程/本地服务。
  app.on('before-quit', () => {
    log('Before quit.');
    // 尽力清理：关闭我们启动的子进程/本地服务，避免退出卡住。
    stopServices('before-quit');
  });

  app.on('will-quit', () => stopServices('will-quit'));
  app.on('quit', () => stopServices('quit'));

  const handleProcessTermination = (reason: string) => {
    log(`Process shutdown (${reason}).`);
    stopServices(`process:${reason}`);
  };

  const handleSignal = (signal: NodeJS.Signals) => {
    log(`Received ${signal}.`);
    stopServices(`signal:${signal}`);
  };
  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);
  process.on('SIGHUP', handleSignal);
  process.once('exit', (code) => handleProcessTermination(`exit:${code ?? 'null'}`));
  process.once('uncaughtException', () => handleProcessTermination('uncaughtException'));
  process.once('unhandledRejection', () => handleProcessTermination('unhandledRejection'));

  app.whenReady().then(() => {
    log('App ready.');
    if (process.platform === 'darwin' && app.dock) {
      const iconInfo = resolveWindowIconInfo();
      if (iconInfo) {
        // 中文注释：开发模式下也显式设置 Dock / Cmd+Tab 图标。
        app.dock.setIcon(iconInfo.image);
        log(`Dock icon path: ${iconInfo.path}`);
        // 中文注释：输出到控制台，方便本地调试时直接查看。
        console.log(`Dock icon path: ${iconInfo.path}`);
      } else {
        log('Dock icon path not found.');
        console.log('Dock icon path not found.');
      }
    }
    void boot();
  });

  // 除 macOS 外：所有窗口关闭即退出。
  app.on('window-all-closed', () => {
    log('All windows closed.');
    if (process.platform !== 'darwin') {
      stopServices('window-all-closed');
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
