#!/usr/bin/env node
/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Build the macOS control helper (Swift Package) used by the MacosObserve /
 * MacosAct AI tools. Produces a universal binary at
 *   apps/desktop/native/macos-control/.build/release/macos-control
 * which electron-forge's extraResource copies into process.resourcesPath at
 * pack time (see forge.config.ts), and which the Electron supervisor points
 * the server at via OPENLOAF_MACOS_HELPER_PATH (see prodServices.ts).
 *
 * Skipped on non-darwin hosts.
 */
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')
const packageDir = join(rootDir, 'native', 'macos-control')

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: packageDir, ...opts })
  if (r.error) throw r.error
  if (r.status !== 0) {
    throw new Error(`${cmd} exited with code ${r.status ?? 'unknown'}`)
  }
}

function main() {
  if (process.platform !== 'darwin') {
    console.log('[macos-control] Skip build: macOS only.')
    return
  }
  if (!existsSync(join(packageDir, 'Package.swift'))) {
    throw new Error(`macos-control Package.swift not found at ${packageDir}`)
  }
  run('swift', ['build', '-c', 'release', '--arch', 'arm64', '--arch', 'x86_64'])
  // Universal (multi-arch) builds land under .build/apple/Products/Release,
  // while single-arch releases land under .build/release. Downstream configs
  // (forge.config.ts extraResource, OPENLOAF_MACOS_HELPER_PATH in
  // devServices/prodServices) all point at .build/release/macos-control —
  // copy the universal binary there to keep a single stable path.
  const universal = join(packageDir, '.build', 'apple', 'Products', 'Release', 'macos-control')
  const singleArch = join(packageDir, '.build', 'release', 'macos-control')
  const out = existsSync(universal) ? universal : singleArch
  if (!existsSync(out)) {
    throw new Error(
      `Build succeeded but binary missing at ${universal} (universal) or ${singleArch} (single-arch)`,
    )
  }
  if (out === universal) {
    mkdirSync(dirname(singleArch), { recursive: true })
    copyFileSync(universal, singleArch)
  }
  console.log(`[macos-control] Built: ${singleArch}`)
}

main()
