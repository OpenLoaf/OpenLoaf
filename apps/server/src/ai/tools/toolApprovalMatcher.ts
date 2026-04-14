/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import picomatch from 'picomatch'
// @ts-expect-error -- shell-quote has no bundled types
import { parse as shellParse } from 'shell-quote'
import {
  extractMatchContent,
  parseRuleString,
  ruleToString,
  suggestRule,
  type ParsedRule,
  type ToolApprovalRules,
} from '@openloaf/api/types/toolApproval'

// Re-export the shared helpers so existing consumers keep their import path.
export { extractMatchContent, parseRuleString, ruleToString, suggestRule }
export type { ParsedRule }

// ─── Matching ───────────────────────────────────────────────────────────────

/** Check if a single rule matches a tool call. */
export function doesRuleMatch(
  rule: string,
  toolId: string,
  matchContent?: string,
): boolean {
  const parsed = parseRuleString(rule)

  // Tool name must match
  if (parsed.toolName !== toolId) return false

  // Tool-level rule (no content) → matches all calls of this tool
  if (!parsed.ruleContent) return true

  // Content rule but no content to match → no match
  if (matchContent === undefined) return false

  // For file-path tools, use glob matching
  if (toolId === 'Edit' || toolId === 'Write' || toolId === 'Read' || toolId === 'Glob' || toolId === 'Grep') {
    return picomatch.isMatch(matchContent, parsed.ruleContent, { dot: true })
  }

  // For Bash commands, use wildcard matching — but first verify the raw command is a single
  // safe segment. Without this, `Bash(git *)` would match `git push; rm -rf /` because the
  // regex treats the whole string as one blob (security bypass).
  if (toolId === 'Bash') {
    if (!isSingleSafeCommandSegment(matchContent)) return false
    return matchShellWildcard(parsed.ruleContent, matchContent)
  }

  // PowerShell has the same integer-string bypass as Bash: `PowerShell(Get-ChildItem *)`
  // would match `Get-ChildItem C:\; Remove-Item -Recurse C:\Users\x` if we don't reject
  // any command combinator / subexpression / escape that could smuggle a second command.
  // shell-quote doesn't understand PowerShell syntax, so we use a conservative
  // character-based blacklist.
  if (toolId === 'PowerShell') {
    if (!isSinglePowerShellSegment(matchContent)) return false
    return matchShellWildcard(parsed.ruleContent, matchContent)
  }

  return matchShellWildcard(parsed.ruleContent, matchContent)
}

/**
 * Return true only when `command` is a single PowerShell command with no command
 * combinators (`;` `&&` `||` `|`), no subexpression (`$(...)`), no backtick escape
 * (which is also PowerShell's line-continuation / escape char and can hide content),
 * and no newline. Conservative by design — blocks pipelines too, because a pipeline
 * can end in a destructive cmdlet (`Get-ChildItem | Remove-Item`).
 */
function isSinglePowerShellSegment(command: string): boolean {
  if (!command) return false
  if (command.includes('\n')) return false
  // Command chaining / separators
  if (command.includes(';')) return false
  if (command.includes('&&') || command.includes('||')) return false
  // Pipeline — in PowerShell pipes are the normal data-flow channel, but a
  // pipeline target can execute arbitrary cmdlets on the piped objects, so we
  // reject to stay aligned with the Bash policy.
  if (command.includes('|')) return false
  // Subexpression $(...) — interpolates command output even inside "..." strings.
  if (command.includes('$(')) return false
  // Backtick is PowerShell's escape char AND line continuation. Used to hide
  // newlines or escape quotes — conservative: reject outright.
  if (command.includes('`')) return false
  return true
}

/**
 * Return true only when `command` is a single shell command with no combinators,
 * substitutions, redirections, backticks, ANSI-C quotes, or newlines. Used as a
 * precondition for applying Bash allow rules — any multi-command or injection
 * vector forces the allow rule to miss, so the command falls through to the
 * default sandbox/approval check.
 */
