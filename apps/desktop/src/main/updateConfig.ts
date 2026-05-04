/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { getOpenLoafRootDir } from '@openloaf/config'

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 海外用户走 R2 自定义域名。 */
const R2_BASE_URL = 'https://openloaf-r2.hexems.com'
/** 国内用户走腾讯云 CDN（回源 R2）。 */
const CN_CDN_BASE_URL = 'https://openloaf-cdn.hexems.com'
const SETTINGS_FILE_NAME = '.settings.json'

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type UpdateChannel = 'stable' | 'beta'

type SettingsJson = {
  updateChannel?: UpdateChannel
  minimizeToTray?: boolean
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// runtime.env 解析
// ---------------------------------------------------------------------------

/**
 * 检测当前运行时是否属于"国内"，用于在 R2/CDN 之间分流。
 * 优先 app.getLocale()（zh-* 视为国内），再退回 IANA 时区匹配 (Asia/Shanghai 等)。
 */
function isCnRuntime(): boolean {
  try {
    const locale = app.getLocale()?.toLowerCase()
    if (locale && locale.startsWith('zh')) return true
  } catch {
    // app 未 ready 或 locale 不可用时跳过 — 走时区兜底
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz === 'Asia/Shanghai' || tz === 'Asia/Chongqing' || tz === 'Asia/Urumqi') return true
  } catch {
    // 不支持 Intl 时降级为海外
  }
  return false
}

/** 默认 base URL：按地区分流（国内 CDN，海外 R2）。 */
function defaultBaseUrlByRegion(): string {
  return isCnRuntime() ? CN_CDN_BASE_URL : R2_BASE_URL
}

/**
 * 决定 Electron / 增量更新读取 manifest 的 base URL。
 * 显式 OPENLOAF_UPDATE_URL 强制覆盖（process.env > runtime.env），否则按地区分流。
 */
export function resolveUpdateBaseUrl(): string {
  const fromEnv = process.env.OPENLOAF_UPDATE_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/+$/, '')

  try {
    const runtimeEnvPath = path.join(process.resourcesPath, 'runtime.env')
    if (fs.existsSync(runtimeEnvPath)) {
      const raw = fs.readFileSync(runtimeEnvPath, 'utf-8')
      const vars = parseEnvFile(raw)
      if (vars.OPENLOAF_UPDATE_URL) {
        return vars.OPENLOAF_UPDATE_URL.replace(/\/+$/, '')
      }
    }
  } catch {
    // 读取 runtime.env 失败时忽略，继续走地区分流默认。
  }

  return defaultBaseUrlByRegion()
}

/**
 * 把 manifest 里写死的 R2 绝对 URL 重写成当前地区的 base URL（国内换成 CDN）。
 * 用于 server / web 增量包下载、electron-updater yml 里的 `path` 字段等场景；
 * 已知 host = openloaf-r2.hexems.com 时才替换，其它 host 原样返回（避免误改）。
 */
export function localizeUpdateUrl(absoluteUrl: string): string {
  if (!absoluteUrl || typeof absoluteUrl !== 'string') return absoluteUrl
  const region = resolveUpdateBaseUrl()
  if (region === R2_BASE_URL) return absoluteUrl
  if (absoluteUrl.startsWith(`${R2_BASE_URL}/`) || absoluteUrl === R2_BASE_URL) {
    return region + absoluteUrl.slice(R2_BASE_URL.length)
  }
  return absoluteUrl
}

// ---------------------------------------------------------------------------
// 渠道偏好
// ---------------------------------------------------------------------------

function settingsPath(): string {
  return path.join(getOpenLoafRootDir(), SETTINGS_FILE_NAME)
}

function readSettings(): SettingsJson {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8')
    return JSON.parse(raw) as SettingsJson
  } catch {
    return {}
  }
}

function writeSettings(settings: SettingsJson): void {
  const dir = path.dirname(settingsPath())
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}

/** 读取当前渠道偏好，默认 stable。 */
export function resolveUpdateChannel(): UpdateChannel {
  const settings = readSettings()
  const channel = settings.updateChannel
  if (channel === 'beta') return 'beta'
  return 'stable'
}

/** 切换渠道并持久化到 ~/.openloaf/.settings.json。 */
export function switchUpdateChannel(channel: UpdateChannel): void {
  const settings = readSettings()
  settings.updateChannel = channel
  writeSettings(settings)
}

// ---------------------------------------------------------------------------
// 托盘偏好
// ---------------------------------------------------------------------------

/** 读取"最小化到托盘"偏好，默认 false。 */
export function getMinimizeToTray(): boolean {
  const settings = readSettings()
  return settings.minimizeToTray === true
}

/** 持久化"最小化到托盘"偏好。 */
export function setMinimizeToTray(value: boolean): void {
  const settings = readSettings()
  settings.minimizeToTray = value
  writeSettings(settings)
}

// ---------------------------------------------------------------------------
// 语言偏好（从 settings.json 的 basic.uiLanguage 读取，单一来源）
// ---------------------------------------------------------------------------

/** 读取 UI 语言偏好。从 settings.json → basic.uiLanguage 读取，fallback 为 'en-US'。 */
export function getLanguage(): string {
  try {
    const raw = fs.readFileSync(
      path.join(getOpenLoafRootDir(), 'settings.json'),
      'utf-8',
    )
    const parsed = JSON.parse(raw) as { basic?: { uiLanguage?: string | null } }
    return parsed?.basic?.uiLanguage || 'en-US'
  } catch {
    return 'en-US'
  }
}

// ---------------------------------------------------------------------------
// URL 派生
// ---------------------------------------------------------------------------

/** 增量更新清单 URL：${baseUrl}/${channel}/manifest.json */
export function resolveManifestUrl(): string {
  const base = resolveUpdateBaseUrl()
  const channel = resolveUpdateChannel()
  return `${base}/${channel}/manifest.json`
}

/** Electron 本体更新源 URL：${baseUrl}/desktop/${channel} */
export function resolveElectronFeedUrl(): string {
  const base = resolveUpdateBaseUrl()
  const channel = resolveUpdateChannel()
  return `${base}/desktop/${channel}`
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function parseEnvFile(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (value) {
      result[key] = value
    }
  }
  return result
}
