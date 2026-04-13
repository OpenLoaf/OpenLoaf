#!/usr/bin/env node
/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

// 替代 ytdlp-nodejs 上游 postinstall 的 yt-dlp 二进制下载。
// 原脚本对网络错误零重试，任何 GitHub release CDN 504 都会让整个 pnpm
// install 挂掉。这里实现带指数退避的重试，下载完成后放到
// apps/desktop/resources/bin/ 供 Electron extraResource 打包进 Resources/bin/。
//
// 目标平台由 process.platform 决定；当前项目不跨 OS 交叉编译，每个 runner
// 只需要自己那份（macOS 的 yt-dlp_macos 是 universal binary，同时覆盖
// arm64 和 x64）。

import { createWriteStream, existsSync, mkdirSync, chmodSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { get } from 'node:https'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DESKTOP_ROOT = resolve(__dirname, '..')
const BIN_DIR = join(DESKTOP_ROOT, 'resources', 'bin')

const BINARY_NAMES = {
  darwin: 'yt-dlp_macos',
  linux: 'yt-dlp',
  win32: 'yt-dlp.exe',
}

const RELEASE_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download'
const MAX_ATTEMPTS = 4
const BACKOFF_MS = [1000, 3000, 8000, 15000]
const REQUEST_TIMEOUT_MS = 120_000
const MIN_BINARY_BYTES = 1_000_000 // yt-dlp 实际 ~25MB，小于 1MB 一定是 error page

function followDownload(url, destPath) {
  return new Promise((resolveDl, rejectDl) => {
    const req = get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        const next = new URL(res.headers.location, url).toString()
        followDownload(next, destPath).then(resolveDl, rejectDl)
        return
      }
      if (res.statusCode !== 200) {
        res.resume()
        rejectDl(new Error(`HTTP ${res.statusCode} ${res.statusMessage ?? ''}`.trim()))
        return
      }
      const out = createWriteStream(destPath)
      res.pipe(out)
      out.on('finish', () => out.close((err) => (err ? rejectDl(err) : resolveDl())))
      out.on('error', (err) => {
        try { unlinkSync(destPath) } catch {}
        rejectDl(err)
      })
      res.on('error', (err) => {
        try { unlinkSync(destPath) } catch {}
        rejectDl(err)
      })
    })
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request timeout after ${REQUEST_TIMEOUT_MS}ms`))
    })
    req.on('error', rejectDl)
  })
}

async function downloadWithRetry(url, destPath) {
  let lastError
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`[prefetch-ytdlp] GET ${url} (attempt ${attempt}/${MAX_ATTEMPTS})`)
      await followDownload(url, destPath)
      const size = statSync(destPath).size
      if (size < MIN_BINARY_BYTES) {
        throw new Error(`Downloaded file too small (${size} bytes), treating as corrupted`)
      }
      return
    } catch (err) {
      lastError = err
      console.warn(`[prefetch-ytdlp] attempt ${attempt} failed: ${err.message}`)
      try { if (existsSync(destPath)) unlinkSync(destPath) } catch {}
      if (attempt < MAX_ATTEMPTS) {
        const delay = BACKOFF_MS[attempt - 1]
        console.log(`[prefetch-ytdlp] retrying in ${delay}ms...`)
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw new Error(`All ${MAX_ATTEMPTS} download attempts failed: ${lastError?.message}`)
}

async function main() {
  const platform = process.platform
  const binaryName = BINARY_NAMES[platform]
  if (!binaryName) {
    console.log(`[prefetch-ytdlp] unsupported platform ${platform}, skipping`)
    return
  }

  mkdirSync(BIN_DIR, { recursive: true })
  const destPath = join(BIN_DIR, binaryName)

  if (existsSync(destPath)) {
    const size = statSync(destPath).size
    if (size >= MIN_BINARY_BYTES) {
      console.log(`[prefetch-ytdlp] already present: ${destPath} (${size} bytes)`)
      return
    }
    console.log(`[prefetch-ytdlp] existing file too small (${size} bytes), re-downloading`)
    unlinkSync(destPath)
  }

  const url = `${RELEASE_BASE}/${binaryName}`
  await downloadWithRetry(url, destPath)

  if (platform !== 'win32') {
    chmodSync(destPath, 0o755)
  }

  const finalSize = statSync(destPath).size
  console.log(`[prefetch-ytdlp] OK: ${destPath} (${finalSize} bytes)`)
}

main().catch((err) => {
  console.error('[prefetch-ytdlp] FATAL:', err.message)
  process.exit(1)
})
