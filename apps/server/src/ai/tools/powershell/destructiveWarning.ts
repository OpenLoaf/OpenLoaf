/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Detects potentially destructive PowerShell commands and returns an
 * informational warning string. Purely advisory: does NOT affect
 * permission logic or auto-approval.
 */

type DestructivePattern = {
  pattern: RegExp
  warning: string
}

const DESTRUCTIVE_PATTERNS: DestructivePattern[] = [
  // ── Remove-Item variants ───────────────────────────────────────────────
  // Anchored at statement start so `git rm --force` doesn't match.
  {
    pattern:
      /(?:^|[|;&\n({])\s*(Remove-Item|rm|del|rd|rmdir|ri)\b[^|;&\n}]*-Recurse\b[^|;&\n}]*-Force\b/i,
    warning: 'Note: may recursively force-remove files',
  },
  {
    pattern:
      /(?:^|[|;&\n({])\s*(Remove-Item|rm|del|rd|rmdir|ri)\b[^|;&\n}]*-Force\b[^|;&\n}]*-Recurse\b/i,
    warning: 'Note: may recursively force-remove files',
  },
  {
    pattern:
      /(?:^|[|;&\n({])\s*(Remove-Item|rm|del|rd|rmdir|ri)\b[^|;&\n}]*-Recurse\b/i,
    warning: 'Note: may recursively remove files',
  },
  {
    pattern:
      /(?:^|[|;&\n({])\s*(Remove-Item|rm|del|rd|rmdir|ri)\b[^|;&\n}]*-Force\b/i,
    warning: 'Note: may force-remove files',
  },

  // ── Clear-Content on wildcard/multiple files ──────────────────────────
  {
    pattern: /\bClear-Content\b[^|;&\n]*\*/i,
    warning: 'Note: may clear content of multiple files',
  },

  // ── Disk/volume operations ────────────────────────────────────────────
  {
    pattern: /\bFormat-Volume\b/i,
    warning: 'Note: may format a disk volume',
  },
  {
    pattern: /\bClear-Disk\b/i,
    warning: 'Note: may clear a disk',
  },

  // ── System power operations ───────────────────────────────────────────
  {
    pattern: /\bStop-Computer\b/i,
    warning: 'Note: will shut down the computer',
  },
  {
    pattern: /\bRestart-Computer\b/i,
    warning: 'Note: will restart the computer',
  },
  {
    pattern: /\bClear-RecycleBin\b/i,
    warning: 'Note: permanently deletes recycled files',
  },

  // ── Git destructive operations ────────────────────────────────────────
  {
    pattern: /\bgit\s+reset\s+--hard\b/i,
    warning: 'Note: may discard uncommitted changes',
  },
  {
    pattern: /\bgit\s+push\b[^|;&\n]*\s+(--force|--force-with-lease|-f)\b/i,
    warning: 'Note: may overwrite remote history',
  },
  {
    // git clean with -f but NOT --dry-run / -n
    pattern:
      /\bgit\s+clean\b(?![^|;&\n]*(?:-[a-zA-Z]*n|--dry-run))[^|;&\n]*-[a-zA-Z]*f/i,
    warning: 'Note: may permanently delete untracked files',
  },
  {
    pattern: /\bgit\s+stash\s+(drop|clear)\b/i,
    warning: 'Note: may permanently remove stashed changes',
  },

  // ── Database DDL ──────────────────────────────────────────────────────
  {
    pattern: /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA)\b/i,
    warning: 'Note: may drop or truncate database objects',
  },
]

/**
 * Check if a PowerShell command matches known destructive patterns.
 * Returns a human-readable warning string, or null if nothing matches.
 */
export function getDestructiveCommandWarning(command: string): string | null {
  if (!command) return null
  for (const { pattern, warning } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(command)) return warning
  }
  return null
}
