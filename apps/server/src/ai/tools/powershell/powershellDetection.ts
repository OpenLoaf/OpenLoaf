/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { execFileSync } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'

// ---------------------------------------------------------------------------
// which — locate an executable in PATH without external npm packages.
// ---------------------------------------------------------------------------

function whichSync(name: string): string | null {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which'
    const result = execFileSync(cmd, [name], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5_000,
    })
    const first = result.trim().split(/\r?\n/)[0]
    return first || null
  } catch {
    return null
  }
}

async function probePath(p: string): Promise<string | null> {
  try {
    return (await stat(p)).isFile() ? p : null
  } catch {
    return null
  }
}

/**
 * Attempts to find PowerShell on the system via PATH.
 * Prefers pwsh (PowerShell Core 7+), falls back to powershell (5.1).
 *
 * On Linux, if PATH resolves to a snap launcher (/snap/…) — directly or
 * via a symlink chain — probe known apt/rpm install locations instead:
 * the snap launcher can hang in subprocesses while snapd initializes
 * confinement, but the underlying binary at /opt/microsoft/powershell/7/pwsh
 * is reliable.
 */
export async function findPowerShell(): Promise<string | null> {
  const pwshPath = whichSync('pwsh')
  if (pwshPath) {
    // Snap launcher hangs in subprocesses. Prefer the direct binary.
    if (process.platform === 'linux') {
      const resolved = await realpath(pwshPath).catch(() => pwshPath)
      if (pwshPath.startsWith('/snap/') || resolved.startsWith('/snap/')) {
        const direct =
          (await probePath('/opt/microsoft/powershell/7/pwsh')) ??
          (await probePath('/usr/bin/pwsh'))
        if (direct) {
          const directResolved = await realpath(direct).catch(() => direct)
          if (
            !direct.startsWith('/snap/') &&
            !directResolved.startsWith('/snap/')
          ) {
            return direct
          }
        }
      }
    }
    return pwshPath
  }

  const powershellPath = whichSync('powershell')
  if (powershellPath) {
    return powershellPath
  }

  return null
}

// ---------------------------------------------------------------------------
// Cached singleton — avoids repeated which lookups.
// ---------------------------------------------------------------------------

let cachedPowerShellPath: Promise<string | null> | null = null

/**
 * Gets the cached PowerShell path. Returns a memoized promise that
 * resolves to the PowerShell executable path or null.
 */
export function getCachedPowerShellPath(): Promise<string | null> {
  if (!cachedPowerShellPath) {
    cachedPowerShellPath = findPowerShell()
  }
  return cachedPowerShellPath
}

export type PowerShellEdition = 'core' | 'desktop'

/**
 * Infers the PowerShell edition from the binary name without spawning.
 * - `pwsh` / `pwsh.exe` → 'core' (PowerShell 7+)
 * - `powershell` / `powershell.exe` → 'desktop' (Windows PowerShell 5.1)
 */
export async function getPowerShellEdition(): Promise<PowerShellEdition | null> {
  const p = await getCachedPowerShellPath()
  if (!p) return null
  const base = p
    .split(/[/\\]/)
    .pop()!
    .toLowerCase()
    .replace(/\.exe$/, '')
  return base === 'pwsh' ? 'core' : 'desktop'
}

/**
 * Resets the cached PowerShell path. Only for testing.
 */
export function resetPowerShellCache(): void {
  cachedPowerShellPath = null
}
