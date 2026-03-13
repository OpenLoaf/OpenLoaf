/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * 统一 Agent 工厂 — Master Agent + 行为驱动子 Agent。
 *
 * 子 Agent 类型：
 * - general-purpose: 通用（tool-search + 全量工具）
 * - explore: 只读代码库探索（固定工具集）
 * - plan: 只读架构方案设计（固定工具集）
 * - dynamic: 从文件系统 AGENT.md 加载
 */

import {
  ToolLoopAgent,
  stepCountIs,
  wrapLanguageModel,
  addToolInputExamplesMiddleware,
} from 'ai'
import type {
  LanguageModelV3,
} from '@ai-sdk/provider'
import type { PrepareStepFunction, StopCondition } from 'ai'
import { getRequestContext, type AgentFrame } from '@/ai/shared/context/requestContext'
import { buildToolset } from '@/ai/tools/toolRegistry'
import { filterToolIdsByPlatform } from '@/ai/tools/toolPlatformFilter'
import { createToolCallRepair } from '@/ai/shared/repairToolCall'
import { ActivatedToolSet } from '@/ai/tools/toolSearchState'
import { createToolSearchTool } from '@/ai/tools/toolSearchTool'
import {
  getPrimaryTemplate,
  getMasterPrompt,
} from '@/ai/agent-templates'
import type { AgentTemplate } from '@/ai/agent-templates'
import { logger } from '@/common/logger'
import {
  readAgentConfigFromPath,
  type AgentConfig,
} from '@/ai/services/agentConfigService'
import { resolveAgentByName } from '@/ai/tools/AgentSelector'
import { buildHardRules } from '@/ai/shared/hardRules'
import { buildToolSearchGuidance } from '@/ai/shared/toolSearchGuidance'

// ---------------------------------------------------------------------------
// 子 Agent 行为类型
// ---------------------------------------------------------------------------

/** 内置子 Agent 类型 ID。 */
export type BuiltinSubAgentType = 'general-purpose' | 'explore' | 'plan'

/** explore / plan 共用的只读工具集。 */
const READ_ONLY_TOOL_IDS = ['read-file', 'list-dir', 'grep-files', 'project-query'] as const

