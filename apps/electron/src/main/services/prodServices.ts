import { app } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { Logger } from '../logging/startupLogger';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain',
  '.webmanifest': 'application/manifest+json',
};

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
 * 简易静态文件服务：
 * - 用于在生产环境把 `apps/web/out` 通过本地 http server 提供给 BrowserWindow 加载
 * - 兼容 Next.js export 的常见路径（目录 index.html、路径补 .html、404.html）
 */
function serveStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  root: string,
  log: Logger
) {
  try {
    let url = req.url || '/';
    url = url.split('?')[0];

    if (url.includes('..')) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    // path.join 遇到以 "/" 开头的路径会忽略 root，需去掉前导 "/"。
    const relativePath = url.startsWith('/') ? url.slice(1) : url;
    let filePath = path.join(root, relativePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      if (fs.existsSync(filePath + '.html')) {
        filePath += '.html';
      } else if (fs.existsSync(path.join(root, '404.html'))) {
        filePath = path.join(root, '404.html');
      } else {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', mimeType);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', (err) => {
      log(`Stream error serving ${filePath}: ${err.message}`);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    });
  } catch (err) {
    log(`Error in serveStatic: ${err instanceof Error ? err.message : String(err)}`);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  }
}

export type ProdServices = {
  managedServer: ChildProcess | null;
  productionWebServer: http.Server | null;
};

/**
 * 生产环境启动服务：
 * - 启动打包进 Resources 的 `server.mjs`
 * - 启动本地静态服务，提供 `Resources/out`（Next.js export）
 */
export async function startProductionServices(log: Logger): Promise<ProdServices> {
  if (!app.isPackaged) {
    return { managedServer: null, productionWebServer: null };
  }

  log('Starting production services...');

  const resourcesPath = process.resourcesPath;
  const userDataPath = app.getPath('userData');

  // Packaged app config is expected to live in userData (editable by user, survives upgrades).
  const userEnvPath = path.join(userDataPath, '.env');
  const userEnv = parseEnvFile(userEnvPath);

  const dataDir = userEnv.TEATIME_DATA_DIR ?? process.env.TEATIME_DATA_DIR ?? path.join(userDataPath, 'data');
  ensureDir(dataDir);

  const defaultDbPath = path.join(dataDir, 'teatime.db');
  const dbPath = userEnv.TEATIME_DB_PATH ?? process.env.TEATIME_DB_PATH ?? defaultDbPath;

  const defaultConfPath = path.join(dataDir, 'teatime.conf');
  const confPath =
    userEnv.TEATIME_CONF_PATH ?? process.env.TEATIME_CONF_PATH ?? defaultConfPath;

  // If user didn't create a `.env` yet, write a small template to guide production configuration.
  try {
    if (!fs.existsSync(userEnvPath)) {
      fs.writeFileSync(
        userEnvPath,
        [
          '# Teatime Desktop runtime config (loaded by packaged app)',
          '# Examples:',
          '# OPENAI_API_KEY=sk-...',
          '# DEEPSEEK_API_KEY=...',
          `# TEATIME_DATA_DIR=${dataDir}`,
          `# TEATIME_DB_PATH=${dbPath}`,
          `# TEATIME_CONF_PATH=${confPath}`,
          '',
        ].join('\n'),
        { encoding: 'utf-8', flag: 'wx' }
      );
    }
  } catch {
    // ignore
  }

  const defaultDatabaseUrl = `file:${dbPath}`;
  const databaseUrl = userEnv.DATABASE_URL ?? process.env.DATABASE_URL ?? defaultDatabaseUrl;
  const localDbPath = resolveFilePathFromDatabaseUrl(databaseUrl, dataDir);

  // Initialize DB on first run by copying a pre-built seed DB (schema already applied).
  if (localDbPath && !fs.existsSync(localDbPath)) {
    try {
      ensureDir(path.dirname(localDbPath));
      const seedDbPath = path.join(resourcesPath, 'seed.db');
      if (fs.existsSync(seedDbPath)) {
        fs.copyFileSync(seedDbPath, localDbPath);
        log(`Database initialized from seed: ${localDbPath}`);
      } else {
        fs.closeSync(fs.openSync(localDbPath, 'a'));
        log(`[Warn] Seed DB not found at ${seedDbPath}. Created empty DB at ${localDbPath}`);
      }
    } catch (err) {
      log(`Failed to initialize DB at ${localDbPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 后端：
   * - `server.mjs` 通过 Forge `extraResource` 被放进 `process.resourcesPath`
   * - 使用当前 Electron 自带的 Node 运行时启动，并设置 `ELECTRON_RUN_AS_NODE=1`
   */
  const serverPath = path.join(resourcesPath, 'server.mjs');
  log(`Looking for server at: ${serverPath}`);

  let managedServer: ChildProcess | null = null;
  if (fs.existsSync(serverPath)) {
    try {
      managedServer = spawn(process.execPath, [serverPath], {
        env: {
          ...process.env,
          // Defaults (may be overridden by userData/.env via spread below + DOTENV_CONFIG_OVERRIDE).
          ELECTRON_RUN_AS_NODE: '1',
          PORT: '3000',
          DATABASE_URL: databaseUrl,
          TEATIME_CONF_PATH: confPath,
          // Allow the bundled server to resolve shipped native deps (e.g. `@libsql/darwin-arm64`)
          // that are copied into `process.resourcesPath` via Forge `extraResource`.
          NODE_PATH: process.resourcesPath,
          NODE_ENV: 'production',
          DOTENV_CONFIG_PATH: userEnvPath,
          DOTENV_CONFIG_OVERRIDE: '1',
          ...userEnv,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      managedServer.stdout?.on('data', (d) => log(`[Server Output] ${d}`));
      managedServer.stderr?.on('data', (d) => log(`[Server Error] ${d}`));
      managedServer.on('error', (err) => log(`[Server Spawn Error] ${err.message}`));
      managedServer.on('exit', (code, signal) =>
        log(`[Server Exited] code=${code} signal=${signal}`)
      );

      log('Server process spawned');
    } catch (err) {
      log(`Failed to spawn server: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    log(`[Error] Server binary not found at ${serverPath}`);
  }

  const webRoot = path.join(resourcesPath, 'out');
  log(`Looking for web root at: ${webRoot}`);

  let productionWebServer: http.Server | null = null;
  if (fs.existsSync(webRoot)) {
    try {
      /**
       * 前端：
       * - `apps/web/out` 的静态导出会被复制到 `process.resourcesPath/out`
       * - 这里起一个本地 http server，供 BrowserWindow `loadURL(http://127.0.0.1:3001/)`
       */
      productionWebServer = http.createServer((req, res) => {
        serveStatic(req, res, webRoot, log);
      });

      await new Promise<void>((resolve, reject) => {
        productionWebServer?.listen(3001, () => {
          log('Web server running at http://localhost:3001');
          resolve();
        });
        productionWebServer?.on('error', reject);
      });
    } catch (err) {
      log(`Failed to start web server: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    log(`[Error] Web root not found at ${webRoot}`);
  }

  return { managedServer, productionWebServer };
}
