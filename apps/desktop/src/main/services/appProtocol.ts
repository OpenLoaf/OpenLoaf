/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Logger } from '../logging/startupLogger'
import { resolveWebRoot } from '../incrementalUpdatePaths'

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
}

/**
 * 注册 `app://` 自定义协议，用于在生产模式下零延迟地提供 Next.js 静态导出文件。
 * 替代原来的 http.createServer 方案，避免启动时等待 HTTP 服务器就绪。
 *
 * 必须在 `app.whenReady()` 之后调用（protocol.handle 要求 app 已就绪）。
 * `protocol.registerSchemesAsPrivileged` 必须在 `app.whenReady()` 之前同步调用（见 index.ts）。
 */
export function registerAppProtocol(log: Logger): void {
  // 启动时缓存 web root 路径，增量更新后需重启生效（与原行为一致）。
  const webRoot = resolveWebRoot()
  log(`[appProtocol] Web root resolved: ${webRoot}`)

  protocol.handle('app', (request) => {
    try {
      const url = new URL(request.url)
      let pathname = decodeURIComponent(url.pathname)

      // 路径穿越防护
      if (pathname.includes('..')) {
        return new Response('Forbidden', { status: 403 })
      }

      // 去掉前导 "/"
      const relativePath = pathname.startsWith('/') ? pathname.slice(1) : pathname
      let filePath = path.join(webRoot, relativePath)

      // Next.js 静态导出路由兼容：目录 → index.html
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html')
      }

      // 无扩展名 → .html（Next.js 静态导出的页面路由）
      if (!fs.existsSync(filePath)) {
        if (fs.existsSync(filePath + '.html')) {
          filePath += '.html'
        } else if (fs.existsSync(path.join(webRoot, '404.html'))) {
          // SPA fallback
          filePath = path.join(webRoot, '404.html')
        } else if (fs.existsSync(path.join(webRoot, 'index.html'))) {
          filePath = path.join(webRoot, 'index.html')
        } else {
          return new Response('Not Found', { status: 404 })
        }
      }

      const ext = path.extname(filePath).toLowerCase()
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream'

      const fileBuffer = fs.readFileSync(filePath)
      return new Response(fileBuffer, {
        status: 200,
        headers: { 'Content-Type': mimeType },
      })
    } catch (err) {
      log(`[appProtocol] Error handling ${request.url}: ${err instanceof Error ? err.message : String(err)}`)
      return new Response('Internal Server Error', { status: 500 })
    }
  })

  log('[appProtocol] Registered app:// protocol handler')
}
