#!/usr/bin/env node
/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Build the MacosControlTestHarness — a standalone SwiftUI .app bundle with
 * pre-baked AX identifiers used by the macos-control-real browser-test suite.
 *
 * The test suite launches it via `open -a` exactly like a regular macOS app,
 * so we must produce a proper .app bundle (not just a bare executable).
 *
 * Output:
 *   apps/desktop/native/macos-control-test-harness/dist/MacosControlTestHarness.app
 *
 * Skipped on non-darwin hosts.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(scriptDir, '..')
const packageDir = join(rootDir, 'native', 'macos-control-test-harness')
const appName = 'MacosControlTestHarness'

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: packageDir, ...opts })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`${cmd} exited with code ${r.status ?? 'unknown'}`)
}

function main() {
  if (process.platform !== 'darwin') {
    console.log('[macos-control-test-harness] Skip build: macOS only.')
    return
  }
  if (!existsSync(join(packageDir, 'Package.swift'))) {
    throw new Error(`Package.swift not found at ${packageDir}`)
  }

  run('swift', ['build', '-c', 'release', '--arch', 'arm64', '--arch', 'x86_64'])

  const universal = join(packageDir, '.build', 'apple', 'Products', 'Release', appName)
  const singleArch = join(packageDir, '.build', 'release', appName)
  const binSrc = existsSync(universal) ? universal : singleArch
  if (!existsSync(binSrc)) {
    throw new Error(`Build succeeded but binary missing at ${universal} or ${singleArch}`)
  }

  const distDir = join(packageDir, 'dist')
  const appRoot = join(distDir, `${appName}.app`)
  const contents = join(appRoot, 'Contents')
  const macos = join(contents, 'MacOS')
  const resources = join(contents, 'Resources')

  rmSync(appRoot, { recursive: true, force: true })
  mkdirSync(macos, { recursive: true })
  mkdirSync(resources, { recursive: true })

  cpSync(binSrc, join(macos, appName))
  cpSync(join(packageDir, 'Resources', 'Info.plist'), join(contents, 'Info.plist'))

  // Ad-hoc sign so Gatekeeper / TCC attributes this bundle stably.
  run('codesign', ['--force', '--sign', '-', appRoot], { cwd: distDir })

  // Register with Launch Services so `open -a MacosControlTestHarness` resolves
  // by name / bundle id from anywhere (required for the AI `launch_app` path).
  // We don't copy into /Applications — lsregister -f just records the location.
  run(
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
    ['-f', appRoot],
    { cwd: distDir },
  )

  console.log(`[macos-control-test-harness] Built + registered: ${appRoot}`)
}

main()
