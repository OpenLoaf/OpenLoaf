/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { z } from 'zod'

/** Tool approval rules schema — allow/deny string arrays. */
export const toolApprovalRulesSchema = z.object({
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
})

export type ToolApprovalRules = z.infer<typeof toolApprovalRulesSchema>

// ─── Rule parsing ───────────────────────────────────────────────────────────

export type ParsedRule = {
  toolName: string
  ruleContent?: string
}

/** Parse a rule string like `Bash(git *)` → `{ toolName, ruleContent }`. */
export function parseRuleString(rule: string): ParsedRule {
  const trimmed = rule.trim()
  const openIdx = trimmed.indexOf('(')
  if (openIdx === -1) return { toolName: trimmed }
  if (!trimmed.endsWith(')')) return { toolName: trimmed }
  const toolName = trimmed.substring(0, openIdx)
  const content = trimmed.substring(openIdx + 1, trimmed.length - 1)
  if (!content || content === '*') return { toolName }
  return { toolName, ruleContent: content }
}

/** Serialize a parsed rule back to string. */
export function ruleToString(parsed: ParsedRule): string {
  if (!parsed.ruleContent) return parsed.toolName
  return `${parsed.toolName}(${parsed.ruleContent})`
}

// ─── Rule suggestion (shared between server matcher and web "Always Allow") ──

/**
 * Map of tool IDs to the arg key that provides matchable content.
 * Kept here so both the server matcher and the frontend "Always Allow"
 * button can stay in sync. Bash + PowerShell both key off `command`;
 * Cloud generation tools key off `feature` so users can whitelist
 * per-capability (e.g. allow `text-to-image` but require approval for
 * `text-to-video`, which costs far more credits).
 */
export const TOOL_CONTENT_KEYS: Record<string, string> = {
  Bash: 'command',
  PowerShell: 'command',
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

/**
 * Generate a suggested allow rule from a tool call.
 * Used by the "Always Allow" button to propose a rule, and by the server
 * matcher as the canonical implementation.
 *
 * Behavior:
 *   - Bash / PowerShell: extract first 1-2 command tokens → `Tool(prefix *)`.
 *     If the command is unparseable, fall back to tool-level rule.
 *   - Edit / Write: use parent directory glob → `Tool(/dir/**)`. Files at
 *     the filesystem root fall back to tool-level rule.
 *   - Everything else: tool-level rule.
 */
export function suggestRule(
  toolId: string,
  args: Record<string, unknown>,
): string {
  const content = extractMatchContent(toolId, args)

  if ((toolId === 'Bash' || toolId === 'PowerShell') && typeof content === 'string') {
    const prefix = getCommandPrefix(content)
    if (prefix) return `${toolId}(${prefix} *)`
    return toolId
  }

  if ((toolId === 'Edit' || toolId === 'Write') && typeof content === 'string') {
    const dirGlob = getParentDirGlob(content)
    if (dirGlob) return `${toolId}(${dirGlob})`
    return toolId
  }

  return toolId
}

/** Extract the first 1-2 tokens of a command as a prefix. */
function getCommandPrefix(command: string): string | null {
  const trimmed = command.trim()
  if (!trimmed) return null
  const tokens = trimmed.split(/\s+/)
  if (tokens.length === 0) return null

  if (tokens.length === 1) return tokens[0]!

  const first = tokens[0]!
  const second = tokens[1]!

  // Subcommand-style: "git push", "docker compose", "npm run", "Get-Content"
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

// ─── Rule description (human-readable label for UI) ─────────────────────────

/**
 * Structured description of a rule string, ready for UI rendering.
 *
 * The frontend maps `labelKey` to an i18n translation (or falls back to
 * `toolName` for unknown tools) and shows `detail` as a muted code span.
 * `detail === null` signals a tool-level rule ("any" scope).
 */
export type RuleDescription = {
  /** i18n key under `toolApproval.describe.*`, or null for unknown tools. */
  labelKey: string | null
  /** Raw tool identifier — used when labelKey is null. */
  toolName: string
  /** Rule content (command prefix / path glob / literal). `null` = tool-level. */
  detail: string | null
  /** Original rule string, useful for tooltips and aria-label. */
  rawRule: string
}

const DESCRIBE_LABEL_KEYS: Record<string, string> = {
  Bash: 'toolApproval.describe.bash',
  PowerShell: 'toolApproval.describe.powershell',
  Edit: 'toolApproval.describe.edit',
  Write: 'toolApproval.describe.write',
  Read: 'toolApproval.describe.read',
  Glob: 'toolApproval.describe.glob',
  Grep: 'toolApproval.describe.grep',
}

/** Parse a rule string into UI-renderable fields. */
export function describeRule(rule: string): RuleDescription {
  const parsed = parseRuleString(rule)
  return {
    labelKey: DESCRIBE_LABEL_KEYS[parsed.toolName] ?? null,
    toolName: parsed.toolName,
    detail: parsed.ruleContent ?? null,
    rawRule: rule,
  }
}
