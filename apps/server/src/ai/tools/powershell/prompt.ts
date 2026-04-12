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
 * Dynamic PowerShell usage guide injected into agent system prompt on Windows.
 *
 * Design principle: minimal delta list (<= 5 items). We rely on the model to
 * self-correct via tool failure feedback rather than front-loading a tutorial.
 */

import type { PowerShellEdition } from './powershellDetection'

/**
 * Build a minimal PowerShell usage guide. Returns a short section suitable
 * for appending to an existing Bash-oriented system prompt.
 *
 * @param edition PowerShell edition detected on the host, or null if unknown.
 *                'desktop' (5.1) gets an extra line about missing features.
 */
export function buildPowerShellGuide(
  edition: PowerShellEdition | null,
): string {
  const lines: string[] = [
    '## PowerShell usage (Windows)',
    'The Bash tool is unavailable on this platform. Use the PowerShell tool and follow these rules:',
    '1. Prefer PowerShell cmdlets over Unix equivalents: `Get-ChildItem` (ls), `Get-Content` (cat), `Select-String` (grep), `Remove-Item` (rm), `Copy-Item` (cp).',
    '2. No `&&` / `||` chaining on Windows PowerShell 5.1 — use `; if ($?) { ... }` or `-and` / `-or` instead. (PowerShell 7+ does support `&&` / `||`.)',
    '3. Paths accept both `/` and `\\`, but any path with spaces or CJK characters MUST be wrapped in `"..."` quotes.',
    '4. Redirection: `>` overwrite, `>>` append, `2>&1` merges stderr into stdout.',
    '5. String quoting: single quotes are literal, double quotes interpolate `$variable`.',
  ]

  if (edition === 'desktop') {
    lines.push(
      'Note: this host runs Windows PowerShell 5.1 — the ternary `? :` operator and null-coalescing `??` are NOT supported; use `if` statements.',
    )
  }

  return lines.join('\n')
}

/**
 * Post-hoc correction hint: inspect PowerShell stderr after a failed command
 * and return a targeted suggestion, or null if no pattern matches.
 *
 * Keep the rule set tiny (3-4 rules). Over-hinting trains the model to ignore.
 */
export function buildPowerShellFailureHint(stderr: string): string | null {
  if (!stderr) return null
  const text = stderr.toLowerCase()

  // PowerShell 5.1 rejects `&&` / `||` with a parser error mentioning the token.
  if (
    (text.includes("token '&&'") || text.includes("token '||'")) ||
    text.includes("the token '&&' is not a valid statement separator") ||
    text.includes("the token '||' is not a valid statement separator")
  ) {
    return '[HINT] Windows PowerShell 5.1 does not support `&&` / `||`. Use `; if ($?) { ... }` or `-and` / `-or`.'
  }

  // "is not recognized as the name of a cmdlet" — typo or Unix command assumed.
  if (text.includes('is not recognized as the name of a cmdlet')) {
    return '[HINT] Command not found. Check the cmdlet name (e.g. use `Get-ChildItem` instead of `ls`, `Select-String` instead of `grep`).'
  }

  // Access denied — often requires elevation.
  if (text.includes('access is denied') || text.includes('access to the path')) {
    return '[HINT] Access denied. The path may require an elevated (Administrator) PowerShell, or the file is locked by another process.'
  }

  // Unquoted path with spaces frequently produces "cannot find path" errors.
  if (
    text.includes('cannot find path') ||
    text.includes('could not find a part of the path')
  ) {
    return '[HINT] Path not found. If the path contains spaces or CJK characters, wrap it in double quotes: `"C:\\Users\\张三\\file.txt"`.'
  }

  return null
}
