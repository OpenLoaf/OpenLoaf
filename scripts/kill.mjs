#!/usr/bin/env node

/**
 * Kill stale OpenLoaf dev processes belonging to the current project.
 *
 * Matches processes by the repo root path in their command line, so it won't
 * affect other projects or intentional processes.
 *
 * Usage:
 *   pnpm kill                    # kill all stale dev processes
 *   node scripts/kill.mjs        # same
 *
 * Also exported as a function for use by dev.mjs / desktop.mjs / devServices.ts.
 */

import { execSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Find monorepo root from a starting directory.
 */
function findRepoRoot(startDir) {
  let current = startDir
  for (let i = 0; i < 12; i++) {
    if (
      existsSync(path.join(current, 'pnpm-workspace.yaml')) &&
      existsSync(path.join(current, 'turbo.json'))
    ) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

/**
 * Kill all stale dev processes (next-server, node server, turbo, webpack-loaders,
 * postcss workers, electron-forge) that belong to the given project root.
 *
 * @param {object} [options]
 * @param {string} [options.repoRoot] - Project root path to match against. Auto-detected if omitted.
 * @param {(msg: string) => void} [options.log] - Logger function. Defaults to console.log.
 * @returns {number} Number of processes killed.
 */
export function killStaleProcesses(options = {}) {
  const repoRoot = options.repoRoot || findRepoRoot(__dirname)
  const log = options.log || console.log

  if (!repoRoot) {
    log('[kill] Could not find monorepo root, skipping.')
    return 0
  }

  let killed = 0

  if (process.platform === 'win32') {
    killed = killStaleWindows(repoRoot, log)
  } else {
    killed = killStaleUnix(repoRoot, log)
  }

  if (killed > 0) {
    log(`[kill] Cleaned up ${killed} stale process(es).`)
  }
  return killed
}

function killStaleWindows(repoRoot, log) {
  let killed = 0
  const safeRoot = repoRoot.replace(/\\/g, '\\\\').replace(/'/g, "''")
  const script = [
    `$procs = Get-CimInstance Win32_Process | Where-Object {`,
    `  $_.CommandLine -and ($_.CommandLine -like '*${safeRoot}\\*' -or $_.CommandLine -like '*${safeRoot}/*') -and`,
    `  ($_.CommandLine -match 'next dev' -or $_.CommandLine -match 'next-server' -or`,
    `   $_.CommandLine -match 'server[/\\\\]src[/\\\\]index' -or`,
    `   $_.CommandLine -match 'turbo.*dev' -or $_.CommandLine -match 'webpack-loaders\\.js' -or`,
    `   $_.CommandLine -match 'postcss\\.js')`,
    `}`,
    `if ($procs) { $procs | ForEach-Object {`,
    `  $name = $_.Name; $cmd = $_.CommandLine.Substring(0, [Math]::Min(80, $_.CommandLine.Length))`,
    `  Write-Output "$($_.ProcessId)|$name|$cmd"`,
    `  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue`,
    `} }`,
  ].join(' ')

  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', script], {
    encoding: 'utf-8',
    timeout: 5000,
  })

  if (result.stdout?.trim()) {
    for (const line of result.stdout.trim().split(/\r?\n/)) {
      const [pid, name, cmd] = line.trim().split('|')
      const display = name && cmd ? `${name} (${cmd.trim()})` : pid
      log(`[kill] Killing stale process PID ${pid} (${display})`)
      killed++
    }
  }
  return killed
}

function killStaleUnix(repoRoot, log) {
  let killed = 0
  const selfPid = process.pid
  const parentPid = process.ppid

  // Specific patterns to match dev server processes — avoid broad terms like
  // "next" which can match Electron internal processes referencing .next/ paths.
  const patterns = [
    'next dev',
    'next-server',
    'server/src/index',
    'turbo.*dev',
    'webpack-loaders\\.js',
    'postcss\\.js',
  ]
  const grepPattern = patterns.join('|')

  try {
    const output = execSync(
      `ps -eo pid,args | grep -E '(${grepPattern})' | grep '${repoRoot}/' | grep -v grep`,
      { encoding: 'utf-8', timeout: 5000 },
    ).trim()

    if (!output) return 0

    for (const line of output.split(/\n/)) {
      const parts = line.trim().split(/\s+/)
      const pid = Number(parts[0])
      if (!pid || pid === selfPid || pid === parentPid) continue
      const cmdline = parts.slice(1).join(' ')

      log(`[kill] Killing stale process PID ${pid}: ${cmdline}`)
      try {
        process.kill(pid, 'SIGTERM')
        killed++
      } catch {
        // Process may have already exited
      }
    }
  } catch {
    // grep returns non-zero when no match — normal
  }

  return killed
}

// ── Run directly ─────────────────────────────────────────────────────
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
if (isMain) {
  killStaleProcesses()
}
