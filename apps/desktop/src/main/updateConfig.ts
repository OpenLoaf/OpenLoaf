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
import { getOpenLoafRootDir } from '@openloaf/config'

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const DEFAULT_UPDATE_BASE_URL = 'https://openloaf-update.hexems.com'
const SETTINGS_FILE_NAME = '.settings.json'

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type UpdateChannel = 'stable' | 'beta'

type SettingsJson = {
  updateChannel?: UpdateChannel
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// runtime.env 解析
// ---------------------------------------------------------------------------

/**
 * 从 process.env 或 runtime.env 中读取 OPENLOAF_UPDATE_URL，
 * 兼容旧的 OPENLOAF_UPDATE_MANIFEST_URL / OPENLOAF_ELECTRON_UPDATE_URL。
 */
export function resolveUpdateBaseUrl(): string {
  // 1. 新变量优先
  const fromEnv = process.env.OPENLOAF_UPDATE_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/+$/, '')

  // 2. 尝试从 runtime.env 读取
  try {
    const runtimeEnvPath = path.join(process.resourcesPath, 'runtime.env')
    if (fs.existsSync(runtimeEnvPath)) {
      const raw = fs.readFileSync(runtimeEnvPath, 'utf-8')
      const vars = parseEnvFile(raw)

      // 新变量
      if (vars.OPENLOAF_UPDATE_URL) {
        return vars.OPENLOAF_UPDATE_URL.replace(/\/+$/, '')
      }

      // 向后兼容：从旧变量推导 base URL
      const oldManifest = vars.OPENLOAF_UPDATE_MANIFEST_URL
      if (oldManifest) {
        // 例如 https://openloaf-update.hexems.com/manifest.json → https://openloaf-update.hexems.com
        const url = new URL(oldManifest)
        return `${url.protocol}//${url.host}`
      }

      const oldElectron = vars.OPENLOAF_ELECTRON_UPDATE_URL
      if (oldElectron) {
        // 例如 https://openloaf-update.hexems.com/desktop → https://openloaf-update.hexems.com
        return oldElectron.replace(/\/(?:electron|desktop)\/?$/, '')
      }
    }
  } catch {
    // 读取 runtime.env 失败时忽略，继续使用默认地址。
  }

  return DEFAULT_UPDATE_BASE_URL
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
// URL 派生
// ---------------------------------------------------------------------------

/** 增量更新清单 URL：${baseUrl}/${channel}/manifest.json */
export function resolveManifestUrl(): string {
  const base = resolveUpdateBaseUrl()
  const channel = resolveUpdateChannel()
  return `${base}/${channel}/manifest.json`
}

/** Electron 本体更新源 URL：${baseUrl}/desktop（固定，不分渠道） */
export function resolveElectronFeedUrl(): string {
  const base = resolveUpdateBaseUrl()
  return `${base}/desktop`
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
