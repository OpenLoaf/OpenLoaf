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
 * PowerShell read-only command validation.
 *
 * Cmdlets are case-insensitive; all matching is done in lowercase.
 */

// ---------------------------------------------------------------------------
// Common alias → canonical cmdlet name mapping.
// Uses Object.create(null) to prevent prototype-chain pollution.
// ---------------------------------------------------------------------------

export const COMMON_ALIASES: Record<string, string> = Object.assign(
  Object.create(null) as Record<string, string>,
  {
    // Directory listing
    ls: 'Get-ChildItem',
    dir: 'Get-ChildItem',
    gci: 'Get-ChildItem',
    // Content
    cat: 'Get-Content',
    type: 'Get-Content',
    gc: 'Get-Content',
    // Navigation
    cd: 'Set-Location',
    sl: 'Set-Location',
    chdir: 'Set-Location',
    pushd: 'Push-Location',
    popd: 'Pop-Location',
    pwd: 'Get-Location',
    gl: 'Get-Location',
    // Items
    gi: 'Get-Item',
    gp: 'Get-ItemProperty',
    ni: 'New-Item',
    mkdir: 'New-Item',
    md: 'New-Item',
    ri: 'Remove-Item',
    del: 'Remove-Item',
    rd: 'Remove-Item',
    rmdir: 'Remove-Item',
    rm: 'Remove-Item',
    erase: 'Remove-Item',
    mi: 'Move-Item',
    mv: 'Move-Item',
    move: 'Move-Item',
    ci: 'Copy-Item',
    cp: 'Copy-Item',
    copy: 'Copy-Item',
    cpi: 'Copy-Item',
    si: 'Set-Item',
    rni: 'Rename-Item',
    ren: 'Rename-Item',
    // Process
    ps: 'Get-Process',
    gps: 'Get-Process',
    kill: 'Stop-Process',
    spps: 'Stop-Process',
    start: 'Start-Process',
    saps: 'Start-Process',
    sajb: 'Start-Job',
    ipmo: 'Import-Module',
    // Output
    echo: 'Write-Output',
    write: 'Write-Output',
    sleep: 'Start-Sleep',
    // Help
    help: 'Get-Help',
    man: 'Get-Help',
    gcm: 'Get-Command',
    // Service
    gsv: 'Get-Service',
    // Variables
    gv: 'Get-Variable',
    sv: 'Set-Variable',
    // History
    h: 'Get-History',
    history: 'Get-History',
    // Invoke
    iex: 'Invoke-Expression',
    iwr: 'Invoke-WebRequest',
    irm: 'Invoke-RestMethod',
    icm: 'Invoke-Command',
    ii: 'Invoke-Item',
    // PSSession — remote code execution surface
    nsn: 'New-PSSession',
    etsn: 'Enter-PSSession',
    exsn: 'Exit-PSSession',
    gsn: 'Get-PSSession',
    rsn: 'Remove-PSSession',
    // Misc
    cls: 'Clear-Host',
    clear: 'Clear-Host',
    select: 'Select-Object',
    where: 'Where-Object',
    foreach: 'ForEach-Object',
    '%': 'ForEach-Object',
    '?': 'Where-Object',
    measure: 'Measure-Object',
    ft: 'Format-Table',
    fl: 'Format-List',
    fw: 'Format-Wide',
    oh: 'Out-Host',
    ogv: 'Out-GridView',
    // SECURITY: sc, sort, curl, wget deliberately omitted — they collide
    // with native executables on PS Core 6+.
    ac: 'Add-Content',
    clc: 'Clear-Content',
    tee: 'Tee-Object',
    epcsv: 'Export-Csv',
    sp: 'Set-ItemProperty',
    rp: 'Remove-ItemProperty',
    cli: 'Clear-Item',
    epal: 'Export-Alias',
    sls: 'Select-String',
  },
)

// ---------------------------------------------------------------------------
// Alias resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a command name to its canonical cmdlet name (lowercase).
 * Returns the input lowercased if no alias mapping exists.
 */
