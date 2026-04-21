/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Runtime detection helpers. Server is spawned as a Node child by either the
 * Electron supervisor (desktop app) or directly via CLI/Docker. Desktop-only
 * tools (e.g. macOS control) gate registration on `isDesktopRuntime()`.
 */

/** True when this server was launched by the Electron desktop supervisor. */
export function isDesktopRuntime(): boolean {
  return process.env.OPENLOAF_RUNTIME === 'desktop'
}

/** Absolute path to the macos-control helper binary, or undefined when unavailable. */
export function getMacosHelperPath(): string | undefined {
  const p = process.env.OPENLOAF_MACOS_HELPER_PATH
  if (!p) return undefined
  return p
}
