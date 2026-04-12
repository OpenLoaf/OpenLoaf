/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { spawn } from 'node:child_process'

import { getCachedPowerShellPath } from './powershellDetection'
import { encodePowerShellCommand } from './powershellProvider'

// ---------------------------------------------------------------------------
// Public types describing the parsed output returned to callers.
// ---------------------------------------------------------------------------

type PipelineElementType =
  | 'CommandAst'
  | 'CommandExpressionAst'
  | 'ParenExpressionAst'

type CommandElementType =
  | 'ScriptBlock'
  | 'SubExpression'
  | 'ExpandableString'
  | 'MemberInvocation'
  | 'Variable'
  | 'StringConstant'
  | 'Parameter'
  | 'Other'

export type CommandElementChild = {
  type: CommandElementType
  text: string
}

export type ParsedCommandElement = {
  /** The command/cmdlet name (e.g., "Get-ChildItem", "git") */
  name: string
  /** The command name type: cmdlet, application (exe), or unknown */
  nameType: 'cmdlet' | 'application' | 'unknown'
  /** The AST element type from PowerShell's parser */
  elementType: PipelineElementType
  /** All arguments as strings (includes flags like "-Recurse") */
  args: string[]
  /** The full text of this command element */
  text: string
  /** AST node types for each element in this command */
  elementTypes?: CommandElementType[]
  /** Child nodes of each argument, aligned with args[] */
  children?: (CommandElementChild[] | undefined)[]
  /** Redirections on this command element */
  redirections?: ParsedRedirection[]
}

type ParsedRedirection = {
  operator: '>' | '>>' | '2>' | '2>>' | '*>' | '*>>' | '2>&1'
  target: string
  isMerging: boolean
}

type StatementType =
  | 'PipelineAst'
  | 'PipelineChainAst'
  | 'AssignmentStatementAst'
  | 'IfStatementAst'
  | 'ForStatementAst'
  | 'ForEachStatementAst'
  | 'WhileStatementAst'
  | 'DoWhileStatementAst'
  | 'DoUntilStatementAst'
  | 'SwitchStatementAst'
  | 'TryStatementAst'
  | 'TrapStatementAst'
  | 'FunctionDefinitionAst'
  | 'DataStatementAst'
  | 'UnknownStatementAst'

type ParsedStatement = {
  statementType: StatementType
  commands: ParsedCommandElement[]
  redirections: ParsedRedirection[]
  text: string
  nestedCommands?: ParsedCommandElement[]
  securityPatterns?: {
    hasMemberInvocations?: boolean
    hasSubExpressions?: boolean
    hasExpandableStrings?: boolean
    hasScriptBlocks?: boolean
  }
}

type ParsedVariable = {
  path: string
  isSplatted: boolean
}

type ParseError = {
  message: string
  errorId: string
}

export type ParsedPowerShellCommand = {
  valid: boolean
  errors: ParseError[]
  statements: ParsedStatement[]
  variables: ParsedVariable[]
  hasStopParsing: boolean
  originalCommand: string
  typeLiterals?: string[]
  hasUsingStatements?: boolean
  hasScriptRequirements?: boolean
}

// ---------------------------------------------------------------------------
// Raw internal types matching PS script JSON output.
// ---------------------------------------------------------------------------

type RawCommandElement = {
  type: string
  text: string
  value?: string
  expressionType?: string
  children?: { type: string; text: string }[]
}

type RawRedirection = {
  type: string
  append?: boolean
  fromStream?: string
  locationText?: string
}

type RawPipelineElement = {
  type: string
  text: string
  commandElements?: RawCommandElement[]
  redirections?: RawRedirection[]
  expressionType?: string
}

type RawStatement = {
  type: string
  text: string
  elements?: RawPipelineElement[]
  nestedCommands?: RawPipelineElement[]
  redirections?: RawRedirection[]
  securityPatterns?: {
    hasMemberInvocations?: boolean
    hasSubExpressions?: boolean
    hasExpandableStrings?: boolean
    hasScriptBlocks?: boolean
  }
}

