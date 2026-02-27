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

// ---------------------------------------------------------------------------
// 跨平台回退：当 Forge 产物不存在时（如 macOS→Windows 交叉编译），
// 直接从 monorepo node_modules/ 收集原生依赖。
// 与 forge.config.ts postPackage 钩子保持一致。
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..')
const MONOREPO_NODE_MODULES = path.resolve(REPO_ROOT, 'node_modules')

/** 需要随应用打包的原生/运行时依赖根节点（与 forge.config.ts NATIVE_DEP_ROOTS 一致） */
const NATIVE_DEP_ROOTS = [
  'sharp',
  'libsql',
  '@libsql',
  'playwright-core',
]

/** 平台特定包名模式（与 forge.config.ts PLATFORM_PACKAGE_PATTERNS 一致） */
const PLATFORM_PACKAGE_PATTERNS = [
  /^@img\/sharp(-libvips)?-(?<platform>darwin|linux|linuxmusl|win32)-(?<arch>arm64|x64)$/,
  /^@libsql\/(?<platform>darwin|linux|win32)-(?<arch>arm64|x64)(-gnu|-musl|-msvc)?$/,
]

/**
 * 检查包是否匹配目标平台。非平台特定包始终包含。
 */
function shouldIncludePackage(packageName, targetPlatform, targetArch) {
  for (const pattern of PLATFORM_PACKAGE_PATTERNS) {
    const match = packageName.match(pattern)
    if (match?.groups) {
      const { platform: pkgPlatform, arch: pkgArch } = match.groups
      const normalizedPkgPlatform = pkgPlatform === 'linuxmusl' ? 'linux' : pkgPlatform
      return normalizedPkgPlatform === targetPlatform && pkgArch === targetArch
    }
  }
  return true
}

/**
 * 递归收集指定包的所有 production 依赖。
 */
function collectDeps(packageName, nmDir, visited) {
  if (visited.has(packageName)) return
  const pkgDir = path.join(nmDir, packageName)
  if (!fs.existsSync(pkgDir)) return
  visited.add(packageName)
  const pkgJsonPath = path.join(pkgDir, 'package.json')
  if (!fs.existsSync(pkgJsonPath)) return
  try {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
    const allDeps = {
      ...(pkgJson.dependencies || {}),
      ...(pkgJson.optionalDependencies || {}),
    }
    for (const dep of Object.keys(allDeps)) {
      collectDeps(dep, nmDir, visited)
    }
  } catch {
    // ignore
  }
}

/**
 * 处理一个 NATIVE_DEP_ROOTS 条目（支持 scope 级别枚举）。
 */
function collectRoot(root, nmDir, visited) {
  const isScope = root.startsWith('@') && !root.includes('/')
  if (isScope) {
    const scopeDir = path.join(nmDir, root)
    if (!fs.existsSync(scopeDir)) return
    try {
      for (const entry of fs.readdirSync(scopeDir)) {
        collectDeps(`${root}/${entry}`, nmDir, visited)
      }
    } catch {
      // ignore
    }
  } else {
    collectDeps(root, nmDir, visited)
  }
}

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
 * electron-builder arch enum → Forge arch string.
 * @param {number} arch
 * @returns {string}
 */
function archToString(arch) {
  // electron-builder Arch: 0=ia32, 1=x64, 3=arm64, 4=armv7l, 5=universal
  const map = { 0: 'ia32', 1: 'x64', 3: 'arm64', 4: 'armv7l', 5: 'universal' }
  return map[arch] || 'x64'
}

/**
 * 跨平台回退：直接从 monorepo node_modules/ 收集原生模块到 builder 产物。
 * 当 Forge 产物不存在时使用（如 macOS→Windows 交叉编译）。
 *
 * @param {string} resourcesDir electron-builder 产物的 Resources 路径
 * @param {string} targetPlatform 目标平台（darwin/win32/linux）
 * @param {string} arch 目标架构（x64/arm64）
 */
