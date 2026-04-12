/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 *
 * PowerShell-specific security analysis for command validation.
 *
 * Detects dangerous patterns: code injection, download cradles, privilege
 * escalation, dynamic command names, COM objects, module loading, etc.
 *
 * All checks are AST-based. If parsing failed (valid=false), none of the
 * individual checks match and powershellCommandIsSafe returns 'ask'.
 */

import {
  ALIAS_HIJACK_CMDLETS,
  DANGEROUS_SCRIPT_BLOCK_CMDLETS,
  FILEPATH_EXECUTION_CMDLETS,
  MODULE_LOADING_CMDLETS,
  NETWORK_CMDLETS,
  WMI_CIM_CMDLETS,
} from './dangerousCmdlets'
import type {
  ParsedCommandElement,
  ParsedPowerShellCommand,
} from './parser'
import {
  deriveSecurityFlags,
  getAllCommands,
} from './parser'
import { COMMON_ALIASES } from './readOnlyValidation'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PowerShellSafetyResult = 'safe' | 'ask' | 'deny'

export type PowerShellSecurityResult = {
  behavior: 'safe' | 'ask' | 'deny'
  message?: string
}

// ---------------------------------------------------------------------------
// PowerShell executable detection
// ---------------------------------------------------------------------------

const POWERSHELL_EXECUTABLES = new Set([
  'pwsh',
  'pwsh.exe',
  'powershell',
  'powershell.exe',
])

/**
 * Checks if a command name refers to a PowerShell executable,
 * handling full paths like /usr/bin/pwsh or C:\Windows\...\powershell.exe.
 */
function isPowerShellExecutable(name: string): boolean {
  const lower = name.toLowerCase()
  if (POWERSHELL_EXECUTABLES.has(lower)) return true
  const lastSep = Math.max(lower.lastIndexOf('/'), lower.lastIndexOf('\\'))
  if (lastSep >= 0) {
    return POWERSHELL_EXECUTABLES.has(lower.slice(lastSep + 1))
  }
  return false
}

// ---------------------------------------------------------------------------
// Helper: resolve command name through aliases
// ---------------------------------------------------------------------------

function resolveCommandName(name: string): string {
  const lower = name.toLowerCase()
  const mapped = COMMON_ALIASES[lower]
  return mapped ? mapped.toLowerCase() : lower
}

// ---------------------------------------------------------------------------
// Helper: check if a command has a parameter matching an abbreviation.
// PowerShell allows unique prefix abbreviation of parameter names.
// e.g. -Verb can be matched by -v, -ve, -ver, -verb.
// ---------------------------------------------------------------------------

