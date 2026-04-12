/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Exit-code semantics for PowerShell-invoked external executables.
 *
 * Some external commands use non-zero exit codes to convey information
 * rather than failure. Without interpretation, they surface as errors:
 *   - grep / rg / findstr : 1 = no match (not an error)
 *   - robocopy            : 0-7 = success (bitfield), 8+ = real error
 * Native PowerShell cmdlets (Select-String, Compare-Object, Test-Path)
 * do NOT need this — they signal failure via terminating errors, not
 * exit codes.
 */

type Interpreter = (exitCode: number) => string | null

/** grep / ripgrep / findstr: 1 = no match, 2+ = error. */
const grepLike: Interpreter = exitCode => {
  if (exitCode === 1) return 'No matches found (exit code 1, not an error)'
  if (exitCode >= 2) return null
  return null
}

/**
 * robocopy.exe exit code is a BITFIELD:
 *   0  = nothing to copy (already in sync)
 *   1  = files copied successfully
 *   2  = extra files/dirs detected
 *   4  = mismatched files/dirs
 *   0-7 = success (no real errors)
 *   8+ = at least one copy failure
 *   16 = serious error
 */
const robocopy: Interpreter = exitCode => {
  if (exitCode === 0) return 'Robocopy: no files copied (already in sync)'
  if (exitCode >= 1 && exitCode < 8) {
    if (exitCode & 1) {
      return 'Robocopy: files copied successfully (exit code 0-7 = success)'
    }
    return 'Robocopy: completed without errors (exit code 0-7 = success)'
  }
  return null
}

const INTERPRETERS: Map<string, Interpreter> = new Map([
  ['grep', grepLike],
  ['rg', grepLike],
  ['findstr', grepLike],
  ['robocopy', robocopy],
])

/**
 * Extract the base command name from a single pipeline segment:
 * strip leading call operators, path prefix, and `.exe` suffix.
 */
function extractBaseCommand(segment: string): string {
  const stripped = segment.trim().replace(/^[&.]\s+/, '')
  const firstToken = stripped.split(/\s+/)[0] || ''
  const unquoted = firstToken.replace(/^['"]|['"]$/g, '')
  const basename = unquoted.split(/[\\/]/).pop() || unquoted
  return basename.toLowerCase().replace(/\.exe$/, '')
}

/**
 * Interpret the exit code of a PowerShell command. Returns a human-
 * readable interpretation string to append to the tool result, or null
 * if no special semantics apply.
 *
 * The LAST pipeline segment determines the exit code in PowerShell, so
 * we only inspect that segment. Heuristic split on `;` and `|` is good
 * enough — false negatives just fall back to default error handling.
 */
export function interpretCommandResult(
  command: string,
  exitCode: number,
): string | null {
  if (!command) return null
  const segments = command.split(/[;|]/).filter(s => s.trim())
  const last = segments[segments.length - 1] || command
  const base = extractBaseCommand(last)
  const interp = INTERPRETERS.get(base)
  if (!interp) return null
  return interp(exitCode)
}
