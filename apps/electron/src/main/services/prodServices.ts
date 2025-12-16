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

    let filePath = path.join(root, url);

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
  const dbPath = path.join(userDataPath, 'teatime.db');
  const confPath = path.join(userDataPath, 'teatime.conf');

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
          ELECTRON_RUN_AS_NODE: '1',
          PORT: '3000',
          // sqlite db 放在 userData 下，避免应用更新覆盖 resources 导致数据丢失。
          DATABASE_URL: `file:${dbPath}`,
          // App config also lives in userData so it survives upgrades.
          TEATIME_CONF_PATH: confPath,
          // Allow the bundled server to resolve shipped native deps (e.g. `@libsql/darwin-arm64`)
          // that are copied into `process.resourcesPath` via Forge `extraResource`.
          NODE_PATH: process.resourcesPath,
          NODE_ENV: 'production',
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