function commandHasArgAbbreviation(
  cmd: ParsedCommandElement,
  fullParam: string,
  minPrefix: string,
): boolean {
  const fullLower = fullParam.toLowerCase()
  const minLower = minPrefix.toLowerCase()
  for (const arg of cmd.args) {
    const argLower = arg.toLowerCase()
    // Handle colon-bound form: -Param:Value
    const colonIdx = argLower.indexOf(':')
    const paramPart = colonIdx >= 0 ? argLower.slice(0, colonIdx) : argLower
    if (!paramPart.startsWith('-')) continue
    const stripped = paramPart.slice(1)
    const minStripped = minLower.startsWith('-') ? minLower.slice(1) : minLower
    const fullStripped = fullLower.startsWith('-') ? fullLower.slice(1) : fullLower
    // Must be at least as long as minPrefix and a prefix of fullParam
    if (
      stripped.length >= minStripped.length &&
      fullStripped.startsWith(stripped)
    ) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Helper: check if any command in the AST has a given canonical name
// ---------------------------------------------------------------------------

function hasCommandNamed(
  parsed: ParsedPowerShellCommand,
  canonicalName: string,
): boolean {
  const target = canonicalName.toLowerCase()
  for (const cmd of getAllCommands(parsed)) {
    if (resolveCommandName(cmd.name) === target) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Individual security checks
// ---------------------------------------------------------------------------

/**
 * Invoke-Expression / iex — equivalent to eval().
 */
function checkInvokeExpression(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  if (hasCommandNamed(parsed, 'invoke-expression')) {
    return {
      behavior: 'ask',
      message:
        'Command uses Invoke-Expression which can execute arbitrary code',
    }
  }
  return { behavior: 'safe' }
}

/**
 * Dynamic command names: & $variable, & (expression), etc.
 * Legitimate command names are always StringConstant in element position 0.
 */
function checkDynamicCommandName(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    if (cmd.elementType !== 'CommandAst') continue
    const nameElementType = cmd.elementTypes?.[0]
    if (nameElementType !== undefined && nameElementType !== 'StringConstant') {
      return {
        behavior: 'ask',
        message:
          'Command name is a dynamic expression which cannot be statically validated',
      }
    }
  }
  return { behavior: 'safe' }
}

/**
 * Download cradle patterns: IWR | IEX, IRM | IEX, etc.
 */
const DOWNLOADER_NAMES = new Set([
  'invoke-webrequest',
  'iwr',
  'invoke-restmethod',
  'irm',
  'new-object',
  'start-bitstransfer',
])

function isDownloader(name: string): boolean {
  return DOWNLOADER_NAMES.has(name.toLowerCase())
}

function isIex(name: string): boolean {
  const lower = name.toLowerCase()
  return lower === 'invoke-expression' || lower === 'iex'
}

function checkDownloadCradles(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  // Per-statement: piped cradle (IWR ... | IEX)
  for (const statement of parsed.statements) {
    const cmds = statement.commands
    if (cmds.length < 2) continue
    const hasDownloader = cmds.some(cmd => isDownloader(cmd.name))
    const hasIexCmd = cmds.some(cmd => isIex(cmd.name))
    if (hasDownloader && hasIexCmd) {
      return {
        behavior: 'deny',
        message: 'Command downloads and executes remote code (download cradle)',
      }
    }
  }

  // Cross-statement: split cradle ($r = IWR ...; IEX $r.Content)
  const all = getAllCommands(parsed)
  if (all.some(c => isDownloader(c.name)) && all.some(c => isIex(c.name))) {
    return {
      behavior: 'deny',
      message: 'Command downloads and executes remote code (download cradle)',
    }
  }

  return { behavior: 'safe' }
}

/**
 * Standalone download utilities — LOLBAS tools:
 * Start-BitsTransfer, certutil -urlcache, bitsadmin /transfer.
 */
function checkDownloadUtilities(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    const lower = cmd.name.toLowerCase()
    if (lower === 'start-bitstransfer') {
      return {
        behavior: 'ask',
        message: 'Command downloads files via BITS transfer',
      }
    }
    if (lower === 'certutil' || lower === 'certutil.exe') {
      const hasUrlcache = cmd.args.some(a => {
        const la = a.toLowerCase()
        return la === '-urlcache' || la === '/urlcache'
      })
      if (hasUrlcache) {
        return {
          behavior: 'ask',
          message: 'Command uses certutil to download from a URL',
        }
      }
    }
    if (lower === 'bitsadmin' || lower === 'bitsadmin.exe') {
      if (cmd.args.some(a => a.toLowerCase() === '/transfer')) {
        return {
          behavior: 'ask',
          message: 'Command downloads files via BITS transfer',
        }
      }
    }
  }
  return { behavior: 'safe' }
}

/**
 * Start-Process -Verb RunAs (privilege escalation) or
 * Start-Process targeting a PowerShell executable (nested invocation).
 */
function checkStartProcess(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    const lower = cmd.name.toLowerCase()
    if (lower !== 'start-process' && lower !== 'saps' && lower !== 'start') {
      continue
    }
    // Vector 1: -Verb RunAs
    if (
      commandHasArgAbbreviation(cmd, '-Verb', '-v') &&
      cmd.args.some(a => a.toLowerCase() === 'runas')
    ) {
      return {
        behavior: 'ask',
        message: 'Command requests elevated privileges (UAC)',
      }
    }
    // Colon syntax: -Verb:RunAs, -v:RunAs
    if (
      cmd.args.some(a => {
        const clean = a.replace(/`/g, '')
        return /^-v[a-z]*:['"` ]*runas['"` ]*$/i.test(clean)
      })
    ) {
      return {
        behavior: 'ask',
        message: 'Command requests elevated privileges (UAC)',
      }
    }
    // Vector 2: Start-Process targeting a PowerShell executable
    for (const arg of cmd.args) {
      const stripped = arg.replace(/^['"]|['"]$/g, '')
      if (isPowerShellExecutable(stripped)) {
        return {
          behavior: 'ask',
          message:
            'Start-Process launches a nested PowerShell process which cannot be validated',
        }
      }
    }
  }
  return { behavior: 'safe' }
}

/**
 * PowerShell self-invocation: pwsh -Command "...", pwsh -File, etc.
 */
function checkPwshSelfInvocation(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    if (isPowerShellExecutable(cmd.name)) {
      return {
        behavior: 'ask',
        message:
          'Command spawns a nested PowerShell process which cannot be validated',
      }
    }
  }
  return { behavior: 'safe' }
}

/**
 * Encoded command parameters obscure intent.
 */
function checkEncodedCommand(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    if (isPowerShellExecutable(cmd.name)) {
      if (commandHasArgAbbreviation(cmd, '-encodedcommand', '-e')) {
        return {
          behavior: 'ask',
          message: 'Command uses encoded parameters which obscure intent',
        }
      }
    }
  }
  return { behavior: 'safe' }
}

/**
 * New-Object -ComObject — COM objects can have execution capabilities.
 */
function checkComObject(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    if (cmd.name.toLowerCase() !== 'new-object') continue
    if (commandHasArgAbbreviation(cmd, '-comobject', '-com')) {
      return {
        behavior: 'ask',
        message:
          'Command instantiates a COM object which may have execution capabilities',
      }
    }
  }
  return { behavior: 'safe' }
}

/**
 * Add-Type compiles and loads .NET code at runtime.
 */
function checkAddType(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  if (hasCommandNamed(parsed, 'add-type')) {
    return {
      behavior: 'ask',
      message: 'Command compiles and loads .NET code',
    }
  }
  return { behavior: 'safe' }
}

/**
 * FILEPATH_EXECUTION_CMDLETS with -FilePath: runs a script file.
 */
function checkDangerousFilePathExecution(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    const resolved = resolveCommandName(cmd.name)
    if (!FILEPATH_EXECUTION_CMDLETS.has(resolved)) continue
    if (
      commandHasArgAbbreviation(cmd, '-filepath', '-f') ||
      commandHasArgAbbreviation(cmd, '-literalpath', '-l')
    ) {
      return {
        behavior: 'ask',
        message: `${cmd.name} -FilePath executes an arbitrary script file`,
      }
    }
    // Positional binding: first non-dash StringConstant arg may bind to -FilePath
    for (let i = 0; i < cmd.args.length; i++) {
      const argType = cmd.elementTypes?.[i + 1]
      const arg = cmd.args[i]
      if (argType === 'StringConstant' && arg && !arg.startsWith('-')) {
        return {
          behavior: 'ask',
          message:
            `${cmd.name} with positional string argument binds to -FilePath`
            + ' and executes a script file',
        }
      }
    }
  }
  return { behavior: 'safe' }
}

