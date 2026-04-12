/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { getCachedPowerShellPath } from './powershellDetection'

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

/**
 * Base64-encode a string as UTF-16LE for PowerShell's -EncodedCommand.
 * The output is [A-Za-z0-9+/=] only — survives any shell-quoting layer.
 */
export function encodePowerShellCommand(psCommand: string): string {
  return Buffer.from(psCommand, 'utf16le').toString('base64')
}

// ---------------------------------------------------------------------------
// Command construction
// ---------------------------------------------------------------------------

export interface BuildArgsOptions {
  /** Use -EncodedCommand (base64 UTF-16LE) instead of -Command */
  encoded?: boolean
}

/**
 * Build PowerShell invocation arguments.
 *
 * Non-encoded mode: `['-NoProfile', '-NonInteractive', '-Command', cmd]`
 * Encoded mode:     `['-NoProfile', '-NonInteractive', '-EncodedCommand', base64]`
 */
export function buildPowerShellArgs(
  command: string,
  options?: BuildArgsOptions,
): string[] {
  if (options?.encoded) {
    return [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      encodePowerShellCommand(command),
    ]
  }
  return ['-NoProfile', '-NonInteractive', '-Command', command]
}

// ---------------------------------------------------------------------------
// CWD persistence
// ---------------------------------------------------------------------------

/**
 * Wraps a PowerShell command with exit-code capture + CWD tracking.
 *
 * Exit-code capture: prefer $LASTEXITCODE when a native exe ran.
 * On PS 5.1, a native command that writes to stderr while the stream is
 * PS-redirected sets $? = $false even when the exe returned exit 0 —
 * $LASTEXITCODE avoids this false positive.
 *
 * @param command - The raw user command
 * @param id - Unique identifier for the CWD tracking file
 * @returns Object containing the wrapped command and the CWD file path
 */
export function wrapWithCwdTracking(
  command: string,
  id: number | string,
): { commandString: string; cwdFilePath: string } {
  const cwdFilePath = join(tmpdir(), `openloaf-pwd-ps-${id}`)
  const escapedCwdFilePath = cwdFilePath.replace(/'/g, "''")
  const cwdTracking = [
    '',
    "; $_ec = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE }",
    ' elseif ($?) { 0 } else { 1 }',
    `; (Get-Location).Path | Out-File -FilePath '${escapedCwdFilePath}'`,
    ' -Encoding utf8 -NoNewline',
    '; exit $_ec',
  ].join('')
  return {
    commandString: command + cwdTracking,
    cwdFilePath,
  }
}

// ---------------------------------------------------------------------------
// Full spawn helper
// ---------------------------------------------------------------------------

/**
 * Resolves the PowerShell binary path and builds spawn arguments for a
 * foreground command (with CWD tracking).
 *
 * @returns null if PowerShell is not available on this system
 */
export async function buildSpawnConfig(
  command: string,
  id: number | string,
): Promise<{
  binPath: string
  args: string[]
  cwdFilePath: string
} | null> {
  const binPath = await getCachedPowerShellPath()
  if (!binPath) return null

  const { commandString, cwdFilePath } = wrapWithCwdTracking(command, id)
  const args = buildPowerShellArgs(commandString)

  return { binPath, args, cwdFilePath }
}
