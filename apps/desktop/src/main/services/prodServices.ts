/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { app } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getOpenLoafRootDir, resolveOpenLoafDatabaseUrl } from '@openloaf/config';
import type { Logger } from '../logging/startupLogger';
import { recordServerCrash, type ServerCrashResult } from '../incrementalUpdate';
import { resolveServerPath } from '../incrementalUpdatePaths';
import { isPortFree } from './portAllocation';
import { delay } from './urlHealth';

export type ServerCrashInfo = {
  /** stderr summary from the crashed server process. */
  stderr: string;
  /** Whether the server was running from an incremental update (not bundled). */
  isUpdatedServer: boolean;
  /** The version that crashed (if it was an updated server). */
  crashedVersion?: string;
  /** Whether the crash triggered a rollback to bundled version. */
  rolledBack: boolean;
};

export function parseEnvFile(filePath: string): Record<string, string> {
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf-8');
    const env: Record<string, string> = {};

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
      const eq = normalized.indexOf('=');
      if (eq <= 0) continue;

      const key = normalized.slice(0, eq).trim();
      let value = normalized.slice(eq + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key) env[key] = value;
    }

    return env;
  } catch {
    return {};
  }
}

function resolveFilePathFromDatabaseUrl(
  databaseUrl: string,
  baseDir: string
): string | null {
  if (!databaseUrl) return null;
  if (!databaseUrl.startsWith('file:')) return null;

  const rawPath = databaseUrl.slice('file:'.length);
  if (!rawPath) return null;
  if (rawPath.startsWith('/')) return rawPath;
  if (/^[a-zA-Z]:[\\/]/.test(rawPath)) return rawPath;
  if (rawPath.startsWith('\\\\')) return rawPath;
  return path.join(baseDir, rawPath);
}

function ensureDir(dirPath: string) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // ignore
  }
}

/**
 * Extracts the hostname from a URL string with a fallback.
 */