const SHELL_DANGEROUS_OPS = new Set([';', '&&', '||', '|', '|&', ';;', '&', '(', ')'])
const SHELL_REDIRECT_OPS = new Set(['>', '>>', '<', '<<', '>&', '<&', '<>'])

type ShellToken = string | { op: string } | { pattern: string } | { comment: string }

function isSingleSafeCommandSegment(command: string): boolean {
  if (!command) return false
  // ANSI-C quotes ($'…') can encode arbitrary bytes including separators.
  if (/\$'/.test(command)) return false
  // Backticks are command substitution; shell-quote keeps them in string tokens.
  if (command.includes('`')) return false
  // Multi-line commands are treated per-line elsewhere; reject here.
  if (command.includes('\n')) return false

  let tokens: ShellToken[]
  try {
    tokens = shellParse(command) as ShellToken[]
  } catch {
    return false
  }

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!
    if (typeof token === 'object' && 'op' in token) {
      const op = token.op
      if (SHELL_DANGEROUS_OPS.has(op) || SHELL_REDIRECT_OPS.has(op)) return false
    }
    // Detect $() command substitution: "$" followed by "(" op
    if (typeof token === 'string' && token === '$' && i + 1 < tokens.length) {
      const next = tokens[i + 1]!
      if (typeof next === 'object' && 'op' in next && next.op === '(') return false
    }
  }
  return true
}

/** Simple wildcard matching for shell commands: * matches any chars. */
function matchShellWildcard(pattern: string, command: string): boolean {
  // Exact match
  if (pattern === command) return true

  // No wildcards → exact only
  if (!pattern.includes('*')) return false

  // Convert pattern to regex: escape special chars, * → .*
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  const regexStr = escaped.replace(/\*/g, '.*')

  // Special: trailing " *" is optional (so "git *" matches "git" too)
  let finalRegex = regexStr
  if (finalRegex.endsWith(' .*') && (pattern.match(/\*/g) || []).length === 1) {
    finalRegex = finalRegex.slice(0, -3) + '( .*)?'
  }

  try {
    return new RegExp(`^${finalRegex}$`, 's').test(command)
  } catch {
    return false
  }
}

// ─── Evaluation ─────────────────────────────────────────────────────────────

export type EvaluationResult = 'allow' | 'deny' | 'unmatched'

/**
 * Evaluate tool approval rules against a tool call.
 * Deny rules take precedence over allow rules.
 */
export function evaluateToolRules(
  rules: ToolApprovalRules,
  toolId: string,
  args: Record<string, unknown>,
): EvaluationResult {
  const content = extractMatchContent(toolId, args)

  // Check deny rules first (higher priority)
  const denyRules = rules.deny ?? []
  for (const rule of denyRules) {
    if (doesRuleMatch(rule, toolId, content)) return 'deny'
  }

  // Check allow rules
  const allowRules = rules.allow ?? []
  for (const rule of allowRules) {
    if (doesRuleMatch(rule, toolId, content)) return 'allow'
  }

  return 'unmatched'
}

// ─── Rule merging ───────────────────────────────────────────────────────────

/** Merge multiple rule sets (later sources take precedence via dedup). */
export function mergeToolApprovalRules(
  ...sources: (ToolApprovalRules | undefined)[]
): ToolApprovalRules {
  const allow = new Set<string>()
  const deny = new Set<string>()

  for (const source of sources) {
    if (!source) continue
    for (const rule of source.allow ?? []) allow.add(rule)
    for (const rule of source.deny ?? []) deny.add(rule)
  }

  return {
    allow: allow.size > 0 ? [...allow] : undefined,
    deny: deny.size > 0 ? [...deny] : undefined,
  }
}

/** Check if a rules object has any rules. */
export function hasToolApprovalRules(rules?: ToolApprovalRules): boolean {
  if (!rules) return false
  return (rules.allow?.length ?? 0) > 0 || (rules.deny?.length ?? 0) > 0
}