type RawParsedOutput = {
  valid: boolean
  errors: { message: string; errorId: string }[]
  statements: RawStatement[]
  variables: { path: string; isSplatted: boolean }[]
  hasStopParsing: boolean
  originalCommand: string
  typeLiterals?: string[]
  hasUsingStatements?: boolean
  hasScriptRequirements?: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_PARSE_TIMEOUT_MS = 5_000
const MAX_COMMAND_LENGTH = 4_500

// ---------------------------------------------------------------------------
// Parse script — inlined as string constant.
// The user command is passed via $input (stdin pipe) to avoid injection.
// ---------------------------------------------------------------------------

const PARSE_SCRIPT_BODY = `
$Command = @($input) -join [Environment]::NewLine

if (-not $Command) {
    Write-Output '{"valid":false,"errors":[{"message":"No command provided","errorId":"NoInput"}],"statements":[],"variables":[],"hasStopParsing":false,"originalCommand":""}'
    exit 0
}

$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseInput(
    $Command,
    [ref]$tokens,
    [ref]$parseErrors
)

$allVariables = [System.Collections.ArrayList]::new()

function Get-RawCommandElements {
    param([System.Management.Automation.Language.CommandAst]$CmdAst)
    $elems = [System.Collections.ArrayList]::new()
    foreach ($ce in $CmdAst.CommandElements) {
        $ceData = @{ type = $ce.GetType().Name; text = $ce.Extent.Text }
        if ($ce.PSObject.Properties['Value'] -and $null -ne $ce.Value -and $ce.Value -is [string]) {
            $ceData.value = $ce.Value
        }
        if ($ce -is [System.Management.Automation.Language.CommandExpressionAst]) {
            $ceData.expressionType = $ce.Expression.GetType().Name
        }
        $a=$ce.Argument;if($a){$ceData.children=@(@{type=$a.GetType().Name;text=$a.Extent.Text})}
        [void]$elems.Add($ceData)
    }
    return $elems
}

function Get-RawRedirections {
    param($Redirections)
    $result = [System.Collections.ArrayList]::new()
    foreach ($redir in $Redirections) {
        $redirData = @{ type = $redir.GetType().Name }
        if ($redir -is [System.Management.Automation.Language.FileRedirectionAst]) {
            $redirData.append = [bool]$redir.Append
            $redirData.fromStream = $redir.FromStream.ToString()
            $redirData.locationText = $redir.Location.Extent.Text
        }
        [void]$result.Add($redirData)
    }
    return $result
}

function Get-SecurityPatterns($A) {
    $p = @{}
    foreach ($n in $A.FindAll({ param($x)
        $x -is [System.Management.Automation.Language.MemberExpressionAst] -or
        $x -is [System.Management.Automation.Language.SubExpressionAst] -or
        $x -is [System.Management.Automation.Language.ArrayExpressionAst] -or
        $x -is [System.Management.Automation.Language.ExpandableStringExpressionAst] -or
        $x -is [System.Management.Automation.Language.ScriptBlockExpressionAst] -or
        $x -is [System.Management.Automation.Language.ParenExpressionAst]
    }, $true)) { switch ($n.GetType().Name) {
        'InvokeMemberExpressionAst' { $p.hasMemberInvocations = $true }
        'MemberExpressionAst' { $p.hasMemberInvocations = $true }
        'SubExpressionAst' { $p.hasSubExpressions = $true }
        'ArrayExpressionAst' { $p.hasSubExpressions = $true }
        'ParenExpressionAst' { $p.hasSubExpressions = $true }
        'ExpandableStringExpressionAst' { $p.hasExpandableStrings = $true }
        'ScriptBlockExpressionAst' { $p.hasScriptBlocks = $true }
    }}
    if ($p.Count -gt 0) { return $p }
    return $null
}

$varExprs = $ast.FindAll({ param($node) $node -is [System.Management.Automation.Language.VariableExpressionAst] }, $true)
foreach ($v in $varExprs) {
    [void]$allVariables.Add(@{
        path = $v.VariablePath.ToString()
        isSplatted = [bool]$v.Splatted
    })
}

$typeLiterals = [System.Collections.ArrayList]::new()
foreach ($t in $ast.FindAll({ param($n)
    $n -is [System.Management.Automation.Language.TypeExpressionAst] -or
    $n -is [System.Management.Automation.Language.TypeConstraintAst]
}, $true)) { [void]$typeLiterals.Add($t.TypeName.FullName) }

$hasStopParsing = $false
foreach ($tok in $tokens) {
    if ($tok.Kind -eq 'MinusMinus' -or ($tok.Kind -eq 'Generic' -and $tok.Text -eq '--%')) {
        $hasStopParsing = $true
        break
    }
}

$hasUsing = $false
$hasRequires = $false
if ($ast.UsingStatements -and $ast.UsingStatements.Count -gt 0) {
    foreach ($u in $ast.UsingStatements) {
        if ($u.UsingStatementKind -eq 'Module' -or $u.UsingStatementKind -eq 'Assembly') {
            $hasUsing = $true
            break
        }
    }
}
if ($ast.ScriptRequirements) { $hasRequires = $true }

function Process-BlockStatements($block) {
    if (-not $block) { return @() }
    $stmts = [System.Collections.ArrayList]::new()
    foreach ($s in $block.Statements) {
        $stmtData = @{
            type = $s.GetType().Name
            text = $s.Extent.Text
        }
        if ($s -is [System.Management.Automation.Language.PipelineAst]) {
            $elemList = [System.Collections.ArrayList]::new()
            foreach ($pe in $s.PipelineElements) {
                $peData = @{ type = $pe.GetType().Name; text = $pe.Extent.Text }
                if ($pe -is [System.Management.Automation.Language.CommandAst]) {
                    $peData.commandElements = Get-RawCommandElements $pe
                }
                if ($pe -is [System.Management.Automation.Language.CommandExpressionAst]) {
                    $peData.expressionType = $pe.Expression.GetType().Name
                }
                if ($pe.Redirections -and $pe.Redirections.Count -gt 0) {
                    $peData.redirections = Get-RawRedirections $pe.Redirections
                }
                [void]$elemList.Add($peData)
            }
            $stmtData.elements = $elemList
        } else {
            $nested = [System.Collections.ArrayList]::new()
            foreach ($cmd in $s.FindAll({ param($x) $x -is [System.Management.Automation.Language.CommandAst] }, $true)) {
                $cmdData = @{
                    type = $cmd.GetType().Name
                    text = $cmd.Extent.Text
                    commandElements = Get-RawCommandElements $cmd
                }
                if ($cmd.Redirections -and $cmd.Redirections.Count -gt 0) {
                    $cmdData.redirections = Get-RawRedirections $cmd.Redirections
                }
                [void]$nested.Add($cmdData)
            }
            if ($nested.Count -gt 0) { $stmtData.nestedCommands = $nested }
            $sp = Get-SecurityPatterns $s
            if ($sp) { $stmtData.securityPatterns = $sp }
            $redirs = [System.Collections.ArrayList]::new()
            foreach ($r in $s.FindAll({ param($x) $x -is [System.Management.Automation.Language.FileRedirectionAst] }, $true)) {
                $rData = @{ type = $r.GetType().Name; append = [bool]$r.Append; fromStream = $r.FromStream.ToString(); locationText = $r.Location.Extent.Text }
                [void]$redirs.Add($rData)
            }
            if ($redirs.Count -gt 0) { $stmtData.redirections = $redirs }
        }
        [void]$stmts.Add($stmtData)
    }
    return $stmts
}

$stmts = Process-BlockStatements $ast.EndBlock
$stmts += Process-BlockStatements $ast.BeginBlock
$stmts += Process-BlockStatements $ast.ProcessBlock

$result = @{
    valid = ($parseErrors.Count -eq 0)
    errors = @($parseErrors | ForEach-Object { @{ message = $_.Message; errorId = $_.ErrorId } })
    statements = @($stmts)
    variables = @($allVariables)
    hasStopParsing = $hasStopParsing
    originalCommand = $Command
}
if ($typeLiterals.Count -gt 0) { $result.typeLiterals = @($typeLiterals) }
if ($hasUsing) { $result.hasUsingStatements = $true }
if ($hasRequires) { $result.hasScriptRequirements = $true }

$result | ConvertTo-Json -Depth 20 -Compress
`

// ---------------------------------------------------------------------------
// Transform raw PS output → typed ParsedPowerShellCommand
// ---------------------------------------------------------------------------

function mapElementType(typeName: string): PipelineElementType {
  if (typeName === 'CommandAst') return 'CommandAst'
  if (typeName === 'CommandExpressionAst') return 'CommandExpressionAst'
  if (typeName === 'ParenExpressionAst') return 'ParenExpressionAst'
  return 'CommandAst'
}

function mapCommandElementType(typeName: string): CommandElementType {
  if (typeName.includes('ScriptBlockExpression')) return 'ScriptBlock'
  if (
    typeName === 'SubExpressionAst' ||
    typeName === 'ArrayExpressionAst'
  ) return 'SubExpression'
  if (typeName === 'ExpandableStringExpressionAst') return 'ExpandableString'
  if (
    typeName === 'InvokeMemberExpressionAst' ||
    typeName === 'MemberExpressionAst'
  ) return 'MemberInvocation'
  if (typeName === 'VariableExpressionAst') return 'Variable'
  if (typeName === 'StringConstantExpressionAst') return 'StringConstant'
  if (typeName === 'CommandParameterAst') return 'Parameter'
  return 'Other'
}

function mapRedirection(raw: RawRedirection): ParsedRedirection {
  const isMerging = raw.type === 'MergingRedirectionAst'
  if (isMerging) {
    return { operator: '2>&1', target: '1', isMerging: true }
  }
  const append = raw.append ?? false
  const stream = (raw.fromStream ?? 'Output').toLowerCase()
  let op: ParsedRedirection['operator'] = append ? '>>' : '>'
  if (stream === 'error') op = append ? '2>>' : '2>'
  else if (stream === 'all') op = append ? '*>>' : '*>'
  return { operator: op, target: raw.locationText ?? '', isMerging: false }
}

function inferNameType(
  name: string,
): 'cmdlet' | 'application' | 'unknown' {
  // Cmdlets have Verb-Noun pattern
  if (/^[a-z]+-[a-z]/i.test(name)) return 'cmdlet'
  // Contains path separators or extensions → application
  if (/[/\\.]/.test(name)) return 'application'
  return 'unknown'
}

function transformElement(
  raw: RawPipelineElement,
): ParsedCommandElement | null {
  if (!raw.commandElements || raw.commandElements.length === 0) {
    return null
  }
  const firstElem = raw.commandElements[0]
  const name = firstElem?.value ?? firstElem?.text ?? ''
  const args = raw.commandElements.slice(1).map(e => e.value ?? e.text)
  const elementTypes = raw.commandElements.map(e =>
    mapCommandElementType(e.type),
  )
  const children = raw.commandElements.slice(1).map(e =>
    e.children
      ? e.children.map(c => ({
          type: mapCommandElementType(c.type),
          text: c.text,
        }))
      : undefined,
  )

  return {
    name,
    nameType: inferNameType(name),
    elementType: mapElementType(raw.type),
    args,
    text: raw.text,
    elementTypes,
    children,
    redirections: raw.redirections?.map(mapRedirection),
  }
}

function transformStatement(raw: RawStatement): ParsedStatement {
  const commands: ParsedCommandElement[] = []
  const redirections: ParsedRedirection[] = []

  if (raw.elements) {
    for (const el of raw.elements) {
      const cmd = transformElement(el)
      if (cmd) commands.push(cmd)
      if (el.redirections) {
        for (const r of el.redirections) {
          redirections.push(mapRedirection(r))
        }
      }
    }
  }

  if (raw.redirections) {
    for (const r of raw.redirections) {
      redirections.push(mapRedirection(r))
    }
  }

  const nestedCommands = raw.nestedCommands
    ?.map(transformElement)
    .filter((c): c is ParsedCommandElement => c !== null)

  return {
    statementType: raw.type as StatementType,
    commands,
    redirections,
    text: raw.text,
    nestedCommands: nestedCommands?.length ? nestedCommands : undefined,
    securityPatterns: raw.securityPatterns,
  }
}

function transformRawOutput(raw: RawParsedOutput): ParsedPowerShellCommand {
  return {
    valid: raw.valid,
    errors: raw.errors,
    statements: raw.statements.map(transformStatement),
    variables: raw.variables,
    hasStopParsing: raw.hasStopParsing,
    originalCommand: raw.originalCommand,
    typeLiterals: raw.typeLiterals,
    hasUsingStatements: raw.hasUsingStatements,
    hasScriptRequirements: raw.hasScriptRequirements,
  }
}

function makeInvalidResult(
  command: string,
  message: string,
  errorId: string,
): ParsedPowerShellCommand {
  return {
    valid: false,
    errors: [{ message, errorId }],
    statements: [],
    variables: [],
    hasStopParsing: false,
    originalCommand: command,
  }
}

// ---------------------------------------------------------------------------
// Core parse implementation — uses child_process.spawn + stdin pipe.
// ---------------------------------------------------------------------------

/**
 * Spawns pwsh with the parse script via -EncodedCommand and feeds
 * the user command through stdin (pipe). This ensures the user command
 * never appears in the process argv — defense-in-depth against injection.
 */
async function parsePowerShellCommandImpl(
  command: string,
): Promise<ParsedPowerShellCommand> {
  const commandBytes = Buffer.byteLength(command, 'utf8')
  if (commandBytes > MAX_COMMAND_LENGTH) {
    return makeInvalidResult(
      command,
      `Command too long for parsing (${commandBytes} bytes).`
        + ` Maximum supported length is ${MAX_COMMAND_LENGTH} bytes.`,
      'CommandTooLong',
    )
  }

  const pwshPath = await getCachedPowerShellPath()
  if (!pwshPath) {
    return makeInvalidResult(
      command,
      'PowerShell is not available',
      'NoPowerShell',
    )
  }

  // The parse script reads from $input (stdin). Encode the script itself
  // via -EncodedCommand so no shell-quoting issues arise.
  const encodedScript = encodePowerShellCommand(PARSE_SCRIPT_BODY)
  const args = [
    '-NoProfile',
    '-NonInteractive',
    '-NoLogo',
    '-EncodedCommand',
    encodedScript,
  ]

  const parseTimeoutMs = DEFAULT_PARSE_TIMEOUT_MS

  return new Promise<ParsedPowerShellCommand>(resolve => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const finish = (result: ParsedPowerShellCommand) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(result)
    }

    let child: ReturnType<typeof spawn>
    try {
      child = spawn(pwshPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (e: unknown) {
      finish(
        makeInvalidResult(
          command,
          `Failed to spawn PowerShell: ${e instanceof Error ? e.message : e}`,
          'PwshSpawnError',
        ),
      )
      return
    }

    // Timeout protection
    timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(
        makeInvalidResult(
          command,
          `pwsh timed out after ${parseTimeoutMs}ms`,
          'PwshTimeout',
        ),
      )
    }, parseTimeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    child.on('error', (err: Error) => {
      finish(
        makeInvalidResult(
          command,
          `Failed to spawn PowerShell: ${err.message}`,
          'PwshSpawnError',
        ),
      )
    })

    child.on('close', (code: number | null) => {
      if (code !== 0) {
        finish(
          makeInvalidResult(
            command,
            `pwsh exited with code ${code}: ${stderr}`,
            'PwshError',
          ),
        )
        return
      }

      const trimmed = stdout.trim()
      if (!trimmed) {
        finish(
          makeInvalidResult(
            command,
            'No output from PowerShell parser',
            'EmptyOutput',
          ),
        )
        return
      }

      try {
        const raw = JSON.parse(trimmed) as RawParsedOutput
        finish(transformRawOutput(raw))
      } catch {
        finish(
          makeInvalidResult(
            command,
            'Invalid JSON from PowerShell parser',
            'InvalidJson',
          ),
        )
      }
    })

    // Feed the user command through stdin — never in argv.
    child.stdin?.write(command)
    child.stdin?.end()
  })
}

