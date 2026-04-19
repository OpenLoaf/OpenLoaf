/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { app } from 'electron';
import type { Logger } from '../logging/startupLogger';
import {
  cleanupNextDevLock,
  ensureDevServices,
  findRepoRoot,
  respawnDevServer,
} from './devServices';
import { startProductionServices, type ServerCrashInfo } from './prodServices';
import { delay, isUrlOk } from './urlHealth';

export type { ServerCrashInfo } from './prodServices';

export type RestartServerResult =
  | { ok: true }
  | { ok: false; reason: string };

export type ServiceManager = {
  start: (args: {
    initialServerUrl: string;
    initialWebUrl: string;
    cdpPort: number;
  }) => Promise<{
    serverUrl: string;
    webUrl: string;
  }>;
  /** Subscribe to server crash events (works after start, dev + prod). */
  onServerCrash: (handler: (info: ServerCrashInfo) => void) => () => void;
  /** Restart only the server process, leaving the web side alone. */
  restartServer: () => Promise<RestartServerResult>;
  stop: () => void;
};

/**
 * 尝试优雅停止子进程。
 *
 * 开发环境下子进程通过 run-supervised.mjs 包装启动，supervisor 会：
 *   1. 收到 SIGTERM 后级联 kill(-childPid) 杀掉整个进程树
 *   2. 检测到 stdin EOF（父进程死亡）后自动清理子进程树
 *
 * 生产环境下直接停止 server 进程。
 */
function stopManaged(child: ChildProcess | null) {
  if (!child) return;
  if (child.killed) return;
  const pid = child.pid;
  if (!pid) return;

  if (process.platform === 'win32') {
    try {
      // Kill the entire process tree on Windows.
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      return;
    } catch {
      // Fall through to best-effort kill below.
    }
  }

  // 发送 SIGTERM 给 supervisor/server 进程。
  // supervisor 的 SIGTERM handler 会级联清理子进程树。
  try {
    child.kill('SIGTERM');
  } catch {
    // ignore
  }
}

/**
 * 等待子进程实际退出，最多 timeoutMs 毫秒。
 */
async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    let done = false;
    const onExit = () => {
      if (done) return;
      done = true;
      child.off('exit', onExit);
      resolve();
    };
    child.on('exit', onExit);
    setTimeout(() => {
      if (done) return;
      done = true;
      child.off('exit', onExit);
      resolve();
    }, timeoutMs);
  });
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
  let started = false;

  // 监听器在 start() 之前就可被订阅，所以维护在外层。
  const crashListeners = new Set<(info: ServerCrashInfo) => void>();
  const emitCrash = (info: ServerCrashInfo) => {
    log(`[Server Crash] ${info.stderr.slice(0, 200)}`);
    for (const handler of crashListeners) {
      try {
        handler(info);
      } catch (err) {
        log(`[Server Crash Listener Error] ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  // 这两个由 start() 填充，决定 restartServer 的行为。
  let restartImpl: (() => Promise<RestartServerResult>) | null = null;

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
      managedServer = prod.getServer();
      prod.onServerCrash((info) => emitCrash(info));
      restartImpl = async () => {
        const result = await prod.restartServer();
        managedServer = prod.getServer();
        return result;
      };
      return { serverUrl: initialServerUrl, webUrl: initialWebUrl };
    }

    // 开发环境：优先复用已在跑的服务，否则通过 pnpm workspaces 拉起。
    const dev = await ensureDevServices({
      log,
      initialServerUrl,
      initialWebUrl,
      cdpPort,
      onServerCrash: ({ stderr, exitCode, signal }) => {
        emitCrash({
          stderr: stderr || `Dev server exited (code=${exitCode ?? 'null'} signal=${signal ?? 'null'})`,
          isUpdatedServer: false,
          rolledBack: false,
        });
      },
    });
    managedServer = dev.managedServer;
    managedWeb = dev.managedWeb;
    const devSpec = dev.serverSpawnSpec;
    const devServerUrl = dev.serverUrl;
    if (devSpec) {
      restartImpl = async () => {
        try {
          if (managedServer) {
            stopManaged(managedServer);
            await waitForExit(managedServer, 5000);
          }
          // Wait briefly so the OS releases the listening port.
          const deadline = Date.now() + 5000;
          while (Date.now() < deadline) {
            // 端口空了再 spawn，避免新 server 抢不到端口立刻退出。
            if (!(await isUrlOk(`${devServerUrl}/`, 500))) break;
            await delay(150);
          }
          managedServer = respawnDevServer(devSpec, ({ stderr, exitCode, signal }) => {
            emitCrash({
              stderr: stderr || `Dev server exited (code=${exitCode ?? 'null'} signal=${signal ?? 'null'})`,
              isUpdatedServer: false,
              rolledBack: false,
            });
          });
          return { ok: true };
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          log(`[Dev Server] Restart failed: ${reason}`);
          return { ok: false, reason };
        }
      };
    } else {
      // 复用了外部 server（pnpm dev 起的），无法重启它 — 让用户手动重启外部进程或整个 app。
      restartImpl = async () => ({
        ok: false,
        reason: 'Dev server is externally managed (not spawned by Electron)',
      });
    }
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
  };

  return {
    start,
    stop,
    onServerCrash: (handler) => {
      crashListeners.add(handler);
      return () => crashListeners.delete(handler);
    },
    restartServer: async () => {
      if (!restartImpl) {
        return { ok: false, reason: 'Service manager not started yet' };
      }
      return restartImpl();
    },
  };
}
