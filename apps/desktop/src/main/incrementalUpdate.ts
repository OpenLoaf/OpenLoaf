/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { app, BrowserWindow, net } from 'electron'
import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import zlib from 'node:zlib'

const execFileAsync = promisify(execFile)
import type { Logger } from './logging/startupLogger'
import { getAutoUpdateStatus } from './autoUpdate'
import { getUpdatesRoot } from './incrementalUpdatePaths'
import { resolveUpdateBaseUrl, resolveUpdateChannel } from './updateConfig'
import {
  compareVersions,
  gateBetaManifest,
  isRemoteNewer,
  shouldUseBundled,
} from './incrementalUpdatePolicy'

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 首次检查延迟 */
const INITIAL_CHECK_DELAY_MS = 10_000

/** 定期检查间隔（24 小时） */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000


// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

type ComponentManifest = {
  version: string
  url: string
  sha256: string
  size: number
  /** 更新时间（UTC ISO 8601） */
  updatedAt?: string
  releaseNotes?: string
  /** Changelog URL (markdown file) */
  changelogUrl?: string
}

type RemoteManifest = {
  schemaVersion: number
  server?: ComponentManifest
  web?: ComponentManifest
  electron?: { minVersion?: string }
}

type LocalComponentState = {
  version: string
  appliedAt: string
}

type LocalManifest = {
  server?: LocalComponentState
  web?: LocalComponentState
  /** Server versions that crashed after incremental update; skip these during update checks. */
  crashedServerVersions?: string[]
}

type ComponentInfo = {
  version: string
  source: 'bundled' | 'updated'
  newVersion?: string
  releaseNotes?: string
  changelogUrl?: string
}

export type IncrementalUpdateStatus = {
  state: 'idle' | 'checking' | 'downloading' | 'ready' | 'error'
  server: ComponentInfo
  web: ComponentInfo
  progress?: { component: 'server' | 'web'; percent: number }
  lastCheckedAt?: number
  error?: string
  ts: number
}

export type IncrementalUpdateResult = { ok: true } | { ok: false; reason: string }

export type ServerCrashResult = {
  rolledBack: boolean
  crashedVersion?: string
}

// ---------------------------------------------------------------------------
// 模块状态
// ---------------------------------------------------------------------------

let installed = false
let cachedLog: Logger | null = null
let checkTimer: NodeJS.Timeout | null = null
let lastStatus: IncrementalUpdateStatus = buildIdleStatus()


// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function updatesRoot(): string {
  return getUpdatesRoot()
}

function localManifestPath(): string {
  return path.join(updatesRoot(), 'local-manifest.json')
}

function readLocalManifest(): LocalManifest {
  try {
    const raw = fs.readFileSync(localManifestPath(), 'utf-8')
    return JSON.parse(raw) as LocalManifest
  } catch {
    return {}
  }
}

/** Resolve bundled component version from packaged metadata. */
/** Resolve bundled component version from packaged metadata. */
function resolveBundledVersion(component: 'server' | 'web'): string | null {
  const packagedName = component === 'server' ? 'server.package.json' : 'web.package.json'
  const packagedPath = path.join(process.resourcesPath, packagedName)
  const devPath = path.resolve(process.cwd(), 'apps', component, 'package.json')
  const devPathAlt = path.resolve(process.cwd(), '..', 'apps', component, 'package.json')
  const candidates = [packagedPath, devPath, devPathAlt]

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue
      const raw = fs.readFileSync(candidate, 'utf-8')
      const parsed = JSON.parse(raw) as { version?: string }
      if (parsed.version) return parsed.version
    } catch {
      // 中文注释：读取版本失败时忽略，继续尝试其他候选路径。
    }
  }
  return null
}

/** Resolve current component version, prefer local manifest then bundled metadata. */
function resolveCurrentVersion(
  component: 'server' | 'web',
  local: LocalManifest
): string | null {
  const localVersion = local[component]?.version
  if (localVersion) return localVersion
  return resolveBundledVersion(component)
}

