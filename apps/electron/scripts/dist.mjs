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
import os from 'node:os'

const arch = os.arch()
const mainPath = `.webpack/${arch}/main/index.js`

const extraArgs = process.argv.slice(2).join(' ')

const cmd = [
  'dotenv -e .env --',
  'electron-builder',
  `--config.extraMetadata.main=${mainPath}`,
  extraArgs,
].filter(Boolean).join(' ')

console.log(`[dist] arch=${arch}, main=${mainPath}`)
console.log(`[dist] ${cmd}`)

execSync(cmd, { stdio: 'inherit' })