function resolveHost(rawUrl: string, fallback: string): string {
  try {
    return new URL(rawUrl).hostname || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Extracts the port from a URL string with a fallback.
 */
function resolvePort(rawUrl: string, fallback: number): number {
  try {
    const port = new URL(rawUrl).port;
    if (!port) return fallback;
    const parsed = Number.parseInt(port, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Holds the spawn context required to (re)launch the bundled server process.
 * Captured once at startup so `restart()` can reuse exactly the same env / args.
 */
type ProdServerContext = {
  log: Logger;
  serverHost: string;
  serverPort: number;
  serverPath: string;
  bundledServerPath: string;
  spawnEnv: NodeJS.ProcessEnv;
};

export type ProdServices = {
  /** Returns the current child process (changes after each restart). */
  getServer: () => ChildProcess | null;
  /** Subscribe to server crash events. Returns an unsubscribe function. */
  onServerCrash: (handler: (info: ServerCrashInfo) => void) => () => void;
  /** Restart the bundled server process. Resolves once a new process is spawned (or fails). */
  restartServer: () => Promise<{ ok: true } | { ok: false; reason: string }>;
};

/**
 * Starts production services:
 * - Launches the bundled `server.mjs` from Resources
 * - Web 静态文件由 app:// protocol handler 提供（见 appProtocol.ts）
 */
export async function startProductionServices(args: {
  log: Logger;
  serverUrl: string;
  webUrl: string;
  cdpPort: number;
}): Promise<ProdServices> {
  const log = args.log;
  if (!app.isPackaged) {
    return {
      getServer: () => null,
      onServerCrash: () => () => {},
      restartServer: async () => ({ ok: false, reason: 'Not in packaged mode' }),
    };
  }

  log('Starting production services...');

  const resourcesPath = process.resourcesPath;
  const openloafRoot = getOpenLoafRootDir();
  const dataDir = openloafRoot;

  // Packaged app config is expected to live under the unified OpenLoaf root.
  const userEnvPath = path.join(openloafRoot, '.env');
  const userEnv = parseEnvFile(userEnvPath);
  // 中文注释：打包内的 runtime.env 作为强制覆盖配置，优先生效。
  const packagedEnvPath = path.join(resourcesPath, 'runtime.env');
  const packagedEnv = parseEnvFile(packagedEnvPath);

  // If user didn't create a `.env` yet, write a small template to guide production configuration.
  try {
    if (!fs.existsSync(userEnvPath)) {
      fs.writeFileSync(
        userEnvPath,
        [
          '# OpenLoaf Desktop runtime config (loaded by packaged app)',
          '# Examples:',
          '# OPENAI_API_KEY=sk-...',
          '# DEEPSEEK_API_KEY=...',
          '',
        ].join('\n'),
        { encoding: 'utf-8', flag: 'wx' }
      );
    }
  } catch {
    // ignore
  }

  const databaseUrl = resolveOpenLoafDatabaseUrl();
  const localDbPath = resolveFilePathFromDatabaseUrl(databaseUrl, dataDir);

  // Initialize DB on first run by copying a pre-built seed DB (schema already applied).
  let needsDbInit = false;
  if (localDbPath) {
    try {
      if (!fs.existsSync(localDbPath)) {
        needsDbInit = true;
      } else if (fs.statSync(localDbPath).size === 0) {
        needsDbInit = true;
      }
    } catch {
      needsDbInit = true;
    }
  }
  if (localDbPath && needsDbInit) {
    try {
      ensureDir(path.dirname(localDbPath));
      const seedDbPath = path.join(resourcesPath, 'seed.db');

      // Prevent EBUSY/EPERM on Windows when overwriting a locked 0-byte file
      if (fs.existsSync(localDbPath)) {
         fs.rmSync(localDbPath, { force: true });
      }

      if (fs.existsSync(seedDbPath)) {
        fs.copyFileSync(seedDbPath, localDbPath);
        log(`Database initialized from seed: ${localDbPath}`);
      } else {
        fs.closeSync(fs.openSync(localDbPath, 'a'));
        log(`[Warn] Seed DB not found at ${seedDbPath}. Created empty DB at ${localDbPath}`);
      }
    } catch (err) {
      log(`Failed to initialize DB at ${localDbPath}: ${err instanceof Error ? err.message : String(err)}. Retrying or continuing with caution...`);
    }
  }

  /**
   * 后端：
   * - `server.mjs` 通过 Forge `extraResource` 被放进 `process.resourcesPath`
   * - 使用当前 Electron 自带的 Node 运行时启动，并设置 `ELECTRON_RUN_AS_NODE=1`
   */
  const serverPath = resolveServerPath();
  log(`Looking for server at: ${serverPath}`);

  // ESM `import` 不使用 NODE_PATH，只沿目录层级查找 node_modules。
  // 当 server.mjs 来自增量更新目录（~/.openloaf/updates/server/current/）时，
  // 需要软链接 node_modules → Resources/node_modules 以解析 external 依赖（如 playwright-core）。
  const bundledServerPath = path.join(process.resourcesPath, 'server.mjs');
  if (serverPath !== bundledServerPath) {
    const serverDir = path.dirname(serverPath);
    const nmLink = path.join(serverDir, 'node_modules');
    const nmTarget = path.join(process.resourcesPath, 'node_modules');
    // 中文注释：增量更新目录缺少 prebuilds 时，软链到 Resources/prebuilds（node-pty 需要）。
    const prebuildsLink = path.join(serverDir, 'prebuilds');
    const prebuildsTarget = path.join(process.resourcesPath, 'prebuilds');
    // Windows junction points don't require admin/developer-mode (unlike 'dir' symlinks).
    const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
    // 使用 ensureLink 处理悬空 junction：existsSync 跟随链接检查目标，
    // 当旧 junction 指向已移除的目录时返回 false，但 junction 文件本身仍存在，
    // symlinkSync 会抛 EEXIST。改用 lstatSync 检测 junction 文件本身。
    const ensureLink = (link: string, target: string, label: string) => {
      if (fs.existsSync(link)) return; // 链接存在且目标可达
      if (!fs.existsSync(target)) return; // 目标不存在，无需链接
      // 清理悬空的 junction/symlink（文件本身存在但目标不可达）
      try { fs.lstatSync(link); fs.rmSync(link); } catch { /* 不存在则忽略 */ }
      try {
        fs.symlinkSync(target, link, symlinkType);
        log(`Linked ${link} → ${target} (${symlinkType})`);
      } catch (e) {
        log(`Failed to link ${label}: ${e instanceof Error ? e.message : String(e)}`);
      }
    };
    ensureLink(nmLink, nmTarget, 'node_modules');
    ensureLink(prebuildsLink, prebuildsTarget, 'prebuilds');
  }

  const serverHost = resolveHost(args.serverUrl, '127.0.0.1');
  const serverPort = resolvePort(args.serverUrl, 23333);

  // Build the env once and freeze it; restartServer() reuses the same env so the
  // restarted process is byte-identical to the original spawn.
  const spawnEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    // Allow the bundled server to resolve shipped native deps (e.g. `@libsql/darwin-arm64`)
    // that are copied into `process.resourcesPath/node_modules` via Forge `extraResource`.
    NODE_PATH: path.join(process.resourcesPath, 'node_modules'),
    NODE_ENV: 'production',
    DOTENV_CONFIG_PATH: userEnvPath,
    DOTENV_CONFIG_OVERRIDE: '1',
    ...userEnv,
    ...packagedEnv,
    // 中文注释：以下字段由 Electron 权威决定，必须排在 userEnv/packagedEnv 之后。
    // PORT/HOST 来自 runtime 端口分配，CORS_ORIGIN 依赖 webUrl，PATH 需保留主进程修复后的路径。
    // 用户 .env 里的 PORT/HOST（例如 Docker 场景的 0.0.0.0:23333）不能覆盖这些值，
    // 否则 Electron 访问的 serverUrl 与 server 实际监听端口不一致，主窗口连不上后端。
    PORT: String(serverPort),
    HOST: serverHost,
    CORS_ORIGIN: `app://localhost,${args.webUrl},${process.env.CORS_ORIGIN ?? ''}`,
    PATH: process.env.PATH,
    OPENLOAF_DOCX_SFDT_HELPER_ROOT:
      process.env.OPENLOAF_DOCX_SFDT_HELPER_ROOT ??
      userEnv.OPENLOAF_DOCX_SFDT_HELPER_ROOT ??
      packagedEnv.OPENLOAF_DOCX_SFDT_HELPER_ROOT ??
      path.join(resourcesPath, 'docx-sfdt'),
    // yt-dlp 二进制路径：由 predesktop 的 prefetch 脚本下载后放到
    // Resources/bin/，runtime.env 和用户 .env 均可覆盖。
    OPENLOAF_YTDLP_BINARY:
      process.env.OPENLOAF_YTDLP_BINARY ??
      userEnv.OPENLOAF_YTDLP_BINARY ??
      packagedEnv.OPENLOAF_YTDLP_BINARY ??
      path.join(
        resourcesPath,
        'bin',
        process.platform === 'win32'
          ? 'yt-dlp.exe'
          : process.platform === 'darwin'
            ? 'yt-dlp_macos'
            : 'yt-dlp',
      ),
    // HTTP/2 证书目录（prod 使用 ~/.openloaf/certs/）
    OPENLOAF_CERT_DIR: path.join(getOpenLoafRootDir(), 'certs'),
    // 中文注释：强制对齐 Electron 与 Server 的 CDP 端口，避免运行时不一致。
    OPENLOAF_REMOTE_DEBUGGING_PORT: String(args.cdpPort),
    // Mark the server child as running under the desktop supervisor. Gate for
    // desktop-only tool registration (see apps/server/src/runtime/desktopRuntime.ts).
    OPENLOAF_RUNTIME: 'desktop',
    // macOS control helper binary (Swift). Packaged via electron-builder extraResources
    // into process.resourcesPath. Darwin-only; absent on Windows/Linux so the helper
    // client returns null and the MacosObserve/MacosAct tools become no-ops.
    ...(process.platform === 'darwin'
      ? {
          OPENLOAF_MACOS_HELPER_PATH:
            process.env.OPENLOAF_MACOS_HELPER_PATH ??
            userEnv.OPENLOAF_MACOS_HELPER_PATH ??
            packagedEnv.OPENLOAF_MACOS_HELPER_PATH ??
            path.join(resourcesPath, 'macos-control'),
        }
      : {}),
  };

  const ctx: ProdServerContext = {
    log,
    serverHost,
    serverPort,
    serverPath,
    bundledServerPath,
    spawnEnv,
  };

  // Crash listeners are kept outside the server lifecycle so they survive restart.
  const crashListeners = new Set<(info: ServerCrashInfo) => void>();
  const emitCrash = (info: ServerCrashInfo) => {
    for (const listener of crashListeners) {
      try {
        listener(info);
      } catch (err) {
        log(`[Server Crash Listener Error] ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  };

  let currentServer: ChildProcess | null = null;
  // 暂停 crash 上报：用于 restartServer 主动 kill 旧进程时，避免触发崩溃事件。
  let suppressCrash = false;

  if (!fs.existsSync(serverPath)) {
    log(`[Error] Server binary not found at ${serverPath}`);
    emitCrash({
      stderr: `Server binary not found at ${serverPath}`,
      isUpdatedServer: serverPath !== bundledServerPath,
      rolledBack: false,
    });
    return {
      getServer: () => null,
      onServerCrash: (handler) => {
        crashListeners.add(handler);
        return () => crashListeners.delete(handler);
      },
      restartServer: async () => ({ ok: false, reason: 'Server binary not found' }),
    };
  }

  /** Spawn one server child and wire its lifecycle into the shared crash channel. */
  const spawnOne = (): ChildProcess | null => {
    try {
      const child = spawn(process.execPath, [ctx.serverPath], {
        env: ctx.spawnEnv,
        windowsHide: true,
        detached: false,
        // fd3 = IPC channel，让 server 通过 process.on('disconnect') 感知父进程退出
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });

      const stderrChunks: string[] = [];
      child.stdout?.on('data', (d) => log(`[Server Output] ${d}`));
      child.stderr?.on('data', (d) => {
        const text = String(d);
        stderrChunks.push(text);
        log(`[Server Error] ${text}`);
      });
      child.on('error', (err) => log(`[Server Spawn Error] ${err.message}`));

      const isUpdatedServer = ctx.serverPath !== ctx.bundledServerPath;

      child.on('exit', (code, signal) => {
        log(`[Server Exited] code=${code} signal=${signal}`);
        if (suppressCrash) {
          // restartServer initiated this exit; do not surface as a crash.
          return;
        }
        if (code !== 0 && code !== null) {
          const crashResult: ServerCrashResult = recordServerCrash();
          if (crashResult.rolledBack) {
            log(`[Server] Rolled back to bundled server.mjs. Crashed version: ${crashResult.crashedVersion ?? 'unknown'}`);
          }
          const stderr = stderrChunks.join('').trim();
          const summary = stderr.length > 500 ? `…${stderr.slice(-500)}` : stderr;
          emitCrash({
            stderr: summary || `Server exited with code ${code}`,
            isUpdatedServer,
            crashedVersion: crashResult.crashedVersion,
            rolledBack: crashResult.rolledBack,
          });
        }
      });

      log('Server process spawned');
      return child;
    } catch (err) {
      const errMsg = `Failed to spawn server: ${err instanceof Error ? err.message : String(err)}`;
      log(errMsg);
      emitCrash({
        stderr: errMsg,
        isUpdatedServer: ctx.serverPath !== ctx.bundledServerPath,
        rolledBack: false,
      });
      return null;
    }
  };

  currentServer = spawnOne();

  // 防僵尸进程：当 Electron 退出时，强制杀掉当前 Server。
  // 注意：使用 closure 引用 currentServer，restart 后引用会自动更新。
  app.on('will-quit', () => {
    const child = currentServer;
    if (child && !child.killed && child.pid) {
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(child.pid), '/t', '/f']);
        } else {
          process.kill(child.pid);
        }
      } catch (e) {
        log(`Failed to kill server process: ${e}`);
      }
    }
  });

  /** Stop the current server child (best-effort, with timeout) and wait until it actually exits. */
  const stopCurrentServer = async (timeoutMs = 5000): Promise<void> => {
    const child = currentServer;
    if (!child || child.killed || !child.pid) return;
    suppressCrash = true;
    const exitPromise = new Promise<void>((resolve) => {
      const onExit = () => {
        child.off('exit', onExit);
        resolve();
      };
      child.on('exit', onExit);
    });
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      } else {
        child.kill('SIGTERM');
      }
    } catch (e) {
      log(`stopCurrentServer kill error: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Wait up to timeoutMs for the child to exit; force kill if it doesn't.
    await Promise.race([
      exitPromise,
      delay(timeoutMs).then(() => {
        if (!child.killed && child.pid) {
          try {
            if (process.platform !== 'win32') process.kill(child.pid, 'SIGKILL');
          } catch {
            // ignore
          }
        }
      }),
    ]);
    // Make sure we waited for the actual exit, not just the timeout.
    await exitPromise.catch(() => {});
  };

  const restartServer: ProdServices['restartServer'] = async () => {
    log('[Server] Restart requested.');
    try {
      await stopCurrentServer();
      // Wait briefly for the port to be released by the OS.
      const portReleaseDeadline = Date.now() + 5000;
      while (Date.now() < portReleaseDeadline) {
        if (await isPortFree(ctx.serverHost, ctx.serverPort)) break;
        await delay(150);
      }
      suppressCrash = false;
      currentServer = spawnOne();
      if (!currentServer) {
        return { ok: false, reason: 'Failed to spawn server' };
      }
      return { ok: true };
    } catch (err) {
      suppressCrash = false;
      const reason = err instanceof Error ? err.message : String(err);
      log(`[Server] Restart failed: ${reason}`);
      return { ok: false, reason };
    }
  };

  // Web 静态文件现在由 app:// protocol handler 提供（见 appProtocol.ts），
  // 不再需要 HTTP 静态服务器。

  return {
    getServer: () => currentServer,
    onServerCrash: (handler) => {
      crashListeners.add(handler);
      return () => crashListeners.delete(handler);
    },
    restartServer,
  };
}
