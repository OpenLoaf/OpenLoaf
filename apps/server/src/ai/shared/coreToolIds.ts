/**
 * Shared CORE_TOOL_IDS definitions for all agent types.
 *
 * Single source of truth — previously these were independently defined in
 * three places inside agentFactory.ts with inconsistent contents (TD-3).
 *
 * Variants:
 *  - MASTER_CORE_TOOL_IDS — full set used by master agents (includes Agent)
 *  - PM_CORE_TOOL_IDS     — same as master; PM agents have the same collaboration tools
 *  - SUB_AGENT_CORE_TOOL_IDS — subset for general-purpose sub-agents (no Agent)
 *  - CORE_TOOL_IDS        — base intersection shared by ALL agent types
 *
 * SendMessage and SubmitPlan are NOT core — they are deferred and loaded on
 * demand. They only become useful after specific downstream events (spawning
 * an agent via Agent, or receiving a PLAN_N.md from a plan subagent), so
 * keeping them out of the always-loaded set avoids burning core slots on
 * tools that idle 99% of conversations.
 */

/**
 * Platform-conditional shell tool ID. On Windows, the core shell tool is
 * PowerShell (native cmdlet syntax + version-aware approval); on macOS/Linux
 * it is Bash. Expressed as a union-typed constant so the surrounding
 * CORE_TOOL_IDS array stays `readonly` without losing literal-type inference.
 */
export const SHELL_TOOL_ID: 'PowerShell' | 'Bash' =
  process.platform === 'win32' ? 'PowerShell' : 'Bash'

/** Base tool IDs shared by every agent type (intersection of all sets). */
export const CORE_TOOL_IDS = [
  'ToolSearch',
  'LoadSkill',
  SHELL_TOOL_ID,
  'Read',
  'Glob',
  'Grep',
  'Edit',
  'Write',
  'AskUserQuestion',
  'MemorySave',
] as const

/** Full core tool set for master agents (adds Agent for subagent delegation). */
export const MASTER_CORE_TOOL_IDS = [
  ...CORE_TOOL_IDS,
  'Agent',
] as const

/**
 * Core tool set for PM agents.
 *
 * PM's entire job is coordinating specialists via SendMessage, so unlike
 * master agents (where SendMessage is deferred because most conversations
 * don't spawn agents) PM must have SendMessage always loaded.
 */
export const PM_CORE_TOOL_IDS = [
  ...MASTER_CORE_TOOL_IDS,
  'SendMessage',
] as const

/** Core tool set for general-purpose sub-agents — no agent collaboration tools. */
export const SUB_AGENT_CORE_TOOL_IDS = CORE_TOOL_IDS
