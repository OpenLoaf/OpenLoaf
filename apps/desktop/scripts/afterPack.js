/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
// @ts-check
/**
 * electron-builder afterPack hook
 *
 * Runs after files are copied into the app bundle but BEFORE code signing.
 * Acts as a safety net: removes cross-platform / cross-architecture files
 * that should not be signed (or shipped at all on the target platform).
 */

const fs = require('fs')
const path = require('path')

/**
 * Platform-specific prune lists.
 * Each entry is a relative path under the Resources directory.
 */
const PRUNE_PATHS_COMMON = [
  // sharp: non-runtime files
  'node_modules/sharp/src',
  'node_modules/sharp/install',
  'node_modules/sharp/README.md',
  'node_modules/sharp/LICENSE',
  'node_modules/sharp/node_modules',
]

const PRUNE_PATHS_MAC = [
  ...PRUNE_PATHS_COMMON,
  // node-pty: wrong-arch / wrong-platform prebuilds
  'prebuilds/darwin-x64',
  'prebuilds/win32-arm64',
  'prebuilds/win32-x64',
  'prebuilds/linux-x64',
  // speech: source code & Windows files
  'speech/windows',
  'speech/macos/SpeechRecognizer.swift',
  // calendar: source code & Windows files
  'calendar/windows',
  'calendar/macos/CalendarHelper.swift',
  'calendar/macos/README.md',
  // Windows icon — not needed on macOS
  'icon.ico',
]

const PRUNE_PATHS_WIN = [
  ...PRUNE_PATHS_COMMON,
  // node-pty: wrong-platform prebuilds
  'prebuilds/darwin-arm64',
  'prebuilds/darwin-x64',
  'prebuilds/linux-x64',
  // speech: source code & macOS files
  'speech/macos',
  'speech/windows/Program.cs',
  'speech/windows/OpenLoafSpeech.csproj',
  // calendar: source code & macOS files
  'calendar/macos',
  'calendar/windows/Program.cs',
  'calendar/windows/OpenLoafCalendar.csproj',
  'calendar/windows/README.md',
  // macOS icon — not needed on Windows
  'icon.icns',
]

const PRUNE_PATHS_LINUX = [
  ...PRUNE_PATHS_COMMON,
  // node-pty: wrong-platform prebuilds
  'prebuilds/darwin-arm64',
  'prebuilds/darwin-x64',
  'prebuilds/win32-arm64',
  'prebuilds/win32-x64',
  // speech & calendar: Linux has no native helpers
  'speech',
  'calendar',
  // macOS / Windows icons
  'icon.icns',
  'icon.ico',
]

/**
 * Resolves the target platform from electron-builder context.
 * @param {import('electron-builder').AfterPackContext} context
 * @returns {string}
 */
function resolveTargetPlatform(context) {
  // 使用打包目标平台，避免跨平台构建时误用宿主平台。
  return context.electronPlatformName || process.platform
}

/**
 * Resolves the Resources directory path based on target platform.
 *
 * macOS:         {appOutDir}/OpenLoaf.app/Contents/Resources
 * Windows/Linux: {appOutDir}/resources
 * @param {import('electron-builder').AfterPackContext} context
 * @param {string} targetPlatform
 */
function resolveResourcesDir(context, targetPlatform) {
  if (targetPlatform === 'darwin') {
    return path.join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      'Contents',
      'Resources'
    )
  }
  return path.join(context.appOutDir, 'resources')
}

/**
 * @param {import('electron-builder').AfterPackContext} context
 */
exports.default = async function afterPack(context) {
  const targetPlatform = resolveTargetPlatform(context)
  const resourcesDir = resolveResourcesDir(context, targetPlatform)

  let prunePaths
  if (targetPlatform === 'darwin') {
    prunePaths = PRUNE_PATHS_MAC
  } else if (targetPlatform === 'win32') {
    prunePaths = PRUNE_PATHS_WIN
  } else {
    prunePaths = PRUNE_PATHS_LINUX
  }

  let removedCount = 0

  for (const rel of prunePaths) {
    const target = path.join(resourcesDir, rel)
    try {
      const stat = fs.statSync(target)
      fs.rmSync(target, { recursive: stat.isDirectory(), force: true })
      removedCount++
      console.log(`  [afterPack] removed: ${rel}`)
    } catch {
      // File does not exist — already filtered by extraResources, skip silently
    }
  }

  console.log(`  [afterPack] pruned ${removedCount} items from Resources/ (${targetPlatform})`)
}
