import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { delay, isUrlOk, waitForUrlOk } from './urlHealth';
import type { Logger } from '../logging/startupLogger';
import { getFreePort, isPortFree } from './portAllocation';

/**
 * 从当前工作目录向上查找 monorepo 根目录。
 * 用于在 dev 环境下定位 `pnpm-workspace.yaml`/`turbo.json` 并从根目录拉起子进程。
 */
function findRepoRoot(startDir: string): string | null {
  let current = startDir;
  for (let i = 0; i < 12; i++) {
    if (
      fs.existsSync(path.join(current, 'pnpm-workspace.yaml')) &&
      fs.existsSync(path.join(current, 'turbo.json'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/**
 * 兼容 Windows 的命令名（.cmd）。
 */
function commandName(base: string): string {
  return process.platform === 'win32' ? `${base}.cmd` : base;
}

/**
 * 启动子进程并把 stdout/stderr 打上 label 输出到父进程控制台，便于排查 dev 启动问题。
 */
function spawnLogged(
  label: string,
  command: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv }
): ChildProcess {
  const child = spawn(command, args, {
    cwd: opts.cwd,
    env: opts.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (d) => process.stdout.write(`[${label}] ${d}`));
  child.stderr?.on('data', (d) => process.stderr.write(`[${label}] ${d}`));
  child.on('exit', (code, signal) => {
    process.stdout.write(
      `[${label}] exited (${code ?? 'null'}, ${signal ?? 'null'})\n`
    );
  });

  return child;
}

export type DevServices = {
  serverUrl: string;
  webUrl: string;
  managedServer: ChildProcess | null;
  managedWeb: ChildProcess | null;
};

/**
 * Ensures apps/server and apps/web are reachable in development:
 * - Reuse existing services if they're already running
 * - Otherwise start the dev servers from the monorepo root
 */
export async function ensureDevServices(args: {
  log: Logger;
  initialServerUrl: string;
  initialWebUrl: string;
  cdpPort: number;
}): Promise<DevServices> {
  // dev 环境默认在 monorepo 内运行；若不在仓库根目录附近，避免自动拉起子进程。
  const repoRoot = findRepoRoot(process.cwd());
  if (!repoRoot) {
    return {
      serverUrl: args.initialServerUrl,
      webUrl: args.initialWebUrl,
      managedServer: null,
      managedWeb: null,
    };
  }

  let serverUrl = args.initialServerUrl;
  let webUrl = args.initialWebUrl;

  let serverOk = await isUrlOk(`${serverUrl}/`);
  let webOk = await isUrlOk(`${webUrl}/`);
  if (!serverOk || !webOk) {
    // 如果服务正在启动，给热更新服务一点缓冲时间。
    await delay(1500);
    serverOk = serverOk || (await isUrlOk(`${serverUrl}/`));
    webOk = webOk || (await isUrlOk(`${webUrl}/`));
  }
  if (serverOk && webOk) {
    return { serverUrl, webUrl, managedServer: null, managedWeb: null };
  }

  const pnpm = commandName('pnpm');
  const node = commandName('node');
  const envBase = { ...process.env };

  const serverHost = new URL(serverUrl).hostname || '127.0.0.1';
  let serverPort = Number(new URL(serverUrl).port || 23333);
  if (!serverOk && !(await isPortFree(serverHost, serverPort))) {
    // 默认端口被占用时，自动选择可用端口，避免 spawn 后才失败。
    serverPort = await getFreePort(serverHost);
    serverUrl = `http://${serverHost}:${serverPort}`;
    args.log(`Server port in use; switched to ${serverUrl}`);
  }

  // 开发态为 server 单独开启 Node Inspector，避免影响 Electron 主进程。
  const inspectPortRaw = envBase.TENAS_SERVER_INSPECT_PORT ?? '';
  const inspectPortParsed = Number.parseInt(inspectPortRaw, 10);
  const serverInspectPort = Number.isFinite(inspectPortParsed)
    ? inspectPortParsed
    : 9229;
  const existingNodeOptions = envBase.NODE_OPTIONS ?? '';
  const inspectOptionPattern =
    /(^|\s)--inspect(?:-brk|-port|-publish-uid|-wait)?(?:=\S+)?/g;
  const sanitizedNodeOptions = existingNodeOptions
    .replace(inspectOptionPattern, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const webHost = new URL(webUrl).hostname || '127.0.0.1';
  let webPort = Number(new URL(webUrl).port || 3001);
  if (!webOk && !(await isPortFree(webHost, webPort))) {
    webPort = await getFreePort(webHost);
    webUrl = `http://${webHost}:${webPort}`;
    args.log(`Web port in use; switched to ${webUrl}`);
  }

  let managedServer: ChildProcess | null = null;
  let managedWeb: ChildProcess | null = null;

  if (!serverOk) {
    // 逻辑：避免 pnpm/tsx watch 管理进程占用调试端口，直接启动 server 进程。
    const serverEntry = path.join(repoRoot, 'apps/server/src/index.ts');
    const serverTsconfig = path.join(repoRoot, 'apps/server/tsconfig.json');
    const serverEnv: NodeJS.ProcessEnv = {
      ...envBase,
      PORT: String(serverPort),
      HOST: serverHost,
      NODE_ENV: 'development',
      TENAS_REMOTE_DEBUGGING_PORT: String(args.cdpPort),
      TSX_TSCONFIG_PATH: serverTsconfig,
      // 允许 web dev server 作为 Origin 访问后端。
      CORS_ORIGIN: `${webUrl},${envBase.CORS_ORIGIN ?? ''}`,
    };
    if (sanitizedNodeOptions) {
      serverEnv.NODE_OPTIONS = sanitizedNodeOptions;
    } else {
      delete serverEnv.NODE_OPTIONS;
    }

    managedServer = spawnLogged(
      'server',
      node,
      [
        `--inspect=${serverHost}:${serverInspectPort}`,
        '--enable-source-maps',
        '--import',
        'tsx/esm',
        '--watch',
        serverEntry,
      ],
      {
        cwd: path.join(repoRoot, 'apps/server'),
        env: serverEnv,
      }
    );

    await waitForUrlOk(`${serverUrl}/`, { timeoutMs: 30_000, intervalMs: 300 });
  }

  if (!webOk) {
    // 启动前端（apps/web）的 Next.js dev server。使用 `pnpm --filter web exec next dev`
    // 以避免依赖项目自定义 script 名称。
    managedWeb = spawnLogged(
      'web',
      pnpm,
      [
        '--filter',
        'web',
        'exec',
        'next',
        'dev',
        `--port=${webPort}`,
        `--hostname=${webHost}`,
      ],
      {
        cwd: repoRoot,
        env: {
          ...envBase,
          NODE_ENV: 'development',
          NEXT_PUBLIC_SERVER_URL: serverUrl,
          // apps/web 用此标记开启 Electron 专属能力（IPC bridge 等）。
          NEXT_PUBLIC_ELECTRON: '1',
        },
      }
    );

    await waitForUrlOk(`${webUrl}/`, { timeoutMs: 60_000, intervalMs: 300 });
  }

  return { serverUrl, webUrl, managedServer, managedWeb };
}
