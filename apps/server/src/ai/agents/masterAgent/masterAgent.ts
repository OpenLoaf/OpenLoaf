import { ToolLoopAgent } from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { AgentFrame } from '@/ai/shared/context/requestContext'
import { buildToolset } from '@/ai/tools/toolRegistry'
import { createToolCallRepair } from '@/ai/agents/repairToolCall'
import { getPrimaryAgentDefinition } from '@/ai/shared/systemAgentDefinitions'
import { resolveToolIdsFromCapabilities } from '@/ai/tools/capabilityGroups'
import MASTER_AGENT_PROMPT_RAW from './masterAgentPrompt.zh.md'

/** Master agent display name. */
const MASTER_AGENT_NAME = 'MasterAgent'
/** Master agent id. */
const MASTER_AGENT_ID = 'master-agent'

/**
 * Derive master agent tool IDs from the primary agent definition's capabilities.
 * Includes requestUserInput as a special tool not in any capability group.
 */
function deriveMasterAgentToolIds(): string[] {
  const primaryDef = getPrimaryAgentDefinition()
  const toolIds = resolveToolIdsFromCapabilities(primaryDef.capabilities)
  // 逻辑：requestUserInput 是特殊工具，不属于任何能力组，单独追加。
  if (!toolIds.includes('request-user-input')) {
    toolIds.push('request-user-input')
  }
  return toolIds
}

/** Lazily computed default tool IDs for the master agent. */
let _cachedToolIds: string[] | null = null
function getMasterAgentToolIds(): string[] {
  if (!_cachedToolIds) {
    _cachedToolIds = deriveMasterAgentToolIds()
  }
  return _cachedToolIds
}

export type MasterAgentModelInfo = {
  /** Model provider name. */
  provider: string
  /** Model id. */
  modelId: string
}

type CreateMasterAgentInput = {
  /** Model instance for the agent. */
  model: LanguageModelV3
  /** Optional tool ids override. */
  toolIds?: readonly string[]
  /** Optional instructions override. */
  instructions?: string
}

/** Read base system prompt markdown content. */
export function readMasterAgentBasePrompt(): string {
  return MASTER_AGENT_PROMPT_RAW.trim()
}

/** Creates the master agent instance. */
export function createMasterAgent(input: CreateMasterAgentInput) {
  const toolIds = input.toolIds ?? getMasterAgentToolIds()
  const instructions = input.instructions || readMasterAgentBasePrompt()
  return new ToolLoopAgent({
    model: input.model,
    instructions,
    tools: buildToolset(toolIds),
    experimental_repairToolCall: createToolCallRepair(),
  })
}

/** Creates the frame metadata for the master agent. */
export function createMasterAgentFrame(input: {
  model: MasterAgentModelInfo
}): AgentFrame {
  return {
    kind: 'master',
    name: MASTER_AGENT_NAME,
    agentId: MASTER_AGENT_ID,
    path: [MASTER_AGENT_NAME],
    model: input.model,
  }
}
