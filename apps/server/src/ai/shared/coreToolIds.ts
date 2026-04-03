/**
 * Shared CORE_TOOL_IDS definitions for all agent types.
 *
 * Single source of truth — previously these were independently defined in
 * three places inside agentFactory.ts with inconsistent contents (TD-3).
 *
 * Variants:
 *  - MASTER_CORE_TOOL_IDS — full set used by master agents (includes Agent + SendMessage)
 *  - PM_CORE_TOOL_IDS     — same as master; PM agents have the same collaboration tools
 *  - SUB_AGENT_CORE_TOOL_IDS — subset for general-purpose sub-agents (no Agent/SendMessage)
 *  - CORE_TOOL_IDS        — base intersection shared by ALL agent types
 */

/** Base tool IDs shared by every agent type (intersection of all sets). */
export const CORE_TOOL_IDS = [
  'ToolSearch',
  'Bash',
  'Read',
  'Glob',
  'Grep',
  'Edit',
  'Write',
  'AskUserQuestion',
] as const

/** Full core tool set for master agents (includes agent collaboration tools). */
export const MASTER_CORE_TOOL_IDS = [
  ...CORE_TOOL_IDS,
  'Agent',
  'SendMessage',
] as const

/** Core tool set for PM agents — identical to master (PM coordinates sub-agents). */
export const PM_CORE_TOOL_IDS = MASTER_CORE_TOOL_IDS

/** Core tool set for general-purpose sub-agents — no agent collaboration tools. */
export const SUB_AGENT_CORE_TOOL_IDS = CORE_TOOL_IDS
