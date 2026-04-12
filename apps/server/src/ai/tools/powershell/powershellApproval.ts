/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * PowerShell command approval entry point.
 *
 * Completely independent of shell-quote: approval decisions are 100% driven
 * by the PowerShell AST parser. This mirrors the Bash-side commandApproval.ts
 * but uses native PowerShell parsing rather than shell tokenization.
 */

import path from 'node:path'

import {
  deriveSecurityFlags,
  getAllCommandNames,
  getAllCommands,
  parsePowerShellCommand,
} from './parser'
import { powershellCommandIsSafe } from './powershellSecurity'
import { resolveToCanonical } from './readOnlyValidation'
import { checkGitSafety } from './gitSafety'

// ---------------------------------------------------------------------------
// Safe cmdlet allowlist — PowerShell equivalent of Bash SAFE_COMMANDS_UNIX.
// All entries are lowercase canonical cmdlet names.
// ---------------------------------------------------------------------------

const SAFE_CMDLETS = new Set([
  // ── Filesystem (read-only) ───────────────────────────────────────────────
  'get-childitem',
  'get-content',
  'get-item',
  'get-itemproperty',
  'get-itempropertyvalue',
  'test-path',
  'resolve-path',
  'get-filehash',
  'get-acl',
  'format-hex',
  'convert-path',
  'join-path',
  'split-path',
  // ── Navigation (just changes working directory) ──────────────────────────
  'set-location',
  'push-location',
  'pop-location',
  'get-location',
  // ── Text search & processing ─────────────────────────────────────────────
  'select-string',
  'measure-object',
  'where-object',
  'sort-object',
  'group-object',
  'select-object',
  'compare-object',
  'get-unique',
  'join-string',
  // ── Output formatting (safe with literal args) ───────────────────────────
  'write-output',
  'write-host',
  'out-null',
  'out-default',
  'out-host',
  'out-string',
  'format-table',
  'format-list',
  'format-wide',
  'format-custom',
  // ── Data conversion (pure transforms) ────────────────────────────────────
  'convertto-json',
  'convertfrom-json',
  'convertto-csv',
  'convertfrom-csv',
  'convertto-xml',
  'convertto-html',
  // ── Object inspection ────────────────────────────────────────────────────
  'get-member',
  // ── Process & service (read-only) ────────────────────────────────────────
  'get-process',
  'get-service',
  // ── System info ──────────────────────────────────────────────────────────
  'get-help',
  'get-command',
  'get-date',
  'get-host',
  'get-computerinfo',
  'get-psprovider',
  'get-psdrive',
  'get-module',
  'get-alias',
  'get-history',
  'get-culture',
  'get-uiculture',
  'get-timezone',
  'get-uptime',
  'get-hotfix',
  'get-random',
  'start-sleep',
])

/**
 * Safe external executables — typical development tooling. Mirrors the
 * Bash SAFE_COMMANDS_UNIX set but only the tools that are relevant and
 * safe to run from PowerShell without user approval.
 */
const SAFE_EXTERNAL_COMMANDS = new Set([
  // Version control
  'git',
  'git.exe',
  // JavaScript / TypeScript
  'node',
  'node.exe',
  'npm',
  'npm.cmd',
  'pnpm',
  'pnpm.cmd',
  'yarn',
  'yarn.cmd',
  'npx',
  'npx.cmd',
  'bun',
  'bun.exe',
  'deno',
  'deno.exe',
  // Python
  'python',
  'python.exe',
  'python3',
  'python3.exe',
  'pip',
  'pip.exe',
  'pip3',
  'pip3.exe',
  'uv',
  'uv.exe',
  // Rust / Go / .NET
  'cargo',
  'cargo.exe',
  'rustc',
  'rustc.exe',
  'go',
  'go.exe',
  'dotnet',
  'dotnet.exe',
  // Other safe dev tools
  'make',
  'make.exe',
  'tsc',
  'tsc.cmd',
  'playwright',
  'playwright.cmd',
  // Read-only system utilities (PS Core native)
  'hostname',
  'ipconfig',
  'findstr',
  'whoami',
])

/**
 * Sandbox-only cmdlets: allowed without approval only when all referenced
 * paths stay inside the sandbox directories.
 */
const SANDBOX_ONLY_CMDLETS = new Set([
  'remove-item',
  'move-item',
  'rename-item',
  'new-item',
  'set-content',
  'add-content',
  'out-file',
  'copy-item',
  'clear-content',
])

// ---------------------------------------------------------------------------
// Command name classification
// ---------------------------------------------------------------------------

/**
 * Normalize an external command name: take the basename, lowercase it.
 * Unlike Bash we keep the .exe/.cmd suffix because PowerShell command
 * resolution treats them as distinct entries.
 */
