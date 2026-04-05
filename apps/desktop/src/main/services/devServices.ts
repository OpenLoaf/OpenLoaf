/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { execSync, spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { delay, isUrlOk, waitForUrlOk } from './urlHealth';
import type { Logger } from '../logging/startupLogger';
import { getFreePort, isPortFree } from './portAllocation';
import { parseEnvFile } from './prodServices';

/**
 * 从当前工作目录向上查找 monorepo 根目录。
 * 用于在 dev 环境下定位 `pnpm-workspace.yaml`/`turbo.json` 并从根目录拉起子进程。
 */
export function findRepoRoot(startDir: string): string | null {
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
  if (process.platform !== 'win32') return base;
  if (base === 'node') return 'node';
  return `${base}.cmd`;
}

export function cleanupNextDevLock(args: {
  repoRoot: string;
  log?: Logger;
  killProcesses?: boolean;
}): void {
  const log = args.log;
  const lockPath = path.join(args.repoRoot, 'apps/web/.next/dev/lock');
  if (!fs.existsSync(lockPath)) return;

  log?.(`Detected Next dev lock at ${lockPath}. Attempting cleanup.`);

  const shouldKill = args.killProcesses ?? true;
  if (process.platform === 'win32' && shouldKill) {
    const webPath = path.join(args.repoRoot, 'apps', 'web');
    const safeWebPath = webPath.replace(/'/g, "''");
    const safeLockPath = lockPath.replace(/'/g, "''");
    const script = [
      `$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and $_.CommandLine -like '*${safeWebPath}*' -and $_.CommandLine -match 'next' }`,
      `if ($procs) { $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }`,
      `Remove-Item -Force -ErrorAction SilentlyContinue '${safeLockPath}'`,
    ].join('; ');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
      stdio: 'ignore',
    });
    if (result.error) {
      log?.(`Failed to cleanup Next dev lock via PowerShell: ${String(result.error)}`);
    } else if (typeof result.status === 'number' && result.status !== 0) {
      log?.(`PowerShell cleanup exited with code ${result.status}.`);
    }
  }

  if (!fs.existsSync(lockPath)) return;
  try {
    fs.unlinkSync(lockPath);
  } catch (error) {
    log?.(`Failed to remove Next dev lock: ${String(error)}`);
  }
}

/**
 * 调用统一的 kill 脚本清理当前项目的残留进程。
 */
function killStaleProjectProcesses(repoRoot: string, log: Logger): boolean {
  try {
    const killScript = path.join(repoRoot, 'scripts/kill.mjs');
    if (!fs.existsSync(killScript)) return false;
    const result = spawnSync(process.execPath, [killScript], {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: 10_000,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    let killed = false;
    if (result.stdout?.trim()) {
      for (const line of result.stdout.trim().split(/\r?\n/)) {
        log(line);
        if (line.includes('Killed')) killed = true;
      }
    }
    return killed;
  } catch {
    return false;
  }
}

/**
 * 尝试终止占用指定端口的 node 进程（仅限 LISTEN 状态）。
 * 用于清理上次 Electron 退出时残留的 stale server。
 */
function killStaleServerOnPort(host: string, port: number, log: Logger): void {
  try {
    if (process.platform === 'win32') {
      // netstat + taskkill：查找监听指定端口的进程并终止。
      const output = execSync(
        `netstat -ano | findstr "LISTENING" | findstr ":${port}"`,
        { encoding: 'utf-8', timeout: 3000 },
      ).trim();
      for (const line of output.split(/\r?\n/)) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid) && pid !== '0') {
          log(`Killing stale server PID ${pid} on port ${port}`);
          spawnSync('taskkill', ['/pid', pid, '/f'], { stdio: 'ignore' });
        }
      }
    } else {
      // lsof：查找监听指定端口的进程 PID。
      const output = execSync(
        `lsof -ti tcp:${port} -sTCP:LISTEN`,
        { encoding: 'utf-8', timeout: 3000 },
      ).trim();
      for (const pid of output.split(/\s+/)) {
        if (pid && /^\d+$/.test(pid)) {
          log(`Killing stale server PID ${pid} on port ${port}`);
          try {
            process.kill(Number(pid), 'SIGTERM');
          } catch {
            // 进程可能已退出
          }
        }
      }
    }
  } catch {
    // lsof/netstat 未找到进程或执行失败，忽略。
  }
}

/**
 * 解析 supervisor 脚本路径。supervisor 监听 stdin EOF 检测父进程死亡，
 * 自动杀掉子进程树，防止 Electron 崩溃/强退后残留孤儿进程。
 */
function resolveSupervisorPath(): string {
  return path.resolve(__dirname, '../../scripts/run-supervised.mjs');
}

/**
 * 启动子进程并把 stdout/stderr 打上 label 输出到父进程控制台，便于排查 dev 启动问题。
 *
 * 通过 run-supervised.mjs 包装，实现父进程死亡后子进程自动退出：
 *   Electron → supervisor (stdin pipe) → child (detached, own process group)
 *   当 Electron 死亡 → stdin pipe 断开 → supervisor 检测 EOF → kill(-childPid)
 */
