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
import type { ToolApprovalRules } from '@openloaf/api/types/toolApproval'

// ─── Rule parsing ───────────────────────────────────────────────────────────

export type ParsedRule = {
  toolName: string
  ruleContent?: string
}

/** Parse rule string like "Bash(git *)" → { toolName: "Bash", ruleContent: "git *" } */
export function parseRuleString(rule: string): ParsedRule {
  const trimmed = rule.trim()
  const openIdx = trimmed.indexOf('(')
  if (openIdx === -1) {
    return { toolName: trimmed }
  }
  if (!trimmed.endsWith(')')) {
    return { toolName: trimmed }
  }
  const toolName = trimmed.substring(0, openIdx)
  const content = trimmed.substring(openIdx + 1, trimmed.length - 1)
  if (!content || content === '*') {
    return { toolName }
  }
  return { toolName, ruleContent: content }
}

/** Serialize a parsed rule back to string. */
export function ruleToString(parsed: ParsedRule): string {
  if (!parsed.ruleContent) return parsed.toolName
  return `${parsed.toolName}(${parsed.ruleContent})`
}

// ─── Content extraction ─────────────────────────────────────────────────────

/** Map of tool IDs to the arg key that provides matchable content. */
const TOOL_CONTENT_KEYS: Record<string, string> = {
  Bash: 'command',
  Edit: 'file_path',
  Write: 'file_path',
  Read: 'file_path',
  Glob: 'path',
  Grep: 'path',
}

/** Extract the matchable content from tool call args. */
export function extractMatchContent(
  toolId: string,
  args: Record<string, unknown>,
): string | undefined {
  const key = TOOL_CONTENT_KEYS[toolId]
  if (!key) return undefined
  const value = args[key]
  return typeof value === 'string' ? value : undefined
}

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

  // For Bash commands, use wildcard matching
  return matchShellWildcard(parsed.ruleContent, matchContent)
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

// ─── Rule suggestion ────────────────────────────────────────────────────────

/**
 * Generate a suggested allow rule from a tool call.
 * Used by the "Always Allow" button to propose a rule.
 */
export function suggestRule(
  toolId: string,
  args: Record<string, unknown>,
): string {
  const content = extractMatchContent(toolId, args)

  if (toolId === 'Bash' && typeof content === 'string') {
    // Extract first word(s) as prefix
    const prefix = getCommandPrefix(content)
    if (prefix) return `Bash(${prefix} *)`
    return 'Bash'
  }

  if ((toolId === 'Edit' || toolId === 'Write') && typeof content === 'string') {
    // Suggest parent directory glob
    const dirGlob = getParentDirGlob(content)
    if (dirGlob) return `${toolId}(${dirGlob})`
    return toolId
  }

  // For other tools, suggest tool-level rule
  return toolId
}

/** Extract the first 1-2 tokens of a command as a prefix. */
function getCommandPrefix(command: string): string | null {
  const trimmed = command.trim()
  const tokens = trimmed.split(/\s+/)
  if (tokens.length === 0) return null

  // Single-word commands like "git", "npm" → return as-is
  if (tokens.length === 1) return tokens[0]!

  // Two-word prefix for common patterns: "git push", "npm run"
  const first = tokens[0]!
  const second = tokens[1]!

  // Subcommand-style: "git push", "docker compose", "npm run"
  if (/^[a-zA-Z][\w-]*$/.test(second) && second.length < 20) {
    return `${first} ${second}`
  }

  return first
}

/** Extract parent directory as a glob pattern. */
function getParentDirGlob(filePath: string): string | null {
  const lastSlash = filePath.lastIndexOf('/')
  if (lastSlash <= 0) return null
  const dir = filePath.substring(0, lastSlash)
  return `${dir}/**`
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
