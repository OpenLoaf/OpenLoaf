/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * Git hook-injection defense for PowerShell commands.
 *
 * Two attack vectors:
 *  1. Bare-repo attack: cwd contains `HEAD`, `objects/`, `refs/` without a
 *     valid `.git/HEAD`. Git then treats cwd as a bare repository and runs
 *     hooks from cwd. An attacker who can write those files then make git
 *     run gains arbitrary code execution.
 *  2. Git-internal write + git: a compound command first writes into
 *     `hooks/`, `.git/hooks/`, etc., then runs git — the git subcommand
 *     executes the freshly-planted hook.
 *
 * This guard complements the AST security analyzer. It is invoked AFTER
 * the analyzer flags the command as `safe` and surfaces as a forced
 * approval (`blocked: true`) so the user can review.
 */

import { existsSync } from 'node:fs'
import { basename, join, posix, resolve, sep } from 'node:path'

import { GIT_SAFETY_WRITE_CMDLETS } from './dangerousCmdlets'
import {
  type ParsedPowerShellCommand,
  getAllCommands,
} from './parser'
import { resolveToCanonical } from './readOnlyValidation'

// ---------------------------------------------------------------------------
// Path normalization — lossy canonicalization to match git-internal prefixes.
// ---------------------------------------------------------------------------

/**
 * PowerShell tokenizer also accepts Unicode dash chars as parameter
 * prefixes (en-dash, em-dash, horizontal bar), in addition to `-` and `/`.
 */
const PS_DASH_CHARS = new Set(['-', '\u2013', '\u2014', '\u2015'])

/**
 * Normalize a raw PS argument string to a canonical posix-form path
 * suitable for git-internal prefix matching.
 *
 * Steps:
 *   1. Strip colon-bound param form: `-Path:hooks/x` → `hooks/x`.
 *   2. Strip surrounding quotes.
 *   3. Strip PS backtick escapes (backticks quote the next char in PS).
 *   4. Strip PS provider prefix (`FileSystem::`, possibly fully qualified).
 *   5. Strip drive-relative prefix `C:` (NOT `C:\` which is absolute).
 *   6. Convert backslashes to forward slashes.
 *   7. NTFS per-component trailing-space / trailing-dot stripping.
 *   8. posix.normalize (resolves `..`, `.`, `//`).
 *   9. Drop leading `./`.
 *  10. Lowercase (NTFS/Windows is case-insensitive).
 */