function directCopyNativeModules(resourcesDir, targetPlatform, arch) {
  console.log(`  [afterPack] Forge output not found for ${targetPlatform}-${arch}, copying directly from node_modules/`)

  const destNmDir = path.join(resourcesDir, 'node_modules')
  fs.mkdirSync(destNmDir, { recursive: true })

  // 1) 递归收集所有需要的包
  const allPackages = new Set()
  for (const root of NATIVE_DEP_ROOTS) {
    collectRoot(root, MONOREPO_NODE_MODULES, allPackages)
  }

  // 2) 按目标平台过滤
  const filteredPackages = [...allPackages].filter((pkg) =>
    shouldIncludePackage(pkg, targetPlatform, arch),
  )

  console.log(
    `  [afterPack] Resolved ${allPackages.size} packages, ${filteredPackages.length} after platform filtering (${targetPlatform}-${arch})`,
  )

  // 3) 复制到 Resources/node_modules/
  for (const pkg of filteredPackages) {
    const src = path.join(MONOREPO_NODE_MODULES, pkg)
    const dest = path.join(destNmDir, pkg)
    if (!fs.existsSync(src) || fs.existsSync(dest)) continue

    if (pkg.startsWith('@')) {
      fs.mkdirSync(path.join(destNmDir, pkg.split('/')[0]), { recursive: true })
    }

    fs.cpSync(src, dest, { recursive: true })
    console.log(`  [afterPack]   + ${pkg}`)
  }

  // 4) node-pty prebuilds
  const prebuildsSrc = path.join(MONOREPO_NODE_MODULES, 'node-pty', 'prebuilds')
  if (fs.existsSync(prebuildsSrc)) {
    const targetPrebuild = `${targetPlatform}-${arch}`
    const targetPrebuildSrc = path.join(prebuildsSrc, targetPrebuild)
    if (fs.existsSync(targetPrebuildSrc)) {
      const prebuildsDest = path.join(resourcesDir, 'prebuilds', targetPrebuild)
      fs.mkdirSync(prebuildsDest, { recursive: true })
      fs.cpSync(targetPrebuildSrc, prebuildsDest, { recursive: true })
      console.log(`  [afterPack]   + prebuilds/${targetPrebuild}/ (node-pty)`)
    } else {
      console.warn(`  [afterPack] node-pty prebuild not found for ${targetPrebuild}`)
    }
  }
}

/**
 * Forge postPackage 将 node_modules/ 和 prebuilds/ 复制到了 Forge 产物的 Resources 目录，
 * 但 electron-builder 重新打包时只使用 extraResources 配置，不会包含 Forge 产出的这些目录。
 * 此函数在 afterPack 阶段将它们从 Forge 产物拷贝到 electron-builder 产物。
 *
 * 跨平台编译时（如 macOS→Windows），Forge 只产出宿主平台产物，
 * 目标平台的 Forge 产物不存在。此时回退到 directCopyNativeModules()，
 * 直接从 monorepo node_modules/ 收集并过滤原生依赖。
 *
 * @param {string} resourcesDir electron-builder 产物的 Resources 路径
 * @param {import('electron-builder').AfterPackContext} context
 */
function copyForgeNativeModules(resourcesDir, context) {
  const targetPlatform = resolveTargetPlatform(context)
  const arch = archToString(context.arch)
  const productName = context.packager.appInfo.productFilename

  // Forge 产物路径
  let forgeResourcesDir
  if (targetPlatform === 'darwin') {
    forgeResourcesDir = path.join(
      __dirname, '..', 'out',
      `${productName}-${targetPlatform}-${arch}`,
      `${productName}.app`, 'Contents', 'Resources'
    )
  } else {
    forgeResourcesDir = path.join(
      __dirname, '..', 'out',
      `${productName}-${targetPlatform}-${arch}`,
      'resources'
    )
  }

  // 从 Forge 产物复制所有额外资源（node_modules、prebuilds、server.mjs、seed.db 等）
  // 排除 electron-builder 自身管理的文件（asar、locale、electron 图标）
  const SKIP_ENTRIES = new Set(['app.asar', 'electron.icns'])
  let copiedFromForge = false
  if (fs.existsSync(forgeResourcesDir)) {
    for (const entry of fs.readdirSync(forgeResourcesDir)) {
      if (SKIP_ENTRIES.has(entry) || entry.endsWith('.lproj')) continue
      const src = path.join(forgeResourcesDir, entry)
      const dest = path.join(resourcesDir, entry)
      if (fs.existsSync(dest)) continue
      fs.cpSync(src, dest, { recursive: true })
      console.log(`  [afterPack] copied ${entry}${fs.statSync(src).isDirectory() ? '/' : ''} from Forge output`)
      copiedFromForge = true
    }
  }

  // Forge 产物不存在（跨平台编译），回退到直接收集
  if (!copiedFromForge && !fs.existsSync(path.join(resourcesDir, 'node_modules'))) {
    directCopyNativeModules(resourcesDir, targetPlatform, arch)
  }
}

/**
 * @param {import('electron-builder').AfterPackContext} context
 */
exports.default = async function afterPack(context) {
  const targetPlatform = resolveTargetPlatform(context)
  const resourcesDir = resolveResourcesDir(context, targetPlatform)

  // 从 Forge 产物复制原生模块到 electron-builder 产物
  copyForgeNativeModules(resourcesDir, context)

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