/**
 * Module-loading cmdlets: Import-Module, Install-Module, etc.
 * Loading a .psm1 runs its top-level script body.
 */
function checkModuleLoading(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    if (MODULE_LOADING_CMDLETS.has(cmd.name.toLowerCase())) {
      return {
        behavior: 'ask',
        message:
          'Command loads, installs, or downloads a PowerShell module,'
          + ' which can execute arbitrary code',
      }
    }
  }
  return { behavior: 'safe' }
}

/**
 * Set-Alias / Set-Variable — runtime state manipulation that can
 * hijack future command resolution.
 */
function checkRuntimeStateManipulation(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    const raw = cmd.name.toLowerCase()
    // Strip module qualifier: Microsoft.PowerShell.Utility\Set-Alias → set-alias
    const lower = raw.includes('\\')
      ? raw.slice(raw.lastIndexOf('\\') + 1)
      : raw
    if (ALIAS_HIJACK_CMDLETS.has(lower)) {
      return {
        behavior: 'ask',
        message:
          'Command creates or modifies an alias or variable that can affect'
          + ' future command resolution',
      }
    }
  }
  return { behavior: 'safe' }
}

/**
 * WMI/CIM process creation: Invoke-WmiMethod / Invoke-CimMethod.
 */
function checkWmiProcessSpawn(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    if (WMI_CIM_CMDLETS.has(cmd.name.toLowerCase())) {
      return {
        behavior: 'ask',
        message:
          `${cmd.name} can spawn arbitrary processes via WMI/CIM`
          + ' (Win32_Process Create)',
      }
    }
  }
  return { behavior: 'safe' }
}

/**
 * ForEach-Object -MemberName invokes methods by string name.
 * % Delete can call .Delete() on every piped object.
 */