function normalizeGitPathArg(arg: string): string {
  let s = arg
  if (s.length > 0 && (PS_DASH_CHARS.has(s[0]!) || s[0] === '/')) {
    const c = s.indexOf(':', 1)
    if (c > 0) s = s.slice(c + 1)
  }
  s = s.replace(/^['"]|['"]$/g, '')
  s = s.replace(/`/g, '')
  s = s.replace(/^(?:[A-Za-z0-9_.]+\\){0,3}FileSystem::/i, '')
  // Drive-relative `C:foo` (no separator) — strip. `C:\foo` stays absolute.
  s = s.replace(/^[A-Za-z]:(?![/\\])/, '')
  s = s.replace(/\\/g, '/')
  s = s
    .split('/')
    .map(component => {
      if (component === '') return component
      let prev = ''
      let cur = component
      do {
        prev = cur
        cur = cur.replace(/ +$/, '')
        if (cur === '.' || cur === '..') return cur
        cur = cur.replace(/\.+$/, '')
      } while (cur !== prev)
      return cur || '.'
    })
    .join('/')
  s = posix.normalize(s)
  if (s.startsWith('./')) s = s.slice(2)
  return s.toLowerCase()
}

/**
 * If a normalized path starts with `../<cwd-basename>/`, re-enter cwd:
 * `posix.normalize` cannot resolve `..` without cwd context, but at
 * runtime PowerShell resolves it against cwd and lands back inside.
 */
function resolveCwdReentry(normalized: string, cwd: string): string {
  if (!normalized.startsWith('../')) return normalized
  const cwdBase = basename(cwd).toLowerCase()
  if (!cwdBase) return normalized
  const prefix = '../' + cwdBase + '/'
  let s = normalized
  while (s.startsWith(prefix)) s = s.slice(prefix.length)
  if (s === '../' + cwdBase) return '.'
  return s
}

/**
 * Resolve a path that escapes cwd (leading `../` or absolute) and check
 * whether it lands back INSIDE cwd. If so, return the cwd-relative form
 * for prefix matching; otherwise null.
 */
function resolveEscapingPathToCwdRelative(
  n: string,
  cwd: string,
): string | null {
  const abs = resolve(cwd, n)
  const cwdWithSep = cwd.endsWith(sep) ? cwd : cwd + sep
  const absLower = abs.toLowerCase()
  const cwdLower = cwd.toLowerCase()
  const cwdWithSepLower = cwdWithSep.toLowerCase()
  if (absLower === cwdLower) return '.'
  if (!absLower.startsWith(cwdWithSepLower)) return null
  return abs.slice(cwdWithSep.length).replace(/\\/g, '/').toLowerCase()
}

const GIT_INTERNAL_PREFIXES = ['head', 'objects', 'refs', 'hooks', 'config']

function matchesGitInternalPrefix(n: string): boolean {
  if (n === 'head' || n === '.git' || n === 'config') return true
  if (n.startsWith('.git/') || /^git~\d+($|\/)/.test(n)) return true
  for (const p of GIT_INTERNAL_PREFIXES) {
    if (p === 'head') continue
    if (n === p || n.startsWith(p + '/')) return true
  }
  return false
}

/**
 * True if a raw PS arg text resolves to a git-internal path in cwd.
 */
function isGitInternalPath(arg: string, cwd: string): boolean {
  const n = resolveCwdReentry(normalizeGitPathArg(arg), cwd)
  if (matchesGitInternalPrefix(n)) return true
  if (n.startsWith('../') || n.startsWith('/') || /^[a-z]:/.test(n)) {
    const rel = resolveEscapingPathToCwdRelative(n, cwd)
    if (rel !== null && matchesGitInternalPrefix(rel)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Command inspection
// ---------------------------------------------------------------------------

/** Pull the canonical command name (lowercased, alias-resolved). */
function canonicalName(name: string): string {
  return resolveToCanonical(name).toLowerCase()
}

/** True if any command in the pipeline is `git` / `git.exe`. */
function hasGitSubCommand(parsed: ParsedPowerShellCommand): boolean {
  for (const cmd of getAllCommands(parsed)) {
    const base = cmd.name.split(/[\\/]/).pop() || cmd.name
    const lower = base.toLowerCase().replace(/\.exe$/, '')
    if (lower === 'git') return true
  }
  return false
}

/**
 * True if any write-capable command in the parsed AST targets a git-
 * internal path — either via args or file redirection.
 */
function hasGitInternalWrite(
  parsed: ParsedPowerShellCommand,
  cwd: string,
): boolean {
  for (const cmd of getAllCommands(parsed)) {
    // Output redirections on any command (e.g. `echo hook > hooks/pre-commit`)
    if (cmd.redirections) {
      for (const r of cmd.redirections) {
        if (isGitInternalPath(r.target, cwd)) return true
      }
    }
    const canonical = canonicalName(cmd.name)
    if (!GIT_SAFETY_WRITE_CMDLETS.has(canonical)) continue
    // Args may be comma-separated path lists: `-Path a,b,c`.
    for (const arg of cmd.args) {
      if (!arg || arg.startsWith('-')) continue
      for (const piece of arg.split(',')) {
        if (isGitInternalPath(piece, cwd)) return true
      }
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Bare-repo detection
// ---------------------------------------------------------------------------

/**
 * Bare-repo attack: cwd contains HEAD + objects/ + refs/ but no
 * .git/HEAD. Git then treats cwd itself as a bare repository.
 */
function cwdLooksLikeBareRepo(cwd: string): boolean {
  try {
    const hasHead = existsSync(join(cwd, 'HEAD'))
    const hasObjects = existsSync(join(cwd, 'objects'))
    const hasRefs = existsSync(join(cwd, 'refs'))
    if (!(hasHead && hasObjects && hasRefs)) return false
    // Exclude the legitimate case: there is a real .git/HEAD alongside.
    if (existsSync(join(cwd, '.git', 'HEAD'))) return false
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type GitSafetyResult = {
  blocked: boolean
  reason?: string
}

/**
 * Check a parsed PowerShell command for git hook-injection attacks.
 *
 * Only engages when the command invokes git. Two checks:
 *   1. Bare-repo indicators in cwd (HEAD + objects/ + refs/ w/o .git/HEAD).
 *   2. Compound command writes to a git-internal path then runs git.
 */
export function checkGitSafety(
  _command: string,
  cwd: string,
  parsed: ParsedPowerShellCommand,
): GitSafetyResult {
  if (!parsed || !parsed.valid) return { blocked: false }
  if (!hasGitSubCommand(parsed)) return { blocked: false }

  if (cwdLooksLikeBareRepo(cwd)) {
    return {
      blocked: true,
      reason:
        'Git command in a directory with bare-repository indicators ' +
        '(HEAD, objects/, refs/ in cwd without .git/HEAD). ' +
        'Git may execute hooks from cwd.',
    }
  }

  if (hasGitInternalWrite(parsed, cwd)) {
    return {
      blocked: true,
      reason:
        'Command writes to a git-internal path (HEAD, objects/, refs/, ' +
        'hooks/, .git/) and runs git. This could plant a malicious hook ' +
        'that git then executes.',
    }
  }

  return { blocked: false }
}
