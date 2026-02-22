/**
 * 统一 Agent 工厂 — 合并 masterAgent + subAgentFactory + 内置 SubAgent 创建逻辑。
 */

import { ToolLoopAgent } from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import type { AgentFrame } from '@/ai/shared/context/requestContext'
import { buildToolset } from '@/ai/tools/toolRegistry'
import { createToolCallRepair } from '@/ai/shared/repairToolCall'
import {
  getTemplate,
  isTemplateId,
  getPrimaryTemplate,
} from '@/ai/agent-templates'
import type { AgentTemplate } from '@/ai/agent-templates'
import {
  readAgentConfigFromPath,
  type AgentConfig,
} from '@/ai/services/agentConfigService'
import { resolveAgentByName } from '@/ai/tools/AgentSelector'

// ---------------------------------------------------------------------------
// 模版工具 ID 解析
// ---------------------------------------------------------------------------

/** 从模版获取工具 ID 列表。 */
function resolveTemplateToolIds(template: AgentTemplate): readonly string[] {
  return template.toolIds
}

// ---------------------------------------------------------------------------
// Master Agent
// ---------------------------------------------------------------------------

/** Master agent display name. */
const MASTER_AGENT_NAME = 'MasterAgent'
/** Master agent id. */
const MASTER_AGENT_ID = 'master-agent'

export type MasterAgentModelInfo = {
  provider: string
  modelId: string
}

/** Read base system prompt markdown content. */
export function readMasterAgentBasePrompt(): string {
  return getPrimaryTemplate().systemPrompt
}

type CreateMasterAgentInput = {
  model: LanguageModelV3
  toolIds?: readonly string[]
  instructions?: string
}

/** Creates the master agent instance. */
export function createMasterAgent(input: CreateMasterAgentInput) {
  const template = getPrimaryTemplate()
  const toolIds = input.toolIds ?? resolveTemplateToolIds(template)
  const instructions = input.instructions || template.systemPrompt
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

// ---------------------------------------------------------------------------
// Sub-Agent
// ---------------------------------------------------------------------------

export type SubAgentType =
  | 'system'
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

  const mapped = LEGACY_ALIASES[lower] ?? lower
  if (isTemplateId(mapped)) return 'system'

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
  rawAgentType?: string
  modelOverride?: string
  skillRoots?: {
    projectRoot?: string
    parentRoots?: string[]
    workspaceRoot?: string
  }
  inlineConfig?: {
    systemPrompt?: string
    toolIds?: string[]
  }
}

/** Create a ToolLoopAgent instance by agentType. */
export function createSubAgent(input: CreateSubAgentInput): ToolLoopAgent {
  // 逻辑：内联配置 — 直接创建自定义 agent，优先级最高。
  if (input.inlineConfig?.systemPrompt || input.inlineConfig?.toolIds?.length) {
    const fallbackTemplate = getPrimaryTemplate()
    const toolIds = input.inlineConfig.toolIds?.length
      ? input.inlineConfig.toolIds
      : resolveTemplateToolIds(fallbackTemplate)
    const systemPrompt = input.inlineConfig.systemPrompt || '你是一个 AI 助手。'
    return new ToolLoopAgent({
      id: `inline-agent-${Date.now()}`,
      model: input.model,
      instructions: systemPrompt,
      tools: buildToolset(toolIds),
      experimental_repairToolCall: createToolCallRepair(),
    })
  }

  const effectiveName = resolveEffectiveAgentName(input.rawAgentType)

  // 逻辑：系统 Agent — 从模版查找定义。
  if (input.agentType === 'system') {
    const template = getTemplate(effectiveName)
    if (template) {
      const toolIds = resolveTemplateToolIds(template)
      const instructions =
        template.systemPrompt || `你是 ${template.name}。${template.description}`
      return new ToolLoopAgent({
        id: `system-agent-${template.id}`,
        model: input.model,
        instructions,
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

  // 逻辑：fallback 到 master 模版。
  const masterTpl = getPrimaryTemplate()
  const toolIds = resolveTemplateToolIds(masterTpl)
  return new ToolLoopAgent({
    id: 'fallback-master-agent',
    model: input.model,
    instructions:
      masterTpl.systemPrompt || `你是 ${masterTpl.name}。${masterTpl.description}`,
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
  const toolIds = config.toolIds
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