function normalizeExternalName(name: string): string {
  if (!name) return ''
  const cleaned = name.replace(/^['"]|['"]$/g, '')
  const base = path.basename(cleaned)
  return base.toLowerCase()
}

/**
 * Check if a command (by AST name) is in the safe cmdlet allowlist or
 * the safe external executable allowlist.
 */
function isSafeCommand(rawName: string): boolean {
  if (!rawName) return false
  const canonical = resolveToCanonical(rawName)
  if (SAFE_CMDLETS.has(canonical)) return true
  const normalized = normalizeExternalName(rawName)
  if (SAFE_EXTERNAL_COMMANDS.has(normalized)) return true
  // Strip .exe/.cmd/.ps1 suffix and re-check
  const stripped = normalized.replace(/\.(exe|cmd|bat|ps1)$/i, '')
  if (SAFE_EXTERNAL_COMMANDS.has(stripped)) return true
  return false
}

function isSandboxOnlyCommand(rawName: string): boolean {
  const canonical = resolveToCanonical(rawName)
  return SANDBOX_ONLY_CMDLETS.has(canonical)
}

// ---------------------------------------------------------------------------
// Sandbox path checking
// ---------------------------------------------------------------------------

function isPathInside(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  )
}

/**
 * System path prefixes — hard references to system tooling that should
 * not count as "user paths" when evaluating sandbox containment.
 */
const SYSTEM_PATH_PREFIXES = [
  '/bin/',
  '/sbin/',
  '/usr/',
  '/opt/',
  '/etc/',
  '/dev/null',
  '/dev/stdin',
  '/dev/stdout',
  '/dev/stderr',
  '/tmp/',
  '/System/',
  '/Library/',
  '/var/',
  // Windows system roots
  'c:\\windows\\',
  'c:\\program files\\',
  'c:\\program files (x86)\\',
]

function isSystemPath(absPath: string): boolean {
  const lower = absPath.toLowerCase()
  return SYSTEM_PATH_PREFIXES.some(prefix => {
    const p = prefix.toLowerCase()
    return lower === p.replace(/[/\\]$/, '') || lower.startsWith(p)
  })
}

/**
 * Expand a path token: ~ → HOME, resolve to absolute. Returns undefined
 * if the token doesn't look like a path.
 */
function expandPathToken(token: string): string | undefined {
  if (!token) return undefined
  const cleaned = token.replace(/^['"]|['"]$/g, '')
  if (!cleaned) return undefined
  const home = process.env.HOME || process.env.USERPROFILE || ''
  // ~ expansion
  const expanded = cleaned.startsWith('~')
    ? home + cleaned.slice(1)
    : cleaned
  // Must look like an absolute path to count for sandbox check
  if (!path.isAbsolute(expanded)) return undefined
  return path.resolve(expanded)
}

/**
 * Check whether every absolute-looking path argument in the parsed command
 * stays inside the sandbox directories. Paths outside the sandbox disqualify;
 * commands with no absolute paths return false (let the caller decide).
 */
function commandStaysInSandbox(
  parsed: import('./parser').ParsedPowerShellCommand,
  sandboxDirs: string[],
): boolean {
  if (sandboxDirs.length === 0) return false
  const resolvedSandboxes = sandboxDirs
    .filter(d => path.isAbsolute(d))
    .map(d => path.resolve(d))
  if (resolvedSandboxes.length === 0) return false

  let sawAbsolutePath = false
  for (const cmd of getAllCommands(parsed)) {
    for (const arg of cmd.args) {
      if (arg.startsWith('-')) continue // skip parameter names
      const abs = expandPathToken(arg)
      if (!abs) continue
      sawAbsolutePath = true
      if (isSystemPath(abs)) continue
      const insideAny = resolvedSandboxes.some(sb => isPathInside(sb, abs))
      if (!insideAny) return false
    }
  }
  return sawAbsolutePath
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type PowerShellApprovalOptions = {
  /**
   * Sandbox directory allowlist (absolute paths). If all absolute paths
   * referenced in the command fall inside these directories, sandbox-only
   * cmdlets (Remove-Item, Move-Item, etc.) are exempt from approval.
   */
  sandboxDirs?: string[]
}

/**
 * Decide whether a PowerShell command requires user approval.
 *
 * Returns `true` if approval is required, `false` if the command may run
 * automatically. All decisions are driven by the PowerShell AST parser;
 * no shell-quote tokenization is involved.
 */
export async function needsApprovalForPowerShell(
  command: string,
  options?: PowerShellApprovalOptions,
): Promise<boolean> {
  const trimmed = command.trim()
  if (!trimmed) return true

  // 1. Parse the command. Parse failures → conservative approval.
  const parsed = await parsePowerShellCommand(trimmed)
  if (!parsed.valid) return true

  // 2. AST security analysis. Any ask/deny → require approval.
  const safety = powershellCommandIsSafe(parsed)
  if (safety !== 'safe') return true

  // 2b. Git hook-injection defense: check for bare-repo indicators in cwd
  //     or compound git-internal writes followed by a git invocation. The
  //     AST analyzer cannot see the filesystem, so this is a separate pass.
  const gitSafety = checkGitSafety(trimmed, process.cwd(), parsed)
  if (gitSafety.blocked) return true

  // 3. Additional security flag checks. Sub-expressions, splatting, and
  //    stop-parsing are handled in powershellCommandIsSafe but we double-
  //    check them here as a defensive fallback — these flags indicate the
  //    command contains dynamic content we cannot statically validate.
  const flags = deriveSecurityFlags(parsed)
  if (
    flags.hasSubExpressions ||
    flags.hasScriptBlocks ||
    flags.hasSplatting ||
    flags.hasExpandableStrings ||
    flags.hasMemberInvocations ||
    flags.hasStopParsing
  ) {
    return true
  }

  // 4. Collect all canonical command names referenced in the AST.
  const names = getAllCommandNames(parsed)
  if (names.length === 0) return true

  // 5. Check each command against the safe allowlists.
  const sandboxDirs = options?.sandboxDirs ?? []
  let hasSandboxOnly = false
  for (const rawName of names) {
    if (isSafeCommand(rawName)) continue
    if (isSandboxOnlyCommand(rawName)) {
      hasSandboxOnly = true
      continue
    }
    // Unknown / unsafe command → require approval.
    return true
  }

  // 6. If any sandbox-only cmdlet is present, confirm that every absolute
  //    path argument stays inside the sandbox.
  if (hasSandboxOnly) {
    if (!commandStaysInSandbox(parsed, sandboxDirs)) return true
  }

  // 7. All commands on the safe allowlist (or exempt via sandbox).
  return false
}