function checkForEachMemberName(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    const resolved = resolveCommandName(cmd.name)
    if (resolved !== 'foreach-object') continue
    if (commandHasArgAbbreviation(cmd, '-membername', '-m')) {
      return {
        behavior: 'ask',
        message:
          'ForEach-Object -MemberName invokes methods by string name'
          + ' which cannot be validated',
      }
    }
    // Positional binding: `ForEach-Object Kill` binds to -MemberName
    for (let i = 0; i < cmd.args.length; i++) {
      const argType = cmd.elementTypes?.[i + 1]
      const arg = cmd.args[i]
      if (argType === 'StringConstant' && arg && !arg.startsWith('-')) {
        return {
          behavior: 'ask',
          message:
            'ForEach-Object with positional string argument binds to'
            + ' -MemberName and invokes methods by name',
        }
      }
    }
  }
  return { behavior: 'safe' }
}

/**
 * Invoke-Item (alias ii) opens files with default handler — RCE on executables.
 */
function checkInvokeItem(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    const lower = cmd.name.toLowerCase()
    if (lower === 'invoke-item' || lower === 'ii') {
      return {
        behavior: 'ask',
        message:
          'Invoke-Item opens files with the default handler (ShellExecute).'
          + ' On executable files this runs arbitrary code.',
      }
    }
  }
  return { behavior: 'safe' }
}

/**
 * Scheduled task persistence primitives.
 */
const SCHEDULED_TASK_CMDLETS = new Set([
  'register-scheduledtask',
  'new-scheduledtask',
  'new-scheduledtaskaction',
  'set-scheduledtask',
])

function checkScheduledTask(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    const lower = cmd.name.toLowerCase()
    if (SCHEDULED_TASK_CMDLETS.has(lower)) {
      return {
        behavior: 'ask',
        message:
          `${cmd.name} creates or modifies a scheduled task (persistence)`,
      }
    }
    if (lower === 'schtasks' || lower === 'schtasks.exe') {
      if (
        cmd.args.some(a => {
          const la = a.toLowerCase()
          return (
            la === '/create' ||
            la === '/change' ||
            la === '-create' ||
            la === '-change'
          )
        })
      ) {
        return {
          behavior: 'ask',
          message:
            'schtasks with create/change modifies scheduled tasks (persistence)',
        }
      }
    }
  }
  return { behavior: 'safe' }
}

// ---------------------------------------------------------------------------
// Security flag checks (AST-derived)
// ---------------------------------------------------------------------------

/**
 * Safe cmdlets where script blocks are just predicates/projections.
 */
const SAFE_SCRIPT_BLOCK_CMDLETS = new Set([
  'where-object',
  'sort-object',
  'select-object',
  'group-object',
  'format-table',
  'format-list',
  'format-wide',
  'format-custom',
  // NOT foreach-object — its block is arbitrary script
])

function checkScriptBlockInjection(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  const flags = deriveSecurityFlags(parsed)
  if (!flags.hasScriptBlocks) return { behavior: 'safe' }

  for (const cmd of getAllCommands(parsed)) {
    const lower = cmd.name.toLowerCase()
    if (DANGEROUS_SCRIPT_BLOCK_CMDLETS.has(lower)) {
      return {
        behavior: 'ask',
        message:
          'Command contains script block with dangerous cmdlet'
          + ' that may execute arbitrary code',
      }
    }
  }

  const allSafe = getAllCommands(parsed).every(cmd => {
    const lower = cmd.name.toLowerCase()
    if (SAFE_SCRIPT_BLOCK_CMDLETS.has(lower)) return true
    const alias = COMMON_ALIASES[lower]
    if (alias && SAFE_SCRIPT_BLOCK_CMDLETS.has(alias.toLowerCase())) {
      return true
    }
    return false
  })

  if (allSafe) return { behavior: 'safe' }

  return {
    behavior: 'ask',
    message: 'Command contains script block that may execute arbitrary code',
  }
}

function checkSubExpressions(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  if (deriveSecurityFlags(parsed).hasSubExpressions) {
    return {
      behavior: 'ask',
      message: 'Command contains subexpressions $()',
    }
  }
  return { behavior: 'safe' }
}

function checkExpandableStrings(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  if (deriveSecurityFlags(parsed).hasExpandableStrings) {
    return {
      behavior: 'ask',
      message:
        'Command contains expandable strings with embedded expressions',
    }
  }
  return { behavior: 'safe' }
}

