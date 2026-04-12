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
 * Shared constants for PowerShell cmdlets that execute arbitrary code.
 *
 * These lists are consumed by the permission-engine validators and the
 * UI suggestion gate. Keeping them here avoids duplicating the lists
 * and prevents sync drift.
 */

// ---------------------------------------------------------------------------
// Cmdlets that accept a -FilePath (or positional path) and execute the
// file's contents as a script.
// ---------------------------------------------------------------------------

export const FILEPATH_EXECUTION_CMDLETS = new Set([
  'invoke-command',
  'start-job',
  'start-threadjob',
  'register-scheduledjob',
])

// ---------------------------------------------------------------------------
// Cmdlets where a scriptblock argument executes arbitrary code (not just
// filtering/transforming pipeline input like Where-Object).
// ---------------------------------------------------------------------------

export const DANGEROUS_SCRIPT_BLOCK_CMDLETS = new Set([
  'invoke-command',
  'invoke-expression',
  'start-job',
  'start-threadjob',
  'register-scheduledjob',
  'register-engineevent',
  'register-objectevent',
  'register-wmievent',
  'new-pssession',
  'enter-pssession',
])

// ---------------------------------------------------------------------------
// Cmdlets that load and execute module/script code. .psm1 files run
// their top-level body on import — same code-execution risk as iex.
// ---------------------------------------------------------------------------

export const MODULE_LOADING_CMDLETS = new Set([
  'import-module',
  'ipmo',
  'install-module',
  'save-module',
  'update-module',
  'install-script',
  'save-script',
])

// ---------------------------------------------------------------------------
// Shells and process spawners.
// ---------------------------------------------------------------------------

const SHELLS_AND_SPAWNERS = [
  'pwsh',
  'powershell',
  'cmd',
  'bash',
  'wsl',
  'sh',
  'start-process',
  'start',
  'add-type',
  'new-object',
] as const

// ---------------------------------------------------------------------------
// Network cmdlets — wildcard rules for these enable exfil/download.
// ---------------------------------------------------------------------------

export const NETWORK_CMDLETS = new Set([
  'invoke-webrequest',
  'invoke-restmethod',
])

// ---------------------------------------------------------------------------
// Alias/variable mutation cmdlets — Set-Alias rebinds command resolution,
// Set-Variable can poison $PSDefaultParameterValues.
// ---------------------------------------------------------------------------

export const ALIAS_HIJACK_CMDLETS = new Set([
  'set-alias',
  'sal',
  'new-alias',
  'nal',
  'set-variable',
  'sv',
  'new-variable',
  'nv',
])

// ---------------------------------------------------------------------------
// WMI/CIM process spawn — Invoke-WmiMethod -Class Win32_Process -Name Create
// is a Start-Process equivalent that bypasses checkStartProcess.
// ---------------------------------------------------------------------------

export const WMI_CIM_CMDLETS = new Set([
  'invoke-wmimethod',
  'iwmi',
  'invoke-cimmethod',
])

// ---------------------------------------------------------------------------
// Git safety — cmdlets that can write into git internal paths.
// ---------------------------------------------------------------------------

export const GIT_SAFETY_WRITE_CMDLETS = new Set([
  'new-item',
  'set-content',
  'add-content',
  'out-file',
  'copy-item',
  'move-item',
  'rename-item',
  'expand-archive',
  'invoke-webrequest',
  'invoke-restmethod',
  'tee-object',
  'export-csv',
  'export-clixml',
])

// ---------------------------------------------------------------------------
// External archive-extraction applications that write files to cwd with
// archive-controlled paths. Any extraction preceding git must ask.
// ---------------------------------------------------------------------------

export const GIT_SAFETY_ARCHIVE_EXTRACTORS = new Set([
  'tar',
  'tar.exe',
  'bsdtar',
  'bsdtar.exe',
  'unzip',
  'unzip.exe',
  '7z',
  '7z.exe',
  '7za',
  '7za.exe',
  'gzip',
  'gzip.exe',
  'gunzip',
  'gunzip.exe',
])

// ---------------------------------------------------------------------------
// Cmdlets with arg-gated callbacks that must not be suggested as wildcards.
// ---------------------------------------------------------------------------

export const ARG_GATED_CMDLETS = new Set([
  'select-object',
  'sort-object',
  'group-object',
  'where-object',
  'measure-object',
  'write-output',
  'write-host',
  'start-sleep',
  'format-table',
  'format-list',
  'format-wide',
  'format-custom',
  'out-string',
  'out-host',
  'ipconfig',
  'hostname',
  'route',
])

// ---------------------------------------------------------------------------
// Cross-platform code execution commands (interpreters/runners).
// ---------------------------------------------------------------------------

const CROSS_PLATFORM_CODE_EXEC = [
  'node',
  'python',
  'python3',
  'ruby',
  'perl',
  'php',
  'java',
  'dotnet',
  'csc',
  'rustc',
  'gcc',
  'g++',
  'clang',
  'go',
  'deno',
  'bun',
] as const

// ---------------------------------------------------------------------------
// Aggregate: commands to never suggest as a wildcard prefix in the
// permission dialog. Derived from the validator lists above.
// ---------------------------------------------------------------------------

function resolveAliasesOf(
  targets: ReadonlySet<string>,
  aliasMap: Record<string, string>,
): string[] {
  return Object.entries(aliasMap)
    .filter(([, target]) => targets.has(target.toLowerCase()))
    .map(([alias]) => alias)
}

/**
 * Build the NEVER_SUGGEST set. Requires the COMMON_ALIASES map from
 * readOnlyValidation.ts to resolve alias → cmdlet mappings.
 */
export function buildNeverSuggest(
  aliasMap: Record<string, string>,
): ReadonlySet<string> {
  const core = new Set<string>([
    ...SHELLS_AND_SPAWNERS,
    ...FILEPATH_EXECUTION_CMDLETS,
    ...DANGEROUS_SCRIPT_BLOCK_CMDLETS,
    ...MODULE_LOADING_CMDLETS,
    ...NETWORK_CMDLETS,
    ...ALIAS_HIJACK_CMDLETS,
    ...WMI_CIM_CMDLETS,
    ...ARG_GATED_CMDLETS,
    'foreach-object',
    ...CROSS_PLATFORM_CODE_EXEC,
  ])
  return new Set([...core, ...resolveAliasesOf(core, aliasMap)])
}