/** Remove outdated incremental updates when bundled version is newer. */
function pruneOutdatedUpdates(log: Logger): void {
  const local = readLocalManifest()
  let changed = false

  const components: Array<'server' | 'web'> = ['server', 'web']
  for (const component of components) {
    const updatedVersion = local[component]?.version
    if (!updatedVersion) continue
    const bundledVersion = resolveBundledVersion(component)
    if (!bundledVersion) continue

    if (!shouldUseBundled(bundledVersion, updatedVersion)) continue

    // 逻辑：打包版本高于增量更新版本时，清理更新目录并回退到打包版本。
    const currentDir = path.join(updatesRoot(), component, 'current')
    if (fs.existsSync(currentDir)) {
      try {
        // Windows junction points（node_modules/prebuilds）必须先单独删除，
        // 否则 rmSync({recursive}) 会尝试进入 junction 目标目录导致 EPERM。
        if (process.platform === 'win32') {
          for (const junctionName of ['node_modules', 'prebuilds']) {
            const junctionPath = path.join(currentDir, junctionName)
            if (fs.existsSync(junctionPath)) {
              try { fs.rmSync(junctionPath) } catch { /* ignore */ }
            }
          }
        }
        fs.rmSync(currentDir, { recursive: true, force: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        log(`[incremental-update] Warning: failed to prune outdated ${component} files: ${msg}. Updating manifest to use bundled version anyway.`)
        // 即使文件删除失败（如 Windows EPERM），也更新 local manifest，
        // 这样 resolveServerPath/resolveWebRoot 会回退到打包版本。
      }
    }
    delete local[component]
    changed = true
    log(
      `[incremental-update] Bundled ${component} v${bundledVersion} newer than updated v${updatedVersion}. Resetting to bundled.`
    )
  }

  // 清理低于打包版本的崩溃黑名单条目
  if (local.crashedServerVersions?.length) {
    const bundledServerVersion = resolveBundledVersion('server')
    if (bundledServerVersion) {
      const filtered = local.crashedServerVersions.filter(
        (v) => compareVersions(v, bundledServerVersion) > 0
      )
      if (filtered.length !== local.crashedServerVersions.length) {
        local.crashedServerVersions = filtered.length > 0 ? filtered : undefined
        changed = true
        log(
          `[incremental-update] Pruned crashed server version blacklist to: [${filtered.join(', ')}]`
        )
      }
    }
  }

  if (changed) {
    writeLocalManifest(local)
  }
}

function writeLocalManifest(manifest: LocalManifest): void {
  const dir = path.dirname(localManifestPath())
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(localManifestPath(), JSON.stringify(manifest, null, 2), 'utf-8')
}


function getComponentInfo(component: 'server' | 'web'): ComponentInfo {
  const local = readLocalManifest()
  const state = local[component]
  if (state) {
    return { version: state.version, source: 'updated' }
  }
  const bundledVersion = resolveBundledVersion(component)
  // 中文注释：未更新时回退到打包时的版本号（若无则标记 bundled）。
  return { version: bundledVersion ?? 'bundled', source: 'bundled' }
}

function buildIdleStatus(): IncrementalUpdateStatus {
  return {
    state: 'idle',
    server: getComponentInfo('server'),
    web: getComponentInfo('web'),
    ts: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// 状态广播
// ---------------------------------------------------------------------------

function emitStatus(
  next: Partial<Omit<IncrementalUpdateStatus, 'ts'>>
): void {
  const payload: IncrementalUpdateStatus = {
    ...lastStatus,
    ...next,
    ts: Date.now(),
  }
  lastStatus = payload

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    try {
      win.webContents.send('openloaf:incremental-update:status', payload)
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// 网络下载
// ---------------------------------------------------------------------------

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      url,
      method: 'GET',
    })
    request.setHeader('Cache-Control', 'no-cache')

    let body = ''
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} fetching ${url}`))
        return
      }
      response.on('data', (chunk) => {
        body += chunk.toString()
      })
      response.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (err) {
          reject(err)
        }
      })
      response.on('error', reject)
    })
    request.on('error', reject)
    request.end()
  })
}

function withCacheBust(url: string, token: string): string {
  try {
    const parsed = new URL(url)
    parsed.searchParams.set('_cb', token)
    return parsed.toString()
  } catch {
    const sep = url.includes('?') ? '&' : '?'
    return `${url}${sep}_cb=${encodeURIComponent(token)}`
  }
}

function downloadFile(
  url: string,
  destPath: string,
  expectedSize: number,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET' })
    request.setHeader('Cache-Control', 'no-cache')

    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} downloading ${url}`))
        return
      }

      const dir = path.dirname(destPath)
      fs.mkdirSync(dir, { recursive: true })
      const writer = fs.createWriteStream(destPath)
      let received = 0

      const responseStream = response as unknown as NodeJS.ReadableStream
      response.on('data', (chunk) => {
        received += chunk.length
        const ok = writer.write(chunk)
        if (expectedSize > 0) {
          onProgress(Math.min(100, Math.round((received / expectedSize) * 100)))
        }
        // 处理写入背压：暂停响应流，等 writer drain 后恢复
        if (!ok) {
          responseStream.pause()
          writer.once('drain', () => responseStream.resume())
        }
      })

      response.on('end', () => {
        writer.end(() => resolve())
      })

      response.on('error', (err) => {
        writer.destroy()
        reject(err)
      })

      writer.on('error', (err) => {
        reject(err)
      })
    })

    request.on('error', reject)
    request.end()
  })
}

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

function computeSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

// ---------------------------------------------------------------------------
// 解压
// ---------------------------------------------------------------------------

async function extractGzip(srcPath: string, destPath: string): Promise<void> {
  const dir = path.dirname(destPath)
  fs.mkdirSync(dir, { recursive: true })
  const src = fs.createReadStream(srcPath)
  const gunzip = zlib.createGunzip()
  const dest = fs.createWriteStream(destPath)
  await pipeline(src, gunzip, dest)
}

async function extractTarGz(srcPath: string, destDir: string): Promise<void> {
  // 使用系统 tar 命令解压，避免 webpack 打包兼容性问题。
  // macOS/Linux 自带 tar，Windows 10+ 也内置 tar.exe。
  fs.mkdirSync(destDir, { recursive: true })
  await execFileAsync('tar', ['-xzf', srcPath, '-C', destDir])
}

// ---------------------------------------------------------------------------
// 原子替换
// ---------------------------------------------------------------------------

function atomicSwap(pendingDir: string, currentDir: string): void {
  const backupDir = currentDir + '.bak'

  // 清理上次可能残留的备份
  if (fs.existsSync(backupDir)) {
    fs.rmSync(backupDir, { recursive: true, force: true })
  }

  // 确保父目录存在
  fs.mkdirSync(path.dirname(currentDir), { recursive: true })

  // current → current.bak
  if (fs.existsSync(currentDir)) {
    fs.renameSync(currentDir, backupDir)
  }

  // pending → current
  fs.renameSync(pendingDir, currentDir)

  // 删除备份
  if (fs.existsSync(backupDir)) {
    fs.rmSync(backupDir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// 清理残留
// ---------------------------------------------------------------------------

function cleanPending(): void {
  const serverPending = path.join(updatesRoot(), 'server', 'pending')
  const webPending = path.join(updatesRoot(), 'web', 'pending')
  for (const dir of [serverPending, webPending]) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
}

// ---------------------------------------------------------------------------
// 更新单个组件
// ---------------------------------------------------------------------------

async function updateComponent(
  component: 'server' | 'web',
  manifest: ComponentManifest,
  log: Logger
): Promise<void> {
  const root = updatesRoot()
  const pendingDir = path.join(root, component, 'pending')
  const currentDir = path.join(root, component, 'current')

  // 清理旧的 pending
  if (fs.existsSync(pendingDir)) {
    fs.rmSync(pendingDir, { recursive: true, force: true })
  }
  fs.mkdirSync(pendingDir, { recursive: true })

  const fileName = component === 'server' ? 'server.mjs.gz' : 'web.tar.gz'
  const downloadPath = path.join(pendingDir, fileName)

  // 下载
  log(`[incremental-update] Downloading ${component} v${manifest.version}...`)
  emitStatus({
    state: 'downloading',
    progress: { component, percent: 0 },
  })

  const downloadUrl = withCacheBust(manifest.url, manifest.sha256)
  await downloadFile(downloadUrl, downloadPath, manifest.size, (percent) => {
    emitStatus({
      state: 'downloading',
      progress: { component, percent },
    })
  })

  // 校验 SHA-256
  log(`[incremental-update] Verifying ${component} SHA-256...`)
  const actualHash = await computeSha256(downloadPath)
  if (actualHash !== manifest.sha256) {
    fs.rmSync(pendingDir, { recursive: true, force: true })
    throw new Error(
      `SHA-256 mismatch for ${component}: expected ${manifest.sha256}, got ${actualHash}`
    )
  }
  log(`[incremental-update] ${component} SHA-256 verified.`)

  // 解压
  if (component === 'server') {
    const destPath = path.join(pendingDir, 'server.mjs')
    await extractGzip(downloadPath, destPath)
    // 删除压缩包
    fs.rmSync(downloadPath, { force: true })
  } else {
    // web: 解压 tar.gz 到 pending/out/
    const outDir = path.join(pendingDir, 'out')
    await extractTarGz(downloadPath, outDir)
    fs.rmSync(downloadPath, { force: true })
  }

  // 原子替换
  log(`[incremental-update] Applying ${component} v${manifest.version}...`)
  atomicSwap(pendingDir, currentDir)

  // 更新本地清单
  const localManifest = readLocalManifest()
  localManifest[component] = {
    version: manifest.version,
    appliedAt: new Date().toISOString(),
  }
  writeLocalManifest(localManifest)

  log(`[incremental-update] ${component} updated to v${manifest.version}.`)
}

// ---------------------------------------------------------------------------
// Desktop 版本 manifest 两步读取
// ---------------------------------------------------------------------------

/**
 * 两步读取 desktop 版本 manifest：
 * 1. 读 `{baseUrl}/desktop/{version}/manifest.json`
 * 2. 若 manifest 包含 `redirectTo` 字段（promote 创建的 redirect），
 *    则再读 `{baseUrl}/desktop/{redirectTo}/manifest.json` 得到实际完整信息
 *
 * 用于支持 promote 流程：stable tag 打出后仅写 redirect 文件，
 * 不重新构建，客户端通过 redirect 找到对应 beta 版本的完整信息。
 */
export async function resolveDesktopVersionManifest(
  baseUrl: string,
  version: string
): Promise<unknown> {
  const url = `${baseUrl}/desktop/${version}/manifest.json`
  const manifest = (await fetchJson(url)) as Record<string, unknown>

  if (typeof manifest.redirectTo === 'string') {
    cachedLog?.(
      `[incremental-update] Desktop manifest ${version} redirects to ${manifest.redirectTo}`
    )
    return fetchJson(`${baseUrl}/desktop/${manifest.redirectTo}/manifest.json`)
  }

  return manifest
}

// ---------------------------------------------------------------------------
// 检查更新
// ---------------------------------------------------------------------------

export async function checkForIncrementalUpdates(
  reason = 'manual'
): Promise<IncrementalUpdateResult> {
  if (!app.isPackaged) {
    cachedLog?.(`[incremental-update] Skipped (${reason}): not packaged.`)
    return { ok: false, reason: 'not-packaged' }
  }

  // Desktop 更新优先：如果有 Electron 新版本正在下载或已就绪，跳过增量更新。
  // Desktop 更新会重新打包 server/web，增量更新在此时是浪费带宽。
  const autoStatus = getAutoUpdateStatus()
  if (['available', 'downloading', 'downloaded'].includes(autoStatus.state)) {
    cachedLog?.(
      `[incremental-update] Skipped (${reason}): desktop update ${autoStatus.state}` +
        (autoStatus.nextVersion ? ` (v${autoStatus.nextVersion})` : '') +
        '. Desktop update takes priority.'
    )
    return { ok: false, reason: 'desktop-update-pending' }
  }

  try {
    emitStatus({
      state: 'checking',
      error: undefined,
      progress: undefined,
      lastCheckedAt: Date.now(),
    })

    const log = cachedLog ?? (() => {})
    const updateBaseUrl = resolveUpdateBaseUrl()
    const updateChannel = resolveUpdateChannel()
    const manifestUrl = `${updateBaseUrl}/${updateChannel}/manifest.json`
    log(`[incremental-update] Checking for updates (${reason}) from ${manifestUrl}...`)

    let remote: RemoteManifest

    if (updateChannel === 'beta') {
      // Beta 渠道：先尝试获取 beta 清单，404 时回退到 stable
      let betaManifest: RemoteManifest | null = null
      try {
        const betaRaw = (await fetchJson(manifestUrl)) as RemoteManifest
        if (betaRaw.schemaVersion === 1) {
          betaManifest = betaRaw
        } else {
          log(
            `[incremental-update] Ignoring beta manifest with schemaVersion ${betaRaw.schemaVersion}`
          )
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log(`[incremental-update] Beta manifest not available: ${message}`)
      }

      // 获取 stable 清单用于合并或回退
      let stable: RemoteManifest | null = null
      const stableUrl = `${updateBaseUrl}/stable/manifest.json`
      try {
        const stableRaw = (await fetchJson(stableUrl)) as RemoteManifest
        if (stableRaw.schemaVersion === 1) {
          stable = stableRaw
        } else {
          log(
            `[incremental-update] Ignoring stable manifest with schemaVersion ${stableRaw.schemaVersion}`
          )
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        log(`[incremental-update] Failed to fetch stable manifest: ${message}`)
      }

      if (!betaManifest && !stable) {
        // beta 和 stable 都不可用
        throw new Error('Beta 版本暂不可用，稳定版本也无法获取')
      }

      if (!betaManifest && stable) {
        // beta 不可用，回退到 stable
        log('[incremental-update] Beta 版本暂不可用，回退到稳定版本')
        remote = stable
      } else {
        // beta 可用，走正常合并逻辑
        const decision = gateBetaManifest<ComponentManifest>({
          beta: betaManifest!,
          stable,
        })
        log(
          `[incremental-update] Beta gate decision: ${decision.reason ?? 'unknown'}${decision.skipped ? ' (skipped)' : ''}`
        )
        remote = decision.manifest
      }
    } else {
      const remoteRaw = (await fetchJson(manifestUrl)) as RemoteManifest
      if (remoteRaw.schemaVersion !== 1) {
        throw new Error(`Unsupported manifest schemaVersion: ${remoteRaw.schemaVersion}`)
      }
      remote = remoteRaw
    }

    // 检查 electron 最低版本要求
    if (remote.electron?.minVersion) {
      const currentElectronVersion = app.getVersion()
      if (compareVersions(currentElectronVersion, remote.electron.minVersion) < 0) {
        log(
          `[incremental-update] Electron version ${currentElectronVersion} < minVersion ${remote.electron.minVersion}. Need full update.`
        )
        emitStatus({
          state: 'idle',
          error: `需要先更新 Electron 到 ${remote.electron.minVersion} 以上版本`,
          lastCheckedAt: Date.now(),
        })
        return { ok: false, reason: 'electron-version-too-low' }
      }
    }

    const local = readLocalManifest()
    const currentServerVersion = resolveCurrentVersion('server', local)
    const currentWebVersion = resolveCurrentVersion('web', local)
    let hasUpdate = false

    // 检查 server 更新（跳过黑名单中的崩溃版本）
    if (remote.server && isRemoteNewer(currentServerVersion, remote.server.version)) {
      const blacklist = local.crashedServerVersions ?? []
      if (blacklist.includes(remote.server.version)) {
        log(
          `[incremental-update] Server v${remote.server.version} is in crash blacklist. Skipping.`
        )
        remote = { ...remote, server: undefined }
      } else {
        log(
          `[incremental-update] Server update available: ${currentServerVersion ?? 'unknown'} → ${remote.server.version}`
        )
        hasUpdate = true
      }
    }

    // 检查 web 更新
    if (remote.web && isRemoteNewer(currentWebVersion, remote.web.version)) {
      log(
        `[incremental-update] Web update available: ${currentWebVersion ?? 'unknown'} → ${remote.web.version}`
      )
      hasUpdate = true
    }

    if (!hasUpdate) {
      log(`[incremental-update] No updates available.`)
      emitStatus({
        state: 'idle',
        error: undefined,
        progress: undefined,
        lastCheckedAt: Date.now(),
      })
      return { ok: true }
    }

    // 记录更新前版本，用于状态通知
    const preUpdateLocal = { ...local }
    const preUpdateServerVersion = resolveCurrentVersion('server', preUpdateLocal)
    const preUpdateWebVersion = resolveCurrentVersion('web', preUpdateLocal)
    // 下载并应用更新
    if (remote.server) {
      if (isRemoteNewer(currentServerVersion, remote.server.version)) {
        await updateComponent('server', remote.server, log)
      }
    }

    if (remote.web) {
      if (isRemoteNewer(currentWebVersion, remote.web.version)) {
        await updateComponent('web', remote.web, log)
      }
    }

    // 构建带 newVersion/releaseNotes 的状态（对比更新前版本）
    const serverInfo = getComponentInfo('server')
    if (remote.server && isRemoteNewer(preUpdateServerVersion, remote.server.version)) {
      serverInfo.newVersion = remote.server.version
      serverInfo.releaseNotes = remote.server.releaseNotes
      serverInfo.changelogUrl = remote.server.changelogUrl
    }

    const webInfo = getComponentInfo('web')
    if (remote.web && isRemoteNewer(preUpdateWebVersion, remote.web.version)) {
      webInfo.newVersion = remote.web.version
      webInfo.releaseNotes = remote.web.releaseNotes
      webInfo.changelogUrl = remote.web.changelogUrl
    }

    emitStatus({
      state: 'ready',
      server: serverInfo,
      web: webInfo,
      error: undefined,
      progress: undefined,
      lastCheckedAt: Date.now(),
    })

    cachedLog?.(`[incremental-update] Updates ready. Will apply on next restart.`)
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    cachedLog?.(`[incremental-update] Check failed (${reason}): ${message}`)
    emitStatus({
      state: 'error',
      error: message,
      progress: undefined,
      lastCheckedAt: Date.now(),
    })
    return { ok: false, reason: message }
  }
}

// ---------------------------------------------------------------------------
// 获取当前状态
// ---------------------------------------------------------------------------

export function getIncrementalUpdateStatus(): IncrementalUpdateStatus {
  return lastStatus
}

// ---------------------------------------------------------------------------
// 重置到打包版本
// ---------------------------------------------------------------------------


export function resetToBuiltinVersion(): IncrementalUpdateResult {
  try {
    const root = updatesRoot()
    if (fs.existsSync(root)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
    cachedLog?.('[incremental-update] Reset to builtin version. Restart to apply.')
    emitStatus(buildIdleStatus())
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    cachedLog?.(`[incremental-update] Reset failed: ${message}`)
    return { ok: false, reason: message }
  }
}

// ---------------------------------------------------------------------------
// Server 崩溃回滚
// ---------------------------------------------------------------------------

/**
 * 当 server 子进程崩溃时调用此函数。
 * 立即删除增量更新的 server，回退到打包版本，并将崩溃版本加入黑名单。
 */
export function recordServerCrash(): ServerCrashResult {
  const serverCurrentDir = path.join(updatesRoot(), 'server', 'current')
  const local = readLocalManifest()
  const crashedVersion = local.server?.version

  if (fs.existsSync(serverCurrentDir)) {
    cachedLog?.('[incremental-update] Server crashed. Rolling back to bundled version.')
    try {
      fs.rmSync(serverCurrentDir, { recursive: true, force: true })
    } catch (rmErr) {
      const msg = rmErr instanceof Error ? rmErr.message : String(rmErr)
      cachedLog?.(`[incremental-update] Warning: failed to remove crashed server dir: ${msg}`)
      // 即使删除失败也继续更新 local manifest，下次启动会回退到 bundled
    }

    // 将崩溃版本加入黑名单，防止再次自动升级到同一版本
    if (crashedVersion) {
      const blacklist = local.crashedServerVersions ?? []
      if (!blacklist.includes(crashedVersion)) {
        blacklist.push(crashedVersion)
      }
      local.crashedServerVersions = blacklist
      cachedLog?.(`[incremental-update] Added server v${crashedVersion} to crash blacklist.`)
    }

    delete local.server
    writeLocalManifest(local)

    emitStatus({
      server: getComponentInfo('server'),
      error: 'Server 崩溃，已回滚到打包版本',
    })

    return { rolledBack: true, crashedVersion }
  }
  return { rolledBack: false }
}

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

export function installIncrementalUpdate(options: { log: Logger }): void {
  const { log } = options
  cachedLog = log

  if (!app.isPackaged) {
    log('[incremental-update] Skipped (not packaged).')
    return
  }

  if (installed) {
    log('[incremental-update] Already initialized.')
    return
  }
  installed = true

  // 启动时清理残留的 pending 目录
  cleanPending()

  // 启动时清理比打包版本更旧的增量更新
  pruneOutdatedUpdates(log)

  // 初始化状态
  lastStatus = buildIdleStatus()
  emitStatus(lastStatus)

  // 延迟首次检查
  setTimeout(() => {
    void checkForIncrementalUpdates('startup')
  }, INITIAL_CHECK_DELAY_MS)

  // 定期检查
  if (!checkTimer) {
    checkTimer = setInterval(() => {
      void checkForIncrementalUpdates('scheduled')
    }, CHECK_INTERVAL_MS)
  }

  log('[incremental-update] Initialized.')
}
