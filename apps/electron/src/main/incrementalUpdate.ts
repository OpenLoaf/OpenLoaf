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
import { getUpdatesRoot } from './incrementalUpdatePaths'

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 远端版本清单 URL（通过环境变量或默认值配置） */
const MANIFEST_URL =
  process.env.TENAS_UPDATE_MANIFEST_URL || 'https://r2-tenas-update.hexems.com/manifest.json'

/** 首次检查延迟 */
const INITIAL_CHECK_DELAY_MS = 10_000

/** 定期检查间隔（24 小时） */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

/** server 连续崩溃达到此次数则自动回滚 */
const MAX_CRASH_COUNT = 3

/** 判定为"连续崩溃"的时间窗口 */
const CRASH_WINDOW_MS = 30_000

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
}

type ComponentInfo = {
  version: string
  source: 'bundled' | 'updated'
  newVersion?: string
  releaseNotes?: string
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

// ---------------------------------------------------------------------------
// 模块状态
// ---------------------------------------------------------------------------

let installed = false
let cachedLog: Logger | null = null
let checkTimer: NodeJS.Timeout | null = null
let lastStatus: IncrementalUpdateStatus = buildIdleStatus()

/** server 子进程崩溃时间戳（用于判定连续崩溃） */
const serverCrashTimestamps: number[] = []

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
      win.webContents.send('tenas:incremental-update:status', payload)
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

function downloadFile(
  url: string,
  destPath: string,
  expectedSize: number,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET' })

    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} downloading ${url}`))
        return
      }

      const dir = path.dirname(destPath)
      fs.mkdirSync(dir, { recursive: true })
      const writer = fs.createWriteStream(destPath)
      let received = 0

      response.on('data', (chunk) => {
        received += chunk.length
        const ok = writer.write(chunk)
        if (expectedSize > 0) {
          onProgress(Math.min(100, Math.round((received / expectedSize) * 100)))
        }
        // 处理写入背压：暂停响应流，等 writer drain 后恢复
        if (!ok) {
          response.pause()
          writer.once('drain', () => response.resume())
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

  const fileName = component === 'server' ? 'server.mjs.gz' : 'out.tar.gz'
  const downloadPath = path.join(pendingDir, fileName)

  // 下载
  log(`[incremental-update] Downloading ${component} v${manifest.version}...`)
  emitStatus({
    state: 'downloading',
    progress: { component, percent: 0 },
  })

  await downloadFile(manifest.url, downloadPath, manifest.size, (percent) => {
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
// 检查更新
// ---------------------------------------------------------------------------

export async function checkForIncrementalUpdates(
  reason = 'manual'
): Promise<IncrementalUpdateResult> {
  if (!app.isPackaged) {
    cachedLog?.(`[incremental-update] Skipped (${reason}): not packaged.`)
    return { ok: false, reason: 'not-packaged' }
  }

  try {
    emitStatus({
      state: 'checking',
      error: undefined,
      progress: undefined,
      lastCheckedAt: Date.now(),
    })

    cachedLog?.(`[incremental-update] Checking for updates (${reason})...`)
    const remote = (await fetchJson(MANIFEST_URL)) as RemoteManifest

    if (remote.schemaVersion !== 1) {
      throw new Error(`Unsupported manifest schemaVersion: ${remote.schemaVersion}`)
    }

    // 检查 electron 最低版本要求
    if (remote.electron?.minVersion) {
      const currentElectronVersion = app.getVersion()
      if (compareVersions(currentElectronVersion, remote.electron.minVersion) < 0) {
        cachedLog?.(
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
    let hasUpdate = false

    // 检查 server 更新
    if (remote.server) {
      const localVersion = local.server?.version ?? 'bundled'
      if (localVersion !== remote.server.version) {
        cachedLog?.(
          `[incremental-update] Server update available: ${localVersion} → ${remote.server.version}`
        )
        hasUpdate = true
      }
    }

    // 检查 web 更新
    if (remote.web) {
      const localVersion = local.web?.version ?? 'bundled'
      if (localVersion !== remote.web.version) {
        cachedLog?.(
          `[incremental-update] Web update available: ${localVersion} → ${remote.web.version}`
        )
        hasUpdate = true
      }
    }

    if (!hasUpdate) {
      cachedLog?.(`[incremental-update] No updates available.`)
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
    const log = cachedLog ?? (() => {})

    // 下载并应用更新
    if (remote.server) {
      const localVersion = local.server?.version ?? 'bundled'
      if (localVersion !== remote.server.version) {
        await updateComponent('server', remote.server, log)
      }
    }

    if (remote.web) {
      const localVersion = local.web?.version ?? 'bundled'
      if (localVersion !== remote.web.version) {
        await updateComponent('web', remote.web, log)
      }
    }

    // 构建带 newVersion/releaseNotes 的状态（对比更新前版本）
    const serverInfo = getComponentInfo('server')
    if (remote.server && (preUpdateLocal.server?.version ?? 'bundled') !== remote.server.version) {
      serverInfo.newVersion = remote.server.version
      serverInfo.releaseNotes = remote.server.releaseNotes
    }

    const webInfo = getComponentInfo('web')
    if (remote.web && (preUpdateLocal.web?.version ?? 'bundled') !== remote.web.version) {
      webInfo.newVersion = remote.web.version
      webInfo.releaseNotes = remote.web.releaseNotes
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
 * 如果在 CRASH_WINDOW_MS 内连续崩溃 MAX_CRASH_COUNT 次，
 * 自动删除增量更新的 server，回退到打包版本。
 */
export function recordServerCrash(): boolean {
  const now = Date.now()
  serverCrashTimestamps.push(now)

  // 只保留窗口期内的记录
  while (
    serverCrashTimestamps.length > 0 &&
    now - serverCrashTimestamps[0] > CRASH_WINDOW_MS
  ) {
    serverCrashTimestamps.shift()
  }

  if (serverCrashTimestamps.length >= MAX_CRASH_COUNT) {
    const serverCurrentDir = path.join(updatesRoot(), 'server', 'current')
    if (fs.existsSync(serverCurrentDir)) {
      cachedLog?.(
        `[incremental-update] Server crashed ${MAX_CRASH_COUNT} times in ${CRASH_WINDOW_MS}ms. Rolling back to bundled version.`
      )
      fs.rmSync(serverCurrentDir, { recursive: true, force: true })

      // 清除本地清单中的 server 条目
      const local = readLocalManifest()
      delete local.server
      writeLocalManifest(local)

      emitStatus({
        server: getComponentInfo('server'),
        error: 'Server 连续崩溃，已回滚到打包版本',
      })

      serverCrashTimestamps.length = 0
      return true // 已回滚
    }
  }
  return false // 未回滚
}

// ---------------------------------------------------------------------------
// 版本比较
// ---------------------------------------------------------------------------

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na < nb) return -1
    if (na > nb) return 1
  }
  return 0
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
