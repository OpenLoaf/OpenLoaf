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
  extractReasoningMiddleware,
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
  getPMPrompt,
  PM_AGENT_TOOL_IDS,
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
import { isWebSearchConfigured } from '@/ai/tools/webSearchTool'

// ---------------------------------------------------------------------------
// 子 Agent 行为类型
// ---------------------------------------------------------------------------

/** 内置子 Agent 类型 ID。 */
export type BuiltinSubAgentType =
  | 'general-purpose'
  | 'explore'
  | 'plan'
  | 'doc-editor'
  | 'browser'
  | 'data-analyst'
  | 'extractor'
  | 'canvas-designer'
  | 'coder'

/** explore / plan 共用的只读工具集。 */
const READ_ONLY_TOOL_IDS = ['read-file', 'list-dir', 'grep-files', 'project-query'] as const

/** 内置子 Agent 类型集合。 */
const BUILTIN_SUB_AGENT_TYPES = new Set<string>([
  'general-purpose', 'explore', 'plan',
  'doc-editor', 'browser', 'data-analyst', 'extractor', 'canvas-designer', 'coder',
])

/** 判断是否为内置子 Agent 类型。 */
export function isBuiltinSubAgentType(type: string): type is BuiltinSubAgentType {
  return BUILTIN_SUB_AGENT_TYPES.has(type)
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
function readMasterAgentBasePrompt(lang?: string): string {
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
 * Activation guard for ToolSearch pull mode.
 *
 * Problem: AI SDK's activeTools only controls which tool schemas are SENT to the
 * model, but doesn't prevent execution of non-active tools. When a model calls a
 * registered-but-unloaded tool, the SDK still validates/executes it — and the model
 * gets generic validation errors instead of "load this tool first via tool-search".
 * Weak models then repeatedly guess parameters instead of calling tool-search.
 *
 * Solution: Wrap execute() so that calling an unloaded tool immediately returns a
 * clear error directing the model to use tool-search. Also bypass needsApproval
 * for unloaded tools so the error surfaces directly (no broken approval UI).
 */
function applyActivationGuard(
  tools: Record<string, any>,
  activatedSet: ActivatedToolSet,
  coreToolIds: readonly string[],
): void {
  const coreSet = new Set(coreToolIds)
  for (const toolId of Object.keys(tools)) {
    if (coreSet.has(toolId)) continue
    const tool = tools[toolId]
    const originalExecute = tool.execute
    if (typeof originalExecute !== 'function') continue
    const originalNeedsApproval = tool.needsApproval

    tools[toolId] = {
      ...tool,
      execute: async (input: any, options: any) => {
        if (!activatedSet.isActive(toolId)) {
          throw new Error(
            `Tool "${toolId}" has not been loaded. You must call tool-search(query: "select:${toolId}") to load it first, then call it again with the correct parameters.`
          )
        }
        return originalExecute(input, options)
      },
      needsApproval: originalNeedsApproval
        ? (input: any) => {
            if (!activatedSet.isActive(toolId)) return false
            return typeof originalNeedsApproval === 'function'
              ? originalNeedsApproval(input)
              : originalNeedsApproval
          }
        : originalNeedsApproval,
    }
  }
}

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

/**
 * 包装模型以启用中间件：
 * 1. addToolInputExamplesMiddleware — 工具输入示例（Anthropic Best Practice）
 * 2. extractReasoningMiddleware — 提取 <think> 标签为 reasoning 部分
 *    适用于 DeepSeek R1/V3、MiniMax、Qwen QwQ、Kimi 等使用 <think> 标签的模型。
 *    对原生支持 reasoning 的模型（Claude、OpenAI o1）无副作用。
 */
function wrapModelWithExamples(model: LanguageModelV3): LanguageModelV3 {
  return wrapLanguageModel({
    model,
    middleware: [
      extractReasoningMiddleware({ tagName: 'think', startWithReasoning: true }),
      addToolInputExamplesMiddleware(),
    ],
  }) as unknown as LanguageModelV3
}

/** Creates the master agent instance. */
export function createMasterAgent(input: CreateMasterAgentInput) {
  const template = getPrimaryTemplate()
  const instructions = input.instructions || template.systemPrompt
  const wrappedModel = wrapModelWithExamples(input.model)

  // ToolSearch Pull mode — filter by client platform and feature flags
  const ctx = getRequestContext()
  const coreToolIds = [...CORE_TOOL_IDS] as string[]
  let filteredDeferredToolIds = filterToolIdsByPlatform(
    template.deferredToolIds ?? [],
    ctx?.clientPlatform,
  )
  // web-search requires configured provider + API key
  if (!isWebSearchConfigured()) {
    filteredDeferredToolIds = filteredDeferredToolIds.filter((id) => id !== 'web-search')
  }
  const allToolIds = [...new Set([...coreToolIds, ...filteredDeferredToolIds])]

  // Build full toolset (all tools registered, but only core visible via activeTools)
  const tools = buildToolset(allToolIds)

  // Create per-session ActivatedToolSet
  const activatedSet = new ActivatedToolSet(coreToolIds)

  // Inject tool-search (dynamically created, closes over activatedSet)
  tools['tool-search'] = createToolSearchTool(activatedSet, new Set(allToolIds))

  // ★ Activation guard — block unloaded tool calls with clear error
  applyActivationGuard(tools, activatedSet, coreToolIds)

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
// PM Agent
// ---------------------------------------------------------------------------

/** PM agent display name. */
const PM_AGENT_NAME = 'PMAgent'
/** PM agent id prefix. */
const PM_AGENT_ID_PREFIX = 'pm-agent'
/** PM agent step limit (same as master). */
const PM_AGENT_MAX_STEPS = MASTER_HARD_MAX_STEPS

export type CreatePMAgentInput = {
  model: LanguageModelV3
  /** Optional language override for prompt selection. */
  lang?: string
  /** Optional instructions override. */
  instructions?: string
}

/** Read PM agent base prompt. */
function readPMAgentBasePrompt(lang?: string): string {
  return getPMPrompt(lang)
}

/** Creates a PM agent instance for project management and specialist coordination. */
export function createPMAgent(input: CreatePMAgentInput) {
  const instructions = input.instructions || getPMPrompt(input.lang)
  const wrappedModel = wrapModelWithExamples(input.model)

  const ctx = getRequestContext()
  const coreToolIds = ['tool-search', 'load-skill'] as string[]

  // Filter PM agent tools by platform
  let deferredToolIds = filterToolIdsByPlatform(
    PM_AGENT_TOOL_IDS.filter((id) => !coreToolIds.includes(id)) as string[],
    ctx?.clientPlatform,
  )
  if (!isWebSearchConfigured()) {
    deferredToolIds = deferredToolIds.filter((id) => id !== 'web-search')
  }
  const allToolIds = [...new Set([...coreToolIds, ...deferredToolIds])]

  const tools = buildToolset(allToolIds)
  const activatedSet = new ActivatedToolSet(coreToolIds)
  tools['tool-search'] = createToolSearchTool(activatedSet, new Set(allToolIds))
  applyActivationGuard(tools, activatedSet, coreToolIds)

  const hardRules = buildHardRules()
  const toolSearchGuidance = buildToolSearchGuidance(ctx?.clientPlatform, deferredToolIds)
  const finalInstructions = `${instructions}\n\n${hardRules}\n\n${toolSearchGuidance}`

  return new ToolLoopAgent({
    model: wrappedModel,
    instructions: finalInstructions,
    tools,
    stopWhen: [stepCountIs(PM_AGENT_MAX_STEPS), dynamicStepLimit()] as StopCondition<any>[],
    experimental_repairToolCall: createToolCallRepair(),
    prepareStep: createToolSearchPrepareStep(allToolIds, activatedSet),
  })
}

/** Creates the frame metadata for a PM agent. */
export function createPMAgentFrame(input: {
  model: MasterAgentModelInfo
  taskId?: string
  projectId?: string
}): AgentFrame {
  const agentId = input.taskId
    ? `${PM_AGENT_ID_PREFIX}-${input.taskId}`
    : `${PM_AGENT_ID_PREFIX}-${Date.now()}`
  return {
    kind: 'pm',
    name: PM_AGENT_NAME,
    agentId,
    path: [PM_AGENT_NAME],
    model: input.model,
    taskId: input.taskId,
    projectId: input.projectId,
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
  // 6 个专业内置子 Agent
  const specialistFactory = SPECIALIST_FACTORIES[effectiveType]
  if (specialistFactory) {
    return specialistFactory(wrappedModel)
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
  let deferredToolIds = filterToolIdsByPlatform(
    (masterTpl.deferredToolIds ?? []).filter((id) => !AGENT_TOOL_IDS_TO_EXCLUDE.has(id)),
    ctx?.clientPlatform,
  )
  if (!isWebSearchConfigured()) {
    deferredToolIds = deferredToolIds.filter((id) => id !== 'web-search')
  }
  const allToolIds = [...new Set([...coreToolIds, ...deferredToolIds])]

  const tools = buildToolset(allToolIds)
  const activatedSet = new ActivatedToolSet(coreToolIds)
  tools['tool-search'] = createToolSearchTool(activatedSet, new Set(allToolIds))
  applyActivationGuard(tools, activatedSet, coreToolIds)

  // 使用与主 Agent 相同的完整 instructions（sub-agent 不共享 preface，需自带 guidance）
  const basePrompt = masterTpl.systemPrompt
  const finalInstructions = `${basePrompt}\n\n${buildHardRules()}\n\n${buildToolSearchGuidance(ctx?.clientPlatform, deferredToolIds)}`

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

// ---------------------------------------------------------------------------
// 6 个专业内置子 Agent
// ---------------------------------------------------------------------------

type SpecialistConfig = {
  id: string
  instructions: string
  toolIds: string[]
  maxSteps: number
}

const SPECIALIST_CONFIGS: Record<string, SpecialistConfig> = {
  'doc-editor': {
    id: 'doc-editor',
    instructions: [
      '你是文档编辑专用子代理，负责富文本和 Markdown 文档的创建与编辑。',
      '',
      '你可以使用以下工具：',
      '- write-file: 创建或覆写文件',
      '- read-file: 读取文件内容',
      '- list-dir: 浏览目录结构',
      '',
      '注意：专注于文档编辑任务。输出格式优先使用 Markdown，富文本场景使用 Plate.js 兼容格式。',
    ].join('\n'),
    toolIds: ['write-file', 'read-file', 'list-dir'],
    maxSteps: 15,
  },
  'browser': {
    id: 'browser',
    instructions: [
      '你是浏览器操作专用子代理，负责网页操作和数据抓取。',
      '',
      '你可以使用以下工具：',
      '- browser-navigate: 打开网页',
      '- browser-click: 点击元素',
      '- browser-fill: 填写表单',
      '- browser-screenshot: 截图',
      '- web-search: 搜索网页',
      '',
      '注意：操作网页时注意加载等待，避免操作未渲染的元素。',
    ].join('\n'),
    toolIds: ['browser-navigate', 'browser-click', 'browser-fill', 'browser-screenshot', 'browser-read', 'web-search'],
    maxSteps: 20,
  },
  'data-analyst': {
    id: 'data-analyst',
    instructions: [
      '你是数据分析专用子代理，负责数据处理、统计和可视化。',
      '',
      '你可以使用以下工具：',
      '- read-file: 读取数据文件（CSV、JSON、Excel 等）',
      '- write-file: 输出分析结果',
      '- js-repl: 执行 JavaScript 代码进行数据处理',
      '',
      '注意：优先使用 js-repl 进行数据处理。大数据集使用流式处理避免内存溢出。',
    ].join('\n'),
    toolIds: ['read-file', 'write-file', 'js-repl'],
    maxSteps: 15,
  },
  'extractor': {
    id: 'extractor',
    instructions: [
      '你是信息提取专用子代理，负责从文件、网页中提取结构化信息。',
      '',
      '你可以使用以下工具：',
      '- read-file: 读取文件内容',
      '- office-read: 读取 Office 文档',
      '- web-fetch: 获取网页内容',
      '',
      '注意：提取结果使用结构化格式（JSON/表格）呈现。长文档先摘要再详述。',
    ].join('\n'),
    toolIds: ['read-file', 'office-read', 'web-fetch'],
    maxSteps: 10,
  },
  'canvas-designer': {
    id: 'canvas-designer',
    instructions: [
      '你是画布设计专用子代理，负责画布节点创建、排布和设计。',
      '',
      '你可以使用以下工具：',
      '- canvas-add-node: 添加节点',
      '- canvas-update-node: 更新节点',
      '- canvas-remove-node: 删除节点',
      '- canvas-layout: 自动布局',
      '',
      '注意：节点布局注意视觉平衡，合理利用空间。批量操作分步进行。',
    ].join('\n'),
    toolIds: ['canvas-add-node', 'canvas-update-node', 'canvas-remove-node', 'canvas-layout', 'canvas-add-edge', 'canvas-read'],
    maxSteps: 15,
  },
  'coder': {
    id: 'coder',
    instructions: [
      '你是代码工程师专用子代理，负责代码编写、调试和分析。',
      '',
      '你可以使用以下工具：',
      '- write-file: 创建或修改代码文件',
      '- read-file: 读取源代码',
      '- grep-files: 搜索代码',
      '- list-dir: 浏览项目结构',
      '- shell-command: 执行构建、测试等命令',
      '',
      '注意：遵循项目代码规范。修改前先阅读相关代码。测试驱动开发。',
    ].join('\n'),
    toolIds: ['write-file', 'read-file', 'grep-files', 'list-dir', 'shell-command'],
    maxSteps: 20,
  },
}

/** Factory map for specialist sub-agents. */
const SPECIALIST_FACTORIES: Record<string, (model: LanguageModelV3) => ToolLoopAgent> =
  Object.fromEntries(
    Object.entries(SPECIALIST_CONFIGS).map(([key, config]) => [
      key,
      (model: LanguageModelV3) => {
        const toolIds = config.toolIds.filter((id) => !AGENT_TOOL_IDS_TO_EXCLUDE.has(id))
        return new ToolLoopAgent({
          id: `sub-agent-${config.id}-${Date.now()}`,
          model,
          instructions: config.instructions,
          tools: buildToolset(toolIds),
          stopWhen: stepCountIs(config.maxSteps),
          experimental_repairToolCall: createToolCallRepair(),
        })
      },
    ]),
  )

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
function createDynamicAgentFromConfig(
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
