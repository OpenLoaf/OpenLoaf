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
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'tenas-symlink-'))
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

if (
  process.platform === 'win32' &&
  process.env.TENAS_REQUIRE_WIN_SIGN !== 'true' &&
  process.env.TENAS_SKIP_WIN_SIGN == null
) {
  if (!canCreateSymlink()) {
    process.env.TENAS_SKIP_WIN_SIGN = 'true'
  }
}

const extraFlags = []
if (process.platform === 'win32' && process.env.TENAS_SKIP_WIN_SIGN === 'true') {
  extraFlags.push('--config.win.signAndEditExecutable=false')
}

const extraArgs = [...extraFlags, ...process.argv.slice(2)].join(' ')

const cmd = [
  'pnpm exec dotenv -e .env --',
  'electron-builder',
  `--config.extraMetadata.main=${mainPath}`,
  extraArgs,
].filter(Boolean).join(' ')

console.log(`[dist] arch=${arch}, main=${mainPath}`)
console.log(`[dist] ${cmd}`)

execSync(cmd, { stdio: 'inherit' })