// ---------------------------------------------------------------------------
// Simple LRU cache
// ---------------------------------------------------------------------------

const CACHE_MAX = 256
const parseCache = new Map<string, Promise<ParsedPowerShellCommand>>()

const TRANSIENT_ERROR_IDS = new Set([
  'PwshSpawnError',
  'PwshError',
  'PwshTimeout',
  'EmptyOutput',
  'InvalidJson',
])

/**
 * Parse a PowerShell command into an AST structure. Results are cached
 * (LRU, max 256 entries). Transient failures are evicted so subsequent
 * calls can retry.
 */
export async function parsePowerShellCommand(
  command: string,
): Promise<ParsedPowerShellCommand> {
  const cached = parseCache.get(command)
  if (cached) return cached

  const promise = parsePowerShellCommandImpl(command)

  // Evict oldest if at capacity
  if (parseCache.size >= CACHE_MAX) {
    const oldest = parseCache.keys().next().value
    if (oldest !== undefined) parseCache.delete(oldest)
  }
  parseCache.set(command, promise)

  // Evict transient failures after resolution
  void promise.then(result => {
    if (
      !result.valid &&
      TRANSIENT_ERROR_IDS.has(result.errors[0]?.errorId ?? '')
    ) {
      parseCache.delete(command)
    }
  })

  return promise
}

