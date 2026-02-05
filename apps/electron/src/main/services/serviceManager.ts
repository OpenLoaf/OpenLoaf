import { spawn, type ChildProcess } from 'node:child_process';
import { app } from 'electron';
import type { Logger } from '../logging/startupLogger';
import { cleanupNextDevLock, ensureDevServices, findRepoRoot } from './devServices';
import { startProductionServices } from './prodServices';

export type ServiceManager = {
  start: (args: {
    initialServerUrl: string;
    initialWebUrl: string;
    cdpPort: number;
  }) => Promise<{
    serverUrl: string;
    webUrl: string;
  }>;
  stop: () => void;
};

/**
 * 尝试优雅停止子进程（发 SIGTERM）；用于退出时清理。
 */
function stopManaged(child: ChildProcess | null) {
  if (!child) return;
  if (child.killed) return;
  const pid = child.pid;
  if (!pid) return;

  if (process.platform === 'win32') {
    try {
      // Kill the entire process tree on Windows (pnpm -> node -> next/turbopack).
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      return;
    } catch {
      // Fall through to best-effort kill below.
    }
  }

  try {
    child.kill('SIGTERM');
  } catch {
    // ignore
  }
}

/**
 * 创建服务管理器：
 * - dev：按需拉起 apps/server 与 apps/web（或复用已有服务）
 * - prod：启动 server.mjs 并提供本地静态站点服务
 * 同时提供 stop() 做 best-effort 清理。
 */
export function createServiceManager(log: Logger): ServiceManager {
  let managedServer: ChildProcess | null = null;
  let managedWeb: ChildProcess | null = null;
  let productionWebServer: { close: () => void } | null = null;
  let started = false;

  /**
   * 启动并返回服务地址：
   * - dev：按需拉起/复用 apps/server & apps/web
   * - prod：启动 `server.mjs` + 本地静态站点服务
   */
  const start: ServiceManager['start'] = async ({
    initialServerUrl,
    initialWebUrl,
    cdpPort,
  }) => {
    // Electron 可能会多次触发启动流程（例如 macOS activate），因此这里必须保持启动幂等。
    if (started) return { serverUrl: initialServerUrl, webUrl: initialWebUrl };
    started = true;

    if (app.isPackaged) {
      // 生产环境：启动打包后的 server，并在本地提供静态 web 导出站点。
      const prod = await startProductionServices({
        log,
        serverUrl: initialServerUrl,
        webUrl: initialWebUrl,
        cdpPort,
      });
      managedServer = prod.managedServer;
      productionWebServer = prod.productionWebServer;
      return { serverUrl: initialServerUrl, webUrl: initialWebUrl };
    }

    // 开发环境：优先复用已在跑的服务，否则通过 pnpm workspaces 拉起。
    const dev = await ensureDevServices({
      log,
      initialServerUrl,
      initialWebUrl,
      cdpPort,
    });
    managedServer = dev.managedServer;
    managedWeb = dev.managedWeb;
    return { serverUrl: dev.serverUrl, webUrl: dev.webUrl };
  };

  /**
   * 停止服务（best-effort），用于应用退出时清理资源。
   */
  const stop: ServiceManager['stop'] = () => {
    // 尽力关闭：不要求每次都成功，但要避免退出时卡住。
    stopManaged(managedWeb);
    stopManaged(managedServer);
    if (!app.isPackaged && managedWeb) {
      const repoRoot = findRepoRoot(process.cwd());
      if (repoRoot) {
        cleanupNextDevLock({ repoRoot, log, killProcesses: false });
      }
    }
    productionWebServer?.close();
  };

  return { start, stop };
}
