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
  'MemorySave',
  'WebSearch',
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

/**
 * Core tool set for channel agents (WeChat / Slack / Telegram / 等 IM 通道).
 *
 * 与 base CORE_TOOL_IDS 一致——IM 通道的 ack / 超时兜底全部由 bridge 的独立 LLM
 * 路径（fastAgent / progress summarizer）直接发送，不经过 channel agent。分层清晰：
 * bridge = 首条回执 + 等待播报；channel agent = 真正的业务工作。
 */
export const CHANNEL_CORE_TOOL_IDS = CORE_TOOL_IDS

/**
 * 按 folderName 返回该 Agent 运行时真正"常驻"的 core 工具集。
 * UI 展示用——让 "已加载工具" 与 "懒加载工具" 能正确切分 agent.toolIds。
 *
 * - master / general-purpose / channel / explore → 对应 XXX_CORE_TOOL_IDS
 * - explore：没有 ToolSearch 懒加载机制（固定工具集全部 eager），core = 全部 toolIds
 * - 其他用户 Agent：保守返回 CORE_TOOL_IDS（最小常驻集合）
 */
export function resolveAgentCoreToolIds(
  folderName: string,
  allToolIds: readonly string[],
): string[] {
  switch (folderName) {
    case 'master':
      return [...MASTER_CORE_TOOL_IDS]
    case 'general-purpose':
      return [...SUB_AGENT_CORE_TOOL_IDS]
    case 'channel':
      return [...CHANNEL_CORE_TOOL_IDS]
    case 'explore':
      return [...allToolIds]
    default:
      return [...CORE_TOOL_IDS]
  }
}