/** 判断是否为内置子 Agent 类型。 */
export function isBuiltinSubAgentType(type: string): type is BuiltinSubAgentType {
  return type === 'general-purpose' || type === 'explore' || type === 'plan'
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
export function readMasterAgentBasePrompt(lang?: string): string {
  return getMasterPrompt(lang)
}

type CreateMasterAgentInput = {
  model: LanguageModelV3
  instructions?: string
}

// ---------------------------------------------------------------------------
// Step limits — prevent infinite tool loops (MAST FM-1.3)
// ---------------------------------------------------------------------------
const MASTER_HARD_MAX_STEPS = 30
const SUB_AGENT_MAX_STEPS = 15

// ---------------------------------------------------------------------------
// ToolSearch Pull 模式 — prepareStep + ActivatedToolSet
// ---------------------------------------------------------------------------

/** Core tool IDs that are always visible (never deferred). */
const CORE_TOOL_IDS = ['tool-search', 'load-skill'] as const

/**
 * Creates a prepareStep that only exposes tool-search + dynamically activated tools.
 */
function createToolSearchPrepareStep(
  allToolIds: readonly string[],
  activatedSet: ActivatedToolSet,
): PrepareStepFunction {
  return () => {
    const activeToolIds = activatedSet.getActiveToolIds()
    const activeTools = allToolIds.filter((id) => activeToolIds.includes(id))
    // Ensure tool-search is always visible
    if (!activeTools.includes('tool-search')) activeTools.push('tool-search')
    return { activeTools }
  }
}


// ---------------------------------------------------------------------------
// 动态步数预算 — 自适应 StopCondition (Anthropic Best Practice)
// ---------------------------------------------------------------------------

/**
 * 根据前几步的工具调用模式动态判断任务复杂度，收紧步数上限。
 *
 * - 无工具调用（纯文本对话）→ 5 步上限
 * - 1-3 个工具调用（中等任务）→ 15 步上限
 * - 4+ 个工具调用或含 spawn-agent（复杂任务）→ 不额外限制（由硬上限控制）
 */
function dynamicStepLimit(): StopCondition<Record<string, never>> {
  return ({ steps }: { steps: ReadonlyArray<{ toolCalls: ReadonlyArray<{ toolName: string }> }> }) => {
    const totalToolCalls = steps.reduce(
      (sum: number, s: { toolCalls: ReadonlyArray<{ toolName: string }> }) => sum + s.toolCalls.length,
      0,
    )
    const hasAgentSpawn = steps.some(
      (s: { toolCalls: ReadonlyArray<{ toolName: string }> }) =>
        s.toolCalls.some((tc: { toolName: string }) => tc.toolName === 'spawn-agent'),
    )
    const currentStep = steps.length

    // 复杂任务：不额外限制
    if (totalToolCalls >= 4 || hasAgentSpawn) return false
    // 中等任务
    if (totalToolCalls >= 1) return currentStep >= 15
    // 纯文本对话
    return currentStep >= 5
  }
}

// ---------------------------------------------------------------------------
// Model wrapping — inputExamples middleware (Anthropic Best Practice)
// ---------------------------------------------------------------------------

/** 包装模型以启用工具输入示例中间件。 */
function wrapModelWithExamples(model: LanguageModelV3): LanguageModelV3 {
  return wrapLanguageModel({
    model,
    middleware: addToolInputExamplesMiddleware(),
  }) as unknown as LanguageModelV3
}

/** Creates the master agent instance. */
export function createMasterAgent(input: CreateMasterAgentInput) {
  const template = getPrimaryTemplate()
  const instructions = input.instructions || template.systemPrompt
  const wrappedModel = wrapModelWithExamples(input.model)

  // ToolSearch Pull mode — filter by client platform
  const ctx = getRequestContext()
  const coreToolIds = [...CORE_TOOL_IDS] as string[]
  const filteredDeferredToolIds = filterToolIdsByPlatform(
    template.deferredToolIds ?? [],
    ctx?.clientPlatform,
  )
  const allToolIds = [...new Set([...coreToolIds, ...filteredDeferredToolIds])]

  // Build full toolset (all tools registered, but only core visible via activeTools)
  const tools = buildToolset(allToolIds)

  // Create per-session ActivatedToolSet
  const activatedSet = new ActivatedToolSet(coreToolIds)

  // Inject tool-search (dynamically created, closes over activatedSet)
  tools['tool-search'] = createToolSearchTool(activatedSet, new Set(allToolIds))

  // ★ Append Hard Rules to instructions (Layer 2)
  // ToolSearch guidance is injected via session preface (platform-aware).
  const hardRules = buildHardRules()
  const finalInstructions = `${instructions}\n\n${hardRules}`

  const baseSettings = {
    model: wrappedModel,
    instructions: finalInstructions,
    tools,
    stopWhen: [stepCountIs(MASTER_HARD_MAX_STEPS), dynamicStepLimit()] as StopCondition<any>[],
    experimental_repairToolCall: createToolCallRepair(),
  }
  // Inject prepareStep — ToolSearch pull mode
  Object.assign(baseSettings, {
    prepareStep: createToolSearchPrepareStep(allToolIds, activatedSet),
  })

  return new ToolLoopAgent(baseSettings)
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
// Sub-Agent Creation
// ---------------------------------------------------------------------------

export type CreateSubAgentInput = {
  /** 子 Agent 类型字符串（general-purpose / explore / plan / 自定义名称）。 */
  subagentType?: string
  model: LanguageModelV3
  skillRoots?: {
    projectRoot?: string
    parentRoots?: string[]
    globalRoot?: string
  }
}

/** Create a ToolLoopAgent instance by subagent_type. */
export function createSubAgent(input: CreateSubAgentInput): ToolLoopAgent {
  const wrappedModel = wrapModelWithExamples(input.model)
  const effectiveType = (input.subagentType || 'general-purpose').toLowerCase().trim()

  // 内置类型
  if (effectiveType === 'general-purpose') {
    return createGeneralPurposeSubAgent(wrappedModel)
  }
  if (effectiveType === 'explore') {
    return createExploreSubAgent(wrappedModel)
  }
  if (effectiveType === 'plan') {
    return createPlanSubAgent(wrappedModel)
  }

  // 动态 Agent — 从文件系统查找 AGENT.md
  const dynamicAgent = tryCreateDynamicAgent(effectiveType, input.skillRoots, wrappedModel)
  if (dynamicAgent) return dynamicAgent

  // Fallback → general-purpose
  logger.warn(
    { subagentType: input.subagentType },
    '[agent-factory] No matching agent type found, falling back to general-purpose',
  )
  return createGeneralPurposeSubAgent(wrappedModel)
}

/** Create a general-purpose sub-agent with tool-search + full deferred toolset (excluding agent collaboration tools). */
function createGeneralPurposeSubAgent(model: LanguageModelV3): ToolLoopAgent {
  const masterTpl = getPrimaryTemplate()
  const ctx = getRequestContext()
  const coreToolIds = ['tool-search'] as string[]
  const deferredToolIds = filterToolIdsByPlatform(
    (masterTpl.deferredToolIds ?? []).filter((id) => !AGENT_TOOL_IDS_TO_EXCLUDE.has(id)),
    ctx?.clientPlatform,
  )
  const allToolIds = [...new Set([...coreToolIds, ...deferredToolIds])]

  const tools = buildToolset(allToolIds)
  const activatedSet = new ActivatedToolSet(coreToolIds)
  tools['tool-search'] = createToolSearchTool(activatedSet, new Set(allToolIds))

  // 使用与主 Agent 相同的完整 instructions（sub-agent 不共享 preface，需自带 guidance）
  const basePrompt = masterTpl.systemPrompt
  const finalInstructions = `${basePrompt}\n\n${buildHardRules()}\n\n${buildToolSearchGuidance(ctx?.clientPlatform)}`

  return new ToolLoopAgent({
    id: `sub-agent-general-${Date.now()}`,
    model,
    instructions: finalInstructions,
    tools,
    stopWhen: stepCountIs(SUB_AGENT_MAX_STEPS),
    experimental_repairToolCall: createToolCallRepair(),
    prepareStep: createToolSearchPrepareStep(allToolIds, activatedSet),
  })
}

/** Create an explore sub-agent (read-only, fixed tools). */
function createExploreSubAgent(model: LanguageModelV3): ToolLoopAgent {
  const instructions = [
    '你是一个代码库探索专用子代理。你的任务是快速搜索和分析代码库。',
    '',
    '你可以使用以下工具：',
    '- read-file: 读取文件内容',
    '- list-dir: 列出目录内容',
    '- grep-files: 搜索文件内容',
    '- project-query: 查询项目数据',
    '',
    '注意：你是只读的，不能修改任何文件。专注于搜索、分析和回答问题。',
  ].join('\n')

  return new ToolLoopAgent({
    id: `sub-agent-explore-${Date.now()}`,
    model,
    instructions,
    tools: buildToolset([...READ_ONLY_TOOL_IDS]),
    stopWhen: stepCountIs(SUB_AGENT_MAX_STEPS),
    experimental_repairToolCall: createToolCallRepair(),
  })
}

/** Create a plan sub-agent (read-only, fixed tools, architecture focus). */
function createPlanSubAgent(model: LanguageModelV3): ToolLoopAgent {
  const instructions = [
    '你是一个架构方案设计专用子代理。你的任务是分析代码库并设计实现方案。',
    '',
    '你可以使用以下工具：',
    '- read-file: 读取文件内容',
    '- list-dir: 列出目录内容',
    '- grep-files: 搜索文件内容',
    '- project-query: 查询项目数据',
    '',
    '注意：你是只读的，不能修改任何文件。专注于分析架构、识别关键文件、评估权衡，输出分步实现计划。',
  ].join('\n')

  return new ToolLoopAgent({
    id: `sub-agent-plan-${Date.now()}`,
    model,
    instructions,
    tools: buildToolset([...READ_ONLY_TOOL_IDS]),
    stopWhen: stepCountIs(SUB_AGENT_MAX_STEPS),
    experimental_repairToolCall: createToolCallRepair(),
  })
}

/** Try to create a dynamic agent from AGENT.md. */
function tryCreateDynamicAgent(
  agentName: string,
  skillRoots: CreateSubAgentInput['skillRoots'],
  model: LanguageModelV3,
): ToolLoopAgent | null {
  const match = resolveAgentByName(agentName, skillRoots ?? {})
  if (!match) return null
  return createDynamicAgentFromConfig(match.config, model)
}

/** Agent 协作工具 ID（general-purpose 子 agent 不可用）。 */
const AGENT_TOOL_IDS_TO_EXCLUDE = new Set(['spawn-agent', 'send-input', 'wait-agent', 'abort-agent'])

/** Agent collaboration tool IDs that are auto-injected when allowSubAgents is true. */
const AGENT_COLLAB_TOOL_IDS = ['spawn-agent', 'send-input', 'wait-agent', 'abort-agent']

/** Ensure agent collaboration tools are included when allowSubAgents is enabled. */
function ensureAgentToolIds(toolIds: readonly string[], allowSubAgents?: boolean): string[] {
  if (!allowSubAgents) return [...toolIds]
  const effectiveToolIds = [...toolIds]
  for (const id of AGENT_COLLAB_TOOL_IDS) {
    if (!effectiveToolIds.includes(id)) effectiveToolIds.push(id)
  }
  return effectiveToolIds
}

/** Create a ToolLoopAgent from an AgentConfig. */
export function createDynamicAgentFromConfig(
  config: AgentConfig,
  model: LanguageModelV3,
): ToolLoopAgent {
  const toolIds = ensureAgentToolIds(config.toolIds, config.allowSubAgents)
  const systemPrompt =
    config.systemPrompt || `你是 ${config.name}。${config.description}`

  return new ToolLoopAgent({
    id: `dynamic-agent-${config.name}`,
    model: wrapModelWithExamples(model),
    instructions: systemPrompt,
    tools: buildToolset(toolIds),
    stopWhen: stepCountIs(SUB_AGENT_MAX_STEPS),
    experimental_repairToolCall: createToolCallRepair(),
  })
}

/** Resolve the effective sub-agent type for display/logging. */
export function resolveEffectiveAgentName(raw?: string): string {
  if (!raw) return 'general-purpose'
  return raw.toLowerCase().trim()
}
