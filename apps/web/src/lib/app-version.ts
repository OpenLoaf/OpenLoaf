/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

/** Build-time web version fallback (non-Electron environments). */
const BUILD_TIME_WEB_VERSION: string = process.env.NEXT_PUBLIC_APP_VERSION || ''

type VersionCache = {
  desktopVersion: string
  serverVersion: string
  webVersion: string
}

let cached: VersionCache | undefined

/**
 * Resolve all app versions with lazy caching.
 * In Electron: reads from getIncrementalUpdateStatus() + getAppVersion().
 * In web-only: falls back to build-time NEXT_PUBLIC_APP_VERSION.
 */
async function resolveVersions(): Promise<VersionCache> {
  if (cached) return cached

  const api = typeof window !== 'undefined' ? window.openloafElectron : undefined
  if (!api) {
    cached = { desktopVersion: '', serverVersion: '', webVersion: BUILD_TIME_WEB_VERSION }
    return cached
  }

  let desktopVersion = ''
  let serverVersion = ''
  let webVersion = BUILD_TIME_WEB_VERSION

  try {
    const status = await api.getIncrementalUpdateStatus?.()
    if (status) {
      serverVersion = status.server?.version || ''
      webVersion = status.web?.version || BUILD_TIME_WEB_VERSION
    }
  } catch {
    // ignore
  }

  try {
    desktopVersion = await api.getAppVersion?.() || ''
  } catch {
    // ignore
  }

  cached = { desktopVersion, serverVersion, webVersion }
  return cached
}

/** Get desktop (Electron) app version. */
export async function getDesktopVersion(): Promise<string | undefined> {
  const v = await resolveVersions()
  return v.desktopVersion || undefined
}

/** Get server version. */
export async function getServerVersion(): Promise<string | undefined> {
  const v = await resolveVersions()
  return v.serverVersion || undefined
}

/** Get web app version. */
export async function getWebVersion(): Promise<string | undefined> {
  const v = await resolveVersions()
  return v.webVersion || undefined
}
