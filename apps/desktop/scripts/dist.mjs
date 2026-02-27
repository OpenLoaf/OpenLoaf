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

// 跨平台编译（macOS/Linux → Windows）时，自动跳过 rcedit，除非明确要求签名。
// 在 Windows 上，仅当无法创建符号链接时跳过（受限环境）。
if (process.env.OPENLOAF_REQUIRE_WIN_SIGN !== 'true' && process.env.OPENLOAF_SKIP_WIN_SIGN == null) {
  if (process.platform !== 'win32') {
    // 非 Windows 宿主 → 必定无 signtool，跳过 rcedit
    process.env.OPENLOAF_SKIP_WIN_SIGN = 'true'
  } else if (!canCreateSymlink()) {
    process.env.OPENLOAF_SKIP_WIN_SIGN = 'true'
  }
}

const extraFlags = []
const isWinTarget = process.argv.some((arg) => arg === '--win' || arg.startsWith('--win='))
// 中文注释：允许在 mac/Linux 构建 Windows 产物时跳过 rcedit，规避 wine 依赖。
if (process.env.OPENLOAF_SKIP_WIN_SIGN === 'true' && isWinTarget) {
  extraFlags.push('--config.win.signAndEditExecutable=false')
}

const isMacTarget = process.argv.some((arg) => arg === '--mac' || arg.startsWith('--mac='))
if (isMacTarget) {
  const icnsPath = path.resolve('resources', 'icon.icns')
  if (fs.existsSync(icnsPath)) {
    extraFlags.push(`--config.mac.icon=${icnsPath}`)
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
