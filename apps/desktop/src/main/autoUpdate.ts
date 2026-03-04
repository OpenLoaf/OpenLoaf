/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  autoUpdater,
  type ProgressInfo,
  type UpdateInfo,
} from 'electron-updater'
import type { Logger } from './logging/startupLogger'
import { resolveElectronFeedUrl } from './updateConfig'
import { skipQuitConfirmation } from './windows/mainWindow'

/** Auto update options. */
type AutoUpdateOptions = {
  log: Logger
}

/** Auto update state value. */
type AutoUpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

/** Auto update status snapshot. */
type AutoUpdateStatus = {
  state: AutoUpdateState
  currentVersion: string
  nextVersion?: string
  releaseNotes?: string
  lastCheckedAt?: number
  progress?: {
    percent: number
    transferred: number
    total: number
    bytesPerSecond: number
  }
  error?: string
  ts: number
}

/** Auto update action result. */
type AutoUpdateResult = { ok: true } | { ok: false; reason: string }

/** Persisted launch metadata for post-install cleanup. */
type AutoUpdateLaunchState = {
  lastLaunchedVersion?: string
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 首次检查延迟。 */
const INITIAL_CHECK_DELAY_MS = 8_000

/** 定期检查间隔（6 小时）。 */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

/** File name used to persist launch version metadata. */
const AUTO_UPDATE_LAUNCH_STATE_FILE = 'auto-update-launch-state.json'

/** app-update.yml key for updater cache directory name. */
const UPDATER_CACHE_DIR_KEY = 'updaterCacheDirName'

// ---------------------------------------------------------------------------
// 模块状态
// ---------------------------------------------------------------------------

/** 是否已完成 auto updater 初始化。 */
let autoUpdateInstalled = false

/** 缓存日志输出函数。 */
let cachedLog: Logger | null = null

/** 定时检查计时器。 */
let checkTimer: NodeJS.Timeout | null = null

/** 最近一次状态快照。 */
let lastStatus: AutoUpdateStatus = {
  state: 'idle',
  currentVersion: app.getVersion(),
  ts: Date.now(),
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

/** Normalize release notes into a single string. */
function normalizeReleaseNotes(info: UpdateInfo): string | undefined {
  const notes = info.releaseNotes
  if (!notes) return undefined
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    const merged = notes
      .map((entry) => (entry && typeof entry.note === 'string' ? entry.note : ''))
      .filter(Boolean)
      .join('\n')
    return merged || undefined
  }
  return undefined
}

/** Broadcasts update status to all renderer windows. */
function emitStatus(next: Omit<AutoUpdateStatus, 'currentVersion' | 'ts'> & Partial<Pick<AutoUpdateStatus, 'currentVersion' | 'ts'>>): void {
  const payload: AutoUpdateStatus = {
    ...lastStatus,
    ...next,
    currentVersion: app.getVersion(),
    ts: Date.now(),
  }
  lastStatus = payload

  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue
    try {
      win.webContents.send('openloaf:auto-update:status', payload)
    } catch {
      // ignore
    }
  }
}

/** Converts download progress into status payload. */
function toProgressStatus(progress: ProgressInfo): AutoUpdateStatus {
  return {
    ...lastStatus,
    state: 'downloading',
    currentVersion: app.getVersion(),
    progress: {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    },
    ts: Date.now(),
  }
}