// ---------------------------------------------------------------------------
// Analysis helpers
// ---------------------------------------------------------------------------

/**
 * Security-relevant flags derived from the parsed AST.
 */
export type SecurityFlags = {
  hasSubExpressions: boolean
  hasScriptBlocks: boolean
  hasSplatting: boolean
  hasExpandableStrings: boolean
  hasMemberInvocations: boolean
  hasAssignments: boolean
  hasStopParsing: boolean
}

/**
 * Derive security-relevant flags from a parsed command.
 */
export function deriveSecurityFlags(
  parsed: ParsedPowerShellCommand,
): SecurityFlags {
  const flags: SecurityFlags = {
    hasSubExpressions: false,
    hasScriptBlocks: false,
    hasSplatting: false,
    hasExpandableStrings: false,
    hasMemberInvocations: false,
    hasAssignments: false,
    hasStopParsing: parsed.hasStopParsing,
  }

  // Check variables for splatting
  for (const v of parsed.variables) {
    if (v.isSplatted) {
      flags.hasSplatting = true
      break
    }
  }

  // Check statements for assignments and security patterns
  for (const stmt of parsed.statements) {
    if (stmt.statementType === 'AssignmentStatementAst') {
      flags.hasAssignments = true
    }
    if (stmt.securityPatterns) {
      if (stmt.securityPatterns.hasMemberInvocations) {
        flags.hasMemberInvocations = true
      }
      if (stmt.securityPatterns.hasSubExpressions) {
        flags.hasSubExpressions = true
      }
      if (stmt.securityPatterns.hasExpandableStrings) {
        flags.hasExpandableStrings = true
      }
      if (stmt.securityPatterns.hasScriptBlocks) {
        flags.hasScriptBlocks = true
      }
    }

    // Check element types for security patterns
    for (const cmd of stmt.commands) {
      if (!cmd.elementTypes) continue
      for (const et of cmd.elementTypes) {
        if (et === 'ScriptBlock') flags.hasScriptBlocks = true
        else if (et === 'SubExpression') flags.hasSubExpressions = true
        else if (et === 'ExpandableString') flags.hasExpandableStrings = true
        else if (et === 'MemberInvocation') flags.hasMemberInvocations = true
      }
    }
  }

  return flags
}