function spawnLogged(
  label: string,
  command: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; ipc?: boolean }
): ChildProcess {
  const supervisorPath = resolveSupervisorPath();

  const child = spawn(process.execPath, [supervisorPath, command, ...args], {
    cwd: opts.cwd,
    env: { ...opts.env, ELECTRON_RUN_AS_NODE: '1' },
    // stdin 设为 pipe：作为"生命线"，Electron 退出时管道断开，supervisor 检测 EOF。
    // stdout/stderr 设为 pipe 用于日志标签化。
    stdio: ['pipe', 'pipe', 'pipe'],
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

  // 启动前先杀掉当前项目残留的孤儿进程（next-server、node server 等）。
  // 避免上次 Electron 非正常退出后残留进程占用内存和端口。
  const killedStale = killStaleProjectProcesses(repoRoot, args.log);

  // 如果杀了残留进程，等待它们完全退出后再做健康检查。
  if (killedStale) {
    await delay(2000);
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

  if (!webOk) {
    cleanupNextDevLock({ repoRoot, log: args.log, killProcesses: true });
  }

  const pnpm = commandName('pnpm');
  const node = commandName('node');
  // 开发态加载 apps/server/.env.local，与 pnpm dev:server 行为一致。
  const serverEnvLocal = parseEnvFile(path.join(repoRoot, 'apps', 'server', '.env.local'));
  const envBase = { ...process.env, ...serverEnvLocal };

  const serverHost = new URL(serverUrl).hostname || '127.0.0.1';
  let serverPort = Number(new URL(serverUrl).port || 23333);
  if (!serverOk && !(await isPortFree(serverHost, serverPort))) {
    // 端口被占用但 HTTP 不健康 → 可能是上次残留的 stale server，尝试清理。
    killStaleServerOnPort(serverHost, serverPort, args.log);
    // 给进程一点时间释放端口。
    await delay(500);
    if (!(await isPortFree(serverHost, serverPort))) {
      // 清理失败，换端口。
      serverPort = await getFreePort(serverHost);
      serverUrl = `http://${serverHost}:${serverPort}`;
      args.log(`Server port still in use; switched to ${serverUrl}`);
    }
  }

  // 开发态为 server 单独开启 Node Inspector，避免影响 Electron 主进程。
  const inspectPortRaw = envBase.OPENLOAF_SERVER_INSPECT_PORT ?? '';
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
    // 端口被占用但 HTTP 不健康 → 可能是上次残留的 stale web server，尝试清理。
    killStaleServerOnPort(webHost, webPort, args.log);
    await delay(500);
    if (!(await isPortFree(webHost, webPort))) {
      // 清理失败，换端口。
      webPort = await getFreePort(webHost);
      webUrl = `http://${webHost}:${webPort}`;
      args.log(`Web port still in use; switched to ${webUrl}`);
    }
  }

  let managedServer: ChildProcess | null = null;
  let managedWeb: ChildProcess | null = null;

  if (!serverOk) {
    // 逻辑：避免 pnpm/tsx watch 管理进程占用调试端口，直接启动 server 进程。
    const serverEntry = path.join(repoRoot, 'apps/server/src/index.ts');
    const serverTsconfig = path.join(repoRoot, 'apps/server/tsconfig.json');
    // 逻辑：开发态注入 markdown 文本 loader。
    const serverMdLoaderRegister = path.join(
      repoRoot,
      'apps/server/scripts/registerMdTextLoader.mjs'
    );
    const serverEnv: NodeJS.ProcessEnv = {
      ...envBase,
      PORT: String(serverPort),
      HOST: serverHost,
      NODE_ENV: 'development',
      OPENLOAF_REMOTE_DEBUGGING_PORT: String(args.cdpPort),
      OPENLOAF_DOCX_SFDT_HELPER_ROOT:
        envBase.OPENLOAF_DOCX_SFDT_HELPER_ROOT ??
        path.join(repoRoot, 'apps', 'desktop', 'resources', 'docx-sfdt'),
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
        '--import',
        serverMdLoaderRegister,
        '--watch',
        serverEntry,
      ],
      {
        cwd: path.join(repoRoot, 'apps/server'),
        env: serverEnv,
        ipc: true,
      }
    );

    await waitForUrlOk(`${serverUrl}/`, { timeoutMs: 30_000, intervalMs: 300 });
  }

  if (!webOk) {
    // 启动前端（apps/web）的 Next.js dev server。使用 `pnpm --filter web exec next dev`
    // 以避免依赖项目自定义 script 名称。
    // dev 下强制走 Turbopack，加快 Next.js 开发态构建与热更新。
    managedWeb = spawnLogged(
      'web',
      pnpm,
      [
        '--filter',
        'web',
        'exec',
        'next',
        'dev',
        '--turbopack',
        `--port=${webPort}`,
        `--hostname=${webHost}`,
      ],
      {
        cwd: repoRoot,
        env: {
          ...envBase,
          NODE_ENV: 'development',
          NEXT_PUBLIC_SERVER_URL: serverUrl,
          // Turbopack 在 monorepo 下文件监听量较大，开启 polling 避免 EMFILE。
          WATCHPACK_POLLING: 'true',
          // apps/web 用此标记开启 Electron 专属能力（IPC bridge 等）。
          NEXT_PUBLIC_ELECTRON: '1',
        },
      }
    );

    await waitForUrlOk(`${webUrl}/`, { timeoutMs: 60_000, intervalMs: 300 });
  }

  return { serverUrl, webUrl, managedServer, managedWeb };
}