/** Configure auto updater feed URL when provided. */
function configureFeedUrl(log: Logger): void {
  const url = resolveElectronFeedUrl()
  try {
    autoUpdater.setFeedURL({ provider: 'generic', url })
    log(`Auto update feed URL set: ${url}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(`Auto update feed URL set failed: ${message}`)
  }
}

/** Returns the absolute path of persisted launch metadata. */
function launchStatePath(): string {
  return path.join(app.getPath('userData'), AUTO_UPDATE_LAUNCH_STATE_FILE)
}

/** Reads persisted launch metadata. */
function readLaunchState(): AutoUpdateLaunchState {
  try {
    const raw = fs.readFileSync(launchStatePath(), 'utf-8')
    return JSON.parse(raw) as AutoUpdateLaunchState
  } catch {
    return {}
  }
}

/** Writes persisted launch metadata. */
function writeLaunchState(state: AutoUpdateLaunchState): void {
  const filePath = launchStatePath()
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(state), 'utf-8')
  } catch {
    // ignore
  }
}

/** Resolves updater cache root path by current platform. */
function resolveUpdaterBaseCachePath(): string {
  const homeDir = os.homedir()
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local')
  }
  if (process.platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Caches')
  }
  return process.env.XDG_CACHE_HOME || path.join(homeDir, '.cache')
}

/** Extracts updater cache directory name from app-update.yml content. */
function parseUpdaterCacheDirName(raw: string): string | null {
  const pattern = new RegExp(`^\\s*${UPDATER_CACHE_DIR_KEY}\\s*:\\s*(.+)$`, 'm')
  const matched = raw.match(pattern)
  if (!matched?.[1]) return null
  const value = matched[1].trim().replace(/^['"]|['"]$/g, '')
  return value || null
}

/** Resolves updater cache directory name from app-update.yml with fallback. */
function resolveUpdaterCacheDirName(log: Logger): string {
  try {
    const appUpdatePath = path.join(process.resourcesPath, 'app-update.yml')
    if (fs.existsSync(appUpdatePath)) {
      const raw = fs.readFileSync(appUpdatePath, 'utf-8')
      const dirName = parseUpdaterCacheDirName(raw)
      if (dirName) return dirName
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(`Auto update cache dir resolve failed: ${message}`)
  }
  return app.getName()
}

/** Cleans stale pending installer files only after version change. */
function cleanPendingInstallerAfterVersionUpgrade(log: Logger): void {
  const currentVersion = app.getVersion()
  const lastVersion = readLaunchState().lastLaunchedVersion
  writeLaunchState({ lastLaunchedVersion: currentVersion })

  // 中文注释：仅在版本变化后清理，避免误删尚未安装的已下载更新包。
  if (!lastVersion || lastVersion === currentVersion) return

  try {
    const cacheRoot = resolveUpdaterBaseCachePath()
    const cacheDirName = resolveUpdaterCacheDirName(log)
    const pendingDir = path.join(cacheRoot, cacheDirName, 'pending')
    if (!fs.existsSync(pendingDir)) return

    // 中文注释：只清理 pending，保留其它缓存目录，降低误伤风险。
    fs.rmSync(pendingDir, { recursive: true, force: true })
    log(
      `Auto update pending installer cache cleared: ${pendingDir} (version ${lastVersion} -> ${currentVersion}).`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log(`Auto update pending installer cache cleanup failed: ${message}`)
  }
}

// ---------------------------------------------------------------------------
// 对外方法
// ---------------------------------------------------------------------------

/** Returns the latest auto-update status snapshot. */
export function getAutoUpdateStatus(): AutoUpdateStatus {
  return lastStatus
}

/** Triggers an update check (packaged builds only). */
export async function checkForUpdates(reason = 'manual'): Promise<AutoUpdateResult> {
  if (!app.isPackaged) {
    cachedLog?.(`Auto update skipped (${reason}): not packaged.`)
    return { ok: false, reason: 'not-packaged' }
  }

  // 每次检查前重新配置 feed URL，确保渠道切换后立即生效（无需重启）。
  if (cachedLog) configureFeedUrl(cachedLog)

  try {
    await autoUpdater.checkForUpdates()
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    cachedLog?.(`Auto update check failed (${reason}): ${message}`)
    emitStatus({
      state: 'error',
      error: message,
      lastCheckedAt: Date.now(),
      progress: undefined,
    })
    return { ok: false, reason: message }
  }
}

/** Restart the app to apply updates if available. */
export function restartForUpdates(): AutoUpdateResult {
  if (!app.isPackaged) {
    cachedLog?.('Auto update restart skipped: not packaged.')
    return { ok: false, reason: 'not-packaged' }
  }

  try {
    // 跳过退出确认弹窗，直接退出安装更新。
    skipQuitConfirmation()
    if (lastStatus.state === 'downloaded') {
      // 中文注释：若已下载本体更新，优先走 autoUpdater 安装。
      autoUpdater.quitAndInstall()
      return { ok: true }
    }
    // 中文注释：增量更新仅需重启应用即可生效。
    app.relaunch()
    app.exit(0)
    return { ok: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    cachedLog?.(`Auto update restart failed: ${message}`)
    return { ok: false, reason: message }
  }
}

/** Sets up auto-update checks for packaged builds. */
export function installAutoUpdate(options: AutoUpdateOptions): void {
  const { log } = options
  cachedLog = log

  if (!app.isPackaged) {
    // 中文注释：仅在打包环境启用更新，避免 dev 模式触发无效检查。
    log('Auto update skipped (not packaged).')
    return
  }

  if (autoUpdateInstalled) {
    // 中文注释：防止多次注册更新监听导致重复触发。
    log('Auto update already initialized.')
    return
  }
  autoUpdateInstalled = true

  // 中文注释：在新版本首次启动时清理旧安装包，释放磁盘占用。
  cleanPendingInstallerAfterVersionUpgrade(log)

  configureFeedUrl(log)
  autoUpdater.autoDownload = true
  // 禁止退出时自动启动安装程序。
  // Windows 上 autoInstallOnAppQuit 会在关闭时静默启动 NSIS installer，
  // 但用户可能立即重新打开应用，导致安装程序和主程序同时运行，安装失败。
  // 更新安装统一由用户在 UI 点击"立即安装"触发（走 quitAndInstall 路径）。
  autoUpdater.autoInstallOnAppQuit = false

  // 监听更新流程事件，便于定位更新失败原因。
  autoUpdater.on('checking-for-update', () => {
    log('Checking for updates...')
    emitStatus({
      state: 'checking',
      lastCheckedAt: Date.now(),
      error: undefined,
      progress: undefined,
    })
  })
  autoUpdater.on('update-available', (info) => {
    log('Update available.')
    emitStatus({
      state: 'available',
      nextVersion: info.version,
      releaseNotes: normalizeReleaseNotes(info),
      lastCheckedAt: Date.now(),
      progress: undefined,
    })
  })
  autoUpdater.on('update-not-available', () => {
    log('No updates available.')
    emitStatus({
      state: 'not-available',
      nextVersion: undefined,
      releaseNotes: undefined,
      error: undefined,
      lastCheckedAt: Date.now(),
      progress: undefined,
    })
  })
  autoUpdater.on('error', (error) => {
    const message = error instanceof Error ? error.message : String(error)
    log(`Auto update error: ${message}`)
    emitStatus({ state: 'error', error: message, progress: undefined })
  })
  autoUpdater.on('download-progress', (progress) => {
    const totalMB = (progress.total / 1024 / 1024).toFixed(1)
    const transferredMB = (progress.transferred / 1024 / 1024).toFixed(1)
    const speedMB = (progress.bytesPerSecond / 1024 / 1024).toFixed(2)
    log(`Update download progress: ${Math.round(progress.percent)}% (${transferredMB}/${totalMB} MB, ${speedMB} MB/s)`)
    emitStatus(toProgressStatus(progress))
  })
  autoUpdater.on('update-downloaded', (info) => {
    log('Update downloaded. It will be installed on quit.')
    emitStatus({
      state: 'downloaded',
      nextVersion: info.version,
      releaseNotes: normalizeReleaseNotes(info),
      progress: undefined,
    })
  })

  emitStatus({ state: 'idle', progress: undefined })
  // 延迟一次检测，避免启动阶段竞争网络/IO。
  setTimeout(() => {
    void checkForUpdates('startup')
  }, INITIAL_CHECK_DELAY_MS)

  // 周期性检测，避免长时间运行错过更新。
  if (!checkTimer) {
    checkTimer = setInterval(() => {
      void checkForUpdates('scheduled')
    }, CHECK_INTERVAL_MS)
  }
}