export function resolveToCanonical(command: string): string {
  const lower = command.toLowerCase()
  const mapped = COMMON_ALIASES[lower]
  return mapped ? mapped.toLowerCase() : lower
}

// ---------------------------------------------------------------------------
// Safe read-only cmdlets — can be auto-approved without user prompt.
// ---------------------------------------------------------------------------

export const SAFE_READONLY_CMDLETS = new Set([
  // Filesystem (read-only)
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
  // Navigation (just changes working directory)
  'set-location',
  'push-location',
  'pop-location',
  'get-location',
  // Text search
  'select-string',
  // Data conversion (pure transforms)
  'convertto-json',
  'convertfrom-json',
  'convertto-csv',
  'convertfrom-csv',
  'convertto-xml',
  'convertto-html',
  // Object inspection
  'get-member',
  'get-unique',
  'compare-object',
  'join-string',
  'get-random',
  // Path utilities
  'convert-path',
  'join-path',
  'split-path',
  // System info
  'get-hotfix',
  'get-psprovider',
  'get-process',
  'get-service',
  'get-computerinfo',
  'get-host',
  'get-date',
  'get-psdrive',
  'get-module',
  'get-alias',
  'get-history',
  'get-culture',
  'get-uiculture',
  'get-timezone',
  'get-uptime',
  // Output (safe when args are literals)
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
  'out-null',
])

// ---------------------------------------------------------------------------
// Safe output cmdlets — allowed in pipeline tail position.
// ---------------------------------------------------------------------------

const SAFE_OUTPUT_CMDLETS = new Set([
  'out-null',
  'out-default',
])

// ---------------------------------------------------------------------------
// Sync security concern checks
// ---------------------------------------------------------------------------

/**
 * Sync regex-based check for security-concerning patterns in a
 * PowerShell command. Used as a fast pre-filter before the cmdlet
 * allowlist check.
 *
 * Returns true if the command contains patterns that indicate it should
 * NOT be considered read-only, even if the cmdlet is in the allowlist.
 */
export function hasSyncSecurityConcerns(command: string): boolean {
  const trimmed = command.trim()
  if (!trimmed) return false

  // Subexpressions: $(...) can execute arbitrary code
  if (/\$\(/.test(trimmed)) return true

  // Splatting: @variable passes arbitrary parameters
  if (/(?:^|[^\w.])@\w+/.test(trimmed)) return true

  // Member invocations: .Method() can call arbitrary .NET methods
  if (/\.\w+\s*\(/.test(trimmed)) return true

  // Assignments: $var = ... can modify state
  if (/\$\w+\s*[+\-*/]?=/.test(trimmed)) return true

  // Stop-parsing symbol: --% passes everything raw to native commands
  if (/--%/.test(trimmed)) return true

  // UNC paths: \\server\share or //server/share can trigger network
  // requests and leak NTLM/Kerberos credentials
  if (/\\\\/.test(trimmed)) return true
  if (/(?<!:)\/\//.test(trimmed)) return true

  // Static method calls: [Type]::Method() can invoke arbitrary .NET methods
  if (/::/.test(trimmed)) return true

  return false
}

// ---------------------------------------------------------------------------
// Read-only command check
// ---------------------------------------------------------------------------

/**
 * Quick sync check: is this a single-token command that is read-only?
 * Does NOT parse the AST — only looks at the first whitespace-delimited
 * token and checks it against SAFE_READONLY_CMDLETS.
 */
export function isReadOnlyCommand(command: string): boolean {
  const trimmed = command.trim()
  if (!trimmed) return false

  // Fast-reject: any security-concerning patterns
  if (hasSyncSecurityConcerns(trimmed)) return false

  // Extract first token
  const firstToken = trimmed.split(/\s+/)[0]
  if (!firstToken) return false

  const canonical = resolveToCanonical(firstToken)
  return SAFE_READONLY_CMDLETS.has(canonical)
}

/**
 * Check if a command name is a safe output cmdlet (pipeline tail position).
 */
export function isSafeOutputCommand(name: string): boolean {
  const canonical = resolveToCanonical(name)
  return SAFE_OUTPUT_CMDLETS.has(canonical)
}