/**
 * A pipeline segment: a sequence of piped commands with their redirections.
 */
export type PipelineSegment = {
  commands: ParsedCommandElement[]
  redirections: ParsedRedirection[]
  nestedCommands?: ParsedCommandElement[]
}

/**
 * Get pipeline segments from a parsed command. Each top-level statement
 * that is a simple pipeline becomes one segment.
 */
export function getPipelineSegments(
  parsed: ParsedPowerShellCommand,
): PipelineSegment[] {
  return parsed.statements.map(stmt => ({
    commands: stmt.commands,
    redirections: stmt.redirections,
    nestedCommands: stmt.nestedCommands,
  }))
}

/**
 * Check if a redirection target is $null (discard, not a real file write).
 */
export function isNullRedirectionTarget(target: string): boolean {
  return /^\$null$/i.test(target.trim())
}

/**
 * Check if a string looks like a PowerShell parameter (starts with -).
 */
export function isPowerShellParameter(s: string): boolean {
  return s.startsWith('-')
}

/**
 * Get all command names across all statements (lowercased).
 */
export function getAllCommandNames(
  parsed: ParsedPowerShellCommand,
): string[] {
  const names: string[] = []
  for (const statement of parsed.statements) {
    for (const cmd of statement.commands) {
      names.push(cmd.name.toLowerCase())
    }
    if (statement.nestedCommands) {
      for (const cmd of statement.nestedCommands) {
        names.push(cmd.name.toLowerCase())
      }
    }
  }
  return names
}

/**
 * Get all commands as a flat list.
 */
export function getAllCommands(
  parsed: ParsedPowerShellCommand,
): ParsedCommandElement[] {
  const commands: ParsedCommandElement[] = []
  for (const statement of parsed.statements) {
    commands.push(...statement.commands)
    if (statement.nestedCommands) {
      commands.push(...statement.nestedCommands)
    }
  }
  return commands
}