function checkSplatting(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  if (deriveSecurityFlags(parsed).hasSplatting) {
    return {
      behavior: 'ask',
      message: 'Command uses splatting (@variable)',
    }
  }
  return { behavior: 'safe' }
}

function checkStopParsing(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  if (deriveSecurityFlags(parsed).hasStopParsing) {
    return {
      behavior: 'ask',
      message: 'Command uses stop-parsing token (--%)',
    }
  }
  return { behavior: 'safe' }
}

function checkMemberInvocations(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  if (deriveSecurityFlags(parsed).hasMemberInvocations) {
    return {
      behavior: 'ask',
      message: 'Command invokes .NET methods',
    }
  }
  return { behavior: 'safe' }
}

/**
 * Network cmdlets: Invoke-WebRequest, Invoke-RestMethod.
 */
function checkNetworkCmdlets(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  for (const cmd of getAllCommands(parsed)) {
    if (NETWORK_CMDLETS.has(cmd.name.toLowerCase())) {
      return {
        behavior: 'ask',
        message:
          'Command makes network requests which could exfiltrate data'
          + ' or download payloads',
      }
    }
  }
  return { behavior: 'safe' }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Analyze a parsed PowerShell AST for dangerous patterns.
 *
 * @returns 'safe' if all checks pass, 'ask' if user approval is needed,
 * 'deny' if the command should be blocked entirely.
 */
export function powershellCommandIsSafe(
  parsed: ParsedPowerShellCommand,
): PowerShellSafetyResult {
  // If the AST parse failed, we cannot determine safety — ask the user
  if (!parsed.valid) {
    return 'ask'
  }

  const validators: Array<
    (p: ParsedPowerShellCommand) => PowerShellSecurityResult
  > = [
    // Code injection
    checkInvokeExpression,
    checkDynamicCommandName,
    checkEncodedCommand,
    // Download cradles (deny — always block download+execute chains)
    checkDownloadCradles,
    checkDownloadUtilities,
    // Privilege escalation & process spawning
    checkStartProcess,
    checkPwshSelfInvocation,
    // COM & .NET
    checkComObject,
    checkAddType,
    // File path execution
    checkDangerousFilePathExecution,
    checkInvokeItem,
    // Persistence
    checkScheduledTask,
    // Method invocation by string name
    checkForEachMemberName,
    // Module loading
    checkModuleLoading,
    // Runtime state manipulation
    checkRuntimeStateManipulation,
    // WMI/CIM
    checkWmiProcessSpawn,
    // Network
    checkNetworkCmdlets,
    // Script blocks
    checkScriptBlockInjection,
    // AST security flags
    checkSubExpressions,
    checkExpandableStrings,
    checkSplatting,
    checkStopParsing,
    checkMemberInvocations,
  ]

  for (const validator of validators) {
    const result = validator(parsed)
    if (result.behavior === 'deny') return 'deny'
    if (result.behavior === 'ask') return 'ask'
  }

  return 'safe'
}

/**
 * Same as powershellCommandIsSafe but returns the full result with message.
 */
export function powershellCommandIsSafeDetailed(
  parsed: ParsedPowerShellCommand,
): PowerShellSecurityResult {
  if (!parsed.valid) {
    return {
      behavior: 'ask',
      message: 'Could not parse command for security analysis',
    }
  }

  const validators: Array<
    (p: ParsedPowerShellCommand) => PowerShellSecurityResult
  > = [
    checkInvokeExpression,
    checkDynamicCommandName,
    checkEncodedCommand,
    checkDownloadCradles,
    checkDownloadUtilities,
    checkStartProcess,
    checkPwshSelfInvocation,
    checkComObject,
    checkAddType,
    checkDangerousFilePathExecution,
    checkInvokeItem,
    checkScheduledTask,
    checkForEachMemberName,
    checkModuleLoading,
    checkRuntimeStateManipulation,
    checkWmiProcessSpawn,
    checkNetworkCmdlets,
    checkScriptBlockInjection,
    checkSubExpressions,
    checkExpandableStrings,
    checkSplatting,
    checkStopParsing,
    checkMemberInvocations,
  ]

  for (const validator of validators) {
    const result = validator(parsed)
    if (result.behavior !== 'safe') return result
  }

  return { behavior: 'safe' }
}
