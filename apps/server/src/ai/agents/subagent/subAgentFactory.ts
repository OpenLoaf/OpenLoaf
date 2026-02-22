import { ToolLoopAgent } from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import { createTestApprovalSubAgent } from './testApprovalSubAgent'
import {
  readAgentConfigFromPath,
  type AgentConfig,
} from '@/ai/services/agentConfigService'
import {
  SYSTEM_AGENT_MAP,
  isSystemAgentId,
} from '@/ai/shared/systemAgentDefinitions'
import { resolveToolIdsFromCapabilities } from '@/ai/tools/capabilityGroups'
import { buildToolset } from '@/ai/tools/toolRegistry'
import { createToolCallRepair } from '@/ai/agents/repairToolCall'
import { resolveAgentByName } from '@/ai/tools/AgentSelector'

export type SubAgentType =
  | 'system'
  | 'test-approval'
  | 'default'
  | 'dynamic'

/** Legacy aliases for backward compatibility. */
const LEGACY_ALIASES: Record<string, string> = {
  default: 'master',
  browser: 'browser',
  browsersubagent: 'browser',
  'document-analysis': 'document',
  documentanalysissubagent: 'document',
}

/** Resolve raw agentType string to a known SubAgentType. */
export function resolveAgentType(raw?: string): SubAgentType {
  if (!raw) return 'default'
  const lower = raw.toLowerCase().trim()

  // 逻辑：test-approval 保留为特殊内置类型。
  if (lower === 'test-approval' || lower === 'testapprovalsubagent') {
    return 'test-approval'
  }

  // 逻辑：先查 legacy 别名映射。
  const mapped = LEGACY_ALIASES[lower] ?? lower

  // 逻辑：如果映射后是系统 Agent ID，标记为 system 类型。
  if (isSystemAgentId(mapped)) return 'system'

  return 'dynamic'
}

/** Resolve the effective agent name after legacy alias mapping. */
export function resolveEffectiveAgentName(raw?: string): string {
  if (!raw) return 'master'
  const lower = raw.toLowerCase().trim()
  return LEGACY_ALIASES[lower] ?? lower
}

export type CreateSubAgentInput = {
  agentType: SubAgentType
  model: LanguageModelV3
  /** Raw agent type name (for dynamic lookup). */
  rawAgentType?: string
  /** Model override from spawn-agent call. */
  modelOverride?: string
  /** Skill roots for resolving associated skills. */
  skillRoots?: {
    projectRoot?: string
    parentRoots?: string[]
    workspaceRoot?: string
  }
}

/** Create a ToolLoopAgent instance by agentType. */
export function createSubAgent(input: CreateSubAgentInput): ToolLoopAgent {
  const effectiveName = resolveEffectiveAgentName(input.rawAgentType)

  // 逻辑：test-approval 保留为特殊内置 Agent。
  if (input.agentType === 'test-approval') {
    return createTestApprovalSubAgent({ model: input.model })
  }

  // 逻辑：系统 Agent — 从 SYSTEM_AGENT_MAP 查找定义，用 capabilities 构建工具集。
  if (input.agentType === 'system') {
    const def = SYSTEM_AGENT_MAP.get(effectiveName)
    if (def) {
      const toolIds = resolveToolIdsFromCapabilities(def.capabilities)
      return new ToolLoopAgent({
        id: `system-agent-${def.id}`,
        model: input.model,
        instructions: `你是 ${def.name}。${def.description}`,
        tools: buildToolset(toolIds),
        experimental_repairToolCall: createToolCallRepair(),
      })
    }
  }

  // 逻辑：动态 Agent — 从文件系统查找 AGENT.md 配置。
  if (input.rawAgentType) {
    const dynamicAgent = tryCreateDynamicAgent(input)
    if (dynamicAgent) return dynamicAgent
  }

  // 逻辑：fallback 到 master Agent 定义。
  const masterDef = SYSTEM_AGENT_MAP.get('master')!
  const toolIds = resolveToolIdsFromCapabilities(masterDef.capabilities)
  return new ToolLoopAgent({
    id: 'fallback-master-agent',
    model: input.model,
    instructions: `你是 ${masterDef.name}。${masterDef.description}`,
    tools: buildToolset(toolIds),
    experimental_repairToolCall: createToolCallRepair(),
  })
}

/** Try to create a dynamic agent from AGENT.md. */
function tryCreateDynamicAgent(
  input: CreateSubAgentInput,
): ToolLoopAgent | null {
  if (!input.rawAgentType) return null

  const match = resolveAgentByName(
    input.rawAgentType,
    input.skillRoots ?? {},
  )
  if (!match) return null

  return createDynamicAgentFromConfig(match.config, input.model)
}

/** Create a ToolLoopAgent from an AgentConfig. */
export function createDynamicAgentFromConfig(
  config: AgentConfig,
  model: LanguageModelV3,
): ToolLoopAgent {
  const toolIds = resolveToolIdsFromCapabilities(config.capabilities)
  const systemPrompt =
    config.systemPrompt || `你是 ${config.name}。${config.description}`

  return new ToolLoopAgent({
    id: `dynamic-agent-${config.name}`,
    model,
    instructions: systemPrompt,
    tools: buildToolset(toolIds),
    experimental_repairToolCall: createToolCallRepair(),
  })
}
