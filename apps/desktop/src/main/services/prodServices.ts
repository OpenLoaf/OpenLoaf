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
import { getOpenLoafRootDir, resolveOpenLoafDatabaseUrl, resolveOpenLoafDbPath } from '@openloaf/config';
import type { Logger } from '../logging/startupLogger';
import { recordServerCrash } from '../incrementalUpdate';
import { resolveServerPath } from '../incrementalUpdatePaths';

function parseEnvFile(filePath: string): Record<string, string> {
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

export type ProdServices = {
  managedServer: ChildProcess | null;
  serverCrashed?: Promise<string>;
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
    return { managedServer: null, serverCrashed: undefined };
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

  const dbPath = resolveOpenLoafDbPath();
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
  // serverCrashed: 当 server 进程异常退出时 resolve 并携带 stderr 摘要，永不 resolve 表示正常运行。
  let serverCrashed: Promise<string> = new Promise<string>(() => {});
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
    if (!fs.existsSync(nmLink) && fs.existsSync(nmTarget)) {
      try {
        fs.symlinkSync(nmTarget, nmLink, 'dir');
        log(`Symlinked ${nmLink} → ${nmTarget}`);
      } catch (e) {
        log(`Failed to symlink node_modules: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (!fs.existsSync(prebuildsLink) && fs.existsSync(prebuildsTarget)) {
      try {
        fs.symlinkSync(prebuildsTarget, prebuildsLink, 'dir');
        log(`Symlinked ${prebuildsLink} → ${prebuildsTarget}`);
      } catch (e) {
        log(`Failed to symlink prebuilds: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const serverHost = resolveHost(args.serverUrl, '127.0.0.1');
  const serverPort = resolvePort(args.serverUrl, 23333);

  let managedServer: ChildProcess | null = null;
  if (fs.existsSync(serverPath)) {
    try {
      managedServer = spawn(process.execPath, [serverPath], {
        env: {
          ...process.env,
          // Defaults (may be overridden by userData/.env via spread below + DOTENV_CONFIG_OVERRIDE).
          ELECTRON_RUN_AS_NODE: '1',
          PORT: String(serverPort),
          HOST: serverHost,
          // 中文注释：生产环境需要显式放行 app:// 协议和原始 webUrl 作为 CORS origin。
          CORS_ORIGIN: `app://localhost,${args.webUrl},${process.env.CORS_ORIGIN ?? ''}`,
          // Allow the bundled server to resolve shipped native deps (e.g. `@libsql/darwin-arm64`)
          // that are copied into `process.resourcesPath/node_modules` via Forge `extraResource`.
          NODE_PATH: path.join(process.resourcesPath, 'node_modules'),
          NODE_ENV: 'production',
          DOTENV_CONFIG_PATH: userEnvPath,
          DOTENV_CONFIG_OVERRIDE: '1',
          ...userEnv,
          ...packagedEnv,
          // 中文注释：强制对齐 Electron 与 Server 的 CDP 端口，避免运行时不一致。
          OPENLOAF_REMOTE_DEBUGGING_PORT: String(args.cdpPort),
        },
        windowsHide: true,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      // 防僵尸进程：当 Electron 退出时，强制杀掉 Server
      app.on('will-quit', () => {
        if (managedServer && !managedServer.killed && managedServer.pid) {
          try {
            if (process.platform === 'win32') {
              spawn('taskkill', ['/pid', String(managedServer.pid), '/t', '/f']);
            } else {
              process.kill(managedServer.pid);
            }
          } catch (e) {
            log(`Failed to kill server process: ${e}`);
          }
        }
      });

      const stderrChunks: string[] = [];
      managedServer.stdout?.on('data', (d) => log(`[Server Output] ${d}`));
      managedServer.stderr?.on('data', (d) => {
        const text = String(d);
        stderrChunks.push(text);
        log(`[Server Error] ${text}`);
      });
      managedServer.on('error', (err) => log(`[Server Spawn Error] ${err.message}`));

      // 当 server 进程异常退出时 resolve，用于提前终止健康检查轮询。
      serverCrashed = new Promise<string>((resolve) => {
        managedServer!.on('exit', (code, signal) => {
          log(`[Server Exited] code=${code} signal=${signal}`);
          if (code !== 0 && code !== null) {
            const rolledBack = recordServerCrash();
            if (rolledBack) {
              log('[Server] Rolled back to bundled server.mjs due to repeated crashes.');
            }
            // 取 stderr 最后 500 字符作为错误摘要。
            const stderr = stderrChunks.join('').trim();
            const summary = stderr.length > 500 ? `…${stderr.slice(-500)}` : stderr;
            resolve(summary || `Server exited with code ${code}`);
          }
        });
      });

      log('Server process spawned');
    } catch (err) {
      log(`Failed to spawn server: ${err instanceof Error ? err.message : String(err)}`);
      serverCrashed = Promise.resolve(`Failed to spawn server: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    log(`[Error] Server binary not found at ${serverPath}`);
    serverCrashed = Promise.resolve(`Server binary not found at ${serverPath}`);
  }

  // Web 静态文件现在由 app:// protocol handler 提供（见 appProtocol.ts），
  // 不再需要 HTTP 静态服务器。

  return { managedServer, serverCrashed };
}
