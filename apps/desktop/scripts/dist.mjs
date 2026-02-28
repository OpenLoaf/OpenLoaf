/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * Wrapper script for electron-builder that dynamically sets extraMetadata.main
 * based on the host architecture.
 *
 * electron-forge webpack plugin outputs to `.webpack/{arch}/main/index.js`
 * (e.g. arm64, x64), so the `main` field in the asar package.json must match.
 *
 * Usage (from pnpm scripts):
 *   node scripts/dist.mjs [electron-builder flags...]
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const arch = os.arch()
const mainPath = `.webpack/${arch}/main/index.js`

if (process.platform === 'win32' && process.env.CSC_IDENTITY_AUTO_DISCOVERY == null) {
  const hasCodeSignEnv = Boolean(
    process.env.CSC_LINK ||
      process.env.WIN_CSC_LINK ||
      process.env.CSC_KEY_PASSWORD ||
      process.env.SIGNTOOL_PATH
  )
  if (!hasCodeSignEnv) {
    process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  }
}

function canCreateSymlink() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'openloaf-symlink-'))
  const target = path.join(base, 'target.txt')
  const link = path.join(base, 'link.txt')
  try {
    fs.writeFileSync(target, 'x')
    fs.symlinkSync(target, link)
    return true
  } catch {
    return false
  } finally {
    try {
      fs.rmSync(base, { recursive: true, force: true })
    } catch {}
  }
}

// 跨平台编译（macOS/Linux → Windows）时的处理：
// - 签名：非 Windows 宿主无 signtool，必须跳过
// - 图标嵌入 (rcedit)：非 Windows 宿主需要 wine，默认也跳过
//   设置 OPENLOAF_RCEDIT=true 可在安装了 wine 的环境中启用 rcedit（仅嵌入图标，不签名）
if (process.env.OPENLOAF_REQUIRE_WIN_SIGN !== 'true' && process.env.OPENLOAF_SKIP_WIN_SIGN == null) {
  if (process.platform !== 'win32') {
    process.env.OPENLOAF_SKIP_WIN_SIGN = 'true'
  } else if (!canCreateSymlink()) {
    process.env.OPENLOAF_SKIP_WIN_SIGN = 'true'
  }
}

const extraFlags = []
const isWinTarget = process.argv.some((arg) => arg === '--win' || arg.startsWith('--win='))
if (process.env.OPENLOAF_SKIP_WIN_SIGN === 'true' && isWinTarget) {
  // Windows 原生构建或 CI：signAndEditExecutable 保持默认 true（rcedit 正常嵌入图标）
  // 非 Windows 宿主：跳过 rcedit（避免 wine 依赖），除非显式设置 OPENLOAF_RCEDIT=true
  if (process.platform !== 'win32' && process.env.OPENLOAF_RCEDIT !== 'true') {
    extraFlags.push('--config.win.signAndEditExecutable=false')
  }
}

const isMacTarget = process.argv.some((arg) => arg === '--mac' || arg.startsWith('--mac='))
if (isMacTarget) {
  const icnsPath = path.resolve('resources', 'icon.icns')
  if (fs.existsSync(icnsPath)) {
    extraFlags.push(`--config.mac.icon=${icnsPath}`)
  }
  // CI 环境下传递公证配置，避免 electron-builder 因缺少 notarize 选项而报错
  if (process.env.APPLE_TEAM_ID) {
    extraFlags.push(`--config.mac.notarize.teamId=${process.env.APPLE_TEAM_ID}`)
  }
}

if (isWinTarget) {
  const icoPath = path.resolve('resources', 'icon.ico')
  if (fs.existsSync(icoPath)) {
    extraFlags.push(`--config.win.icon=${icoPath}`)
  }
}

const extraArgs = [...extraFlags, ...process.argv.slice(2)].join(' ')

const cmd = [
  'pnpm exec dotenv -e .env --',
  'electron-builder',
  `--config.extraMetadata.main=${mainPath}`,
  '--config.afterPack=./scripts/afterPack.js',
  extraArgs,
].filter(Boolean).join(' ')

console.log(`[dist] arch=${arch}, main=${mainPath}`)
console.log(`[dist] ${cmd}`)

execSync(cmd, { stdio: 'inherit' })
