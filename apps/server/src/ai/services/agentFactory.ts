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
 * - general-purpose: 通用（ToolSearch + 全量工具）
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
  pruneMessages,
} from 'ai'
import type {
  LanguageModelV3,
} from '@ai-sdk/provider'
import type { PrepareStepFunction, StopCondition } from 'ai'
import { getRequestContext, getSessionId, getPlanUpdate, type AgentFrame } from '@/ai/shared/context/requestContext'
import { buildToolset, getToolJsonSchemas, getMcpToolIds } from '@/ai/tools/toolRegistry'
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
import { logger } from '@/common/logger'
import {
  type AgentConfig,
} from '@/ai/services/agentConfigService'
import { resolveAgentByName } from '@/ai/tools/AgentSelector'
import { buildHardRules, type PromptLang } from '@/ai/shared/hardRules'
import { readBasicConf } from '@/modules/settings/openloafConfStore'

/** Resolve prompt language for agent construction. Defaults to English. */
function resolvePromptLang(override?: string | PromptLang): PromptLang {
  if (override === 'zh' || override === 'en') return override
  if (typeof override === 'string' && override.startsWith('zh')) return 'zh'
  if (typeof override === 'string' && override.startsWith('en')) return 'en'
  return readBasicConf().promptLanguage === 'zh' ? 'zh' : 'en'
}
import { tryAutoCompact } from '@/ai/shared/autoCompact'
import { microcompactMessages, extractLastAssistantTimestamp } from '@/ai/shared/microCompact'
import { ContextCollapseManager, type CollapseResult } from '@/ai/shared/contextCollapse'
import { buildToolSearchGuidance } from '@/ai/shared/toolSearchGuidance'
import { isWebSearchConfigured } from '@/ai/tools/webSearchTool'
import { applyToolResultInterception } from '@/ai/tools/toolResultInterceptor'
import {
  MASTER_CORE_TOOL_IDS,
  PM_CORE_TOOL_IDS,
  SUB_AGENT_CORE_TOOL_IDS,
} from '@/ai/shared/coreToolIds'

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
const READ_ONLY_TOOL_IDS = ['Read', 'Glob', 'Grep', 'ProjectQuery'] as const

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

type CreateMasterAgentInput = {
  model: LanguageModelV3
  instructions?: string
  /** Historical messages for rehydrating dynamically activated tools. */
  messages?: { role: string; parts?: unknown[] }[]
  /** Builtin skills text appended to the end of system prompt. */
  skillsSystemText?: string
  /** Optional prompt language override (defaults to BasicConfig.promptLanguage). */
  lang?: PromptLang
}

// ---------------------------------------------------------------------------
// Step limits — prevent infinite tool loops (MAST FM-1.3)
// ---------------------------------------------------------------------------
const MASTER_HARD_MAX_STEPS = 200
const SUB_AGENT_MAX_STEPS = 80

// ---------------------------------------------------------------------------
// ToolSearch Pull 模式 — prepareStep + ActivatedToolSet
// ---------------------------------------------------------------------------

/** Core tool IDs that are always visible (never deferred). Like Claude Code. */
const CORE_TOOL_IDS = MASTER_CORE_TOOL_IDS

/**
 * Activation guard for ToolSearch pull mode.
 *
 * Problem: AI SDK's activeTools only controls which tool schemas are SENT to the
 * model, but doesn't prevent execution of non-active tools. When a model calls a
 * registered-but-unloaded tool, the SDK still validates/executes it — and the model
 * gets generic validation errors instead of "load this tool first via ToolSearch".
 * Weak models then repeatedly guess parameters instead of calling ToolSearch.
 *
 * Solution: Wrap execute() so that calling an unloaded tool immediately returns a
 * clear error directing the model to use ToolSearch. Also bypass needsApproval
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
            `Tool "${toolId}" has not been loaded. You must call ToolSearch(names: "${toolId}") to load it first, then call it again with the correct parameters.`
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
 * Creates a prepareStep that:
 * 1. Controls tool visibility via ToolSearch pull mode
 * 2. Prunes historical reasoning & old tool calls to reduce token overhead
 * 3. Microcompacts old tool results after idle gaps (step 0 only)
 * 4. Auto-compacts long conversations via LLM summarization (step 0 only)
 */
function createToolSearchPrepareStep(
  allToolIds: readonly string[],
  activatedSet: ActivatedToolSet,
  options?: {
    modelId?: string
    lastAssistantTimestamp?: number | null
    collapseManager?: ContextCollapseManager
  },
): PrepareStepFunction {
  return async ({ messages, stepNumber, model }) => {
    // 1. ToolSearch pull — dynamic tool visibility
    const activeToolIds = activatedSet.getActiveToolIds()
    const activeTools = allToolIds.filter((id) => activeToolIds.includes(id))
    if (!activeTools.includes('ToolSearch')) activeTools.push('ToolSearch')

    // 2. Prune stale content — runs every step.
    //
    // IMPORTANT: 不要再用 `toolCalls: 'before-last-2-messages'`。那种设置会
    // 把早于"最近 2 条消息"的所有 tool-call / tool-result 剥离，导致模型在
    // 多轮工具循环中完全看不到自己刚刚做过什么 — 典型症状：反复执行相同
    // 的 Bash/Grep 命令，每步 text 为空，直到撞上步数上限。
    //
    // 上下文压力另由 3 层兜底处理（各自带阈值）：
    //   - microcompactMessages: 空闲 30 min 清理旧工具结果
    //   - tryAutoCompact: 60% 阈值触发 LLM 摘要
    //   - ContextCollapseManager: 80%/90% 阈值触发渐进式压缩
    //
    // NOTE: reasoning 设为 'none'，因为 DeepSeek 等 provider 要求开启 thinking 时
    // 每条 assistant 消息必须包含 reasoning_content，移除会导致 400 错误。
    const pruned = pruneMessages({
      messages,
      reasoning: 'none',
      toolCalls: 'none',
      emptyMessages: 'remove',
    })

    // 2.5 Plan context injection — pruneMessages 会在多步执行中删除早期的
    // SubmitPlan tool calls，导致模型丢失计划上下文。在 pruning 后注入当前
    // 计划状态作为 user 提醒消息，确保模型始终知道活跃计划的存在和进度。
    let prunedWithPlan = pruned
    if (stepNumber > 0) {
      const currentPlan = getPlanUpdate()
      if (currentPlan && Array.isArray(currentPlan.plan) && currentPlan.plan.length > 0) {
        const planLines = currentPlan.plan
          .filter((s) => typeof s === 'string' && s.trim())
          .map((s, i) => `${i + 1}. ${s}`)
        if (planLines.length > 0) {
          const planReminder = {
            role: 'user' as const,
            content: [{
              type: 'text' as const,
              text: `[Plan Context] 你正在执行以下已批准的计划「${currentPlan.actionName ?? ''}」，请继续按步骤顺序执行，不要重新创建计划：\n${planLines.join('\n')}`,
            }],
          } as (typeof prunedWithPlan)[number]
          // 插入到倒数第2条之前（在最近的 assistant+tool 对之前），确保不被下一轮 prune 删除
          const insertIdx = Math.max(0, prunedWithPlan.length - 2)
          prunedWithPlan = [
            ...prunedWithPlan.slice(0, insertIdx),
            planReminder,
            ...prunedWithPlan.slice(insertIdx),
          ]
        }
      }
    }

    // Step 0 only: microcompact + context collapse (or auto-compact fallback)
    let finalMessages = prunedWithPlan
    if (stepNumber === 0) {
      // 3. Microcompact — clear old tool results after idle gap
      const mcResult = microcompactMessages(prunedWithPlan, options?.lastAssistantTimestamp)
      finalMessages = mcResult.messages

      // 4. Context Collapse — non-destructive incremental summarization
      //    Replaces auto-compact when collapseManager is provided.
      if (options?.collapseManager) {
        const collapseResult: CollapseResult = await options.collapseManager.applyIfNeeded(
          finalMessages,
          model as any,
        )
        if (collapseResult.collapsed) {
          finalMessages = collapseResult.messages
        } else {
          // Collapse didn't trigger — fall back to auto-compact as safety net
          finalMessages = await tryAutoCompact(finalMessages, options?.modelId, model as any)
        }
      } else {
        // No collapse manager — use legacy auto-compact
        finalMessages = await tryAutoCompact(finalMessages, options?.modelId, model as any)
      }
    }

    return { activeTools, messages: finalMessages }
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
 * - 4+ 个工具调用或含 Agent（复杂任务）→ 不额外限制（由硬上限控制）
 */
function dynamicStepLimit(): StopCondition<Record<string, never>> {
  return ({ steps }: { steps: ReadonlyArray<{ toolCalls: ReadonlyArray<{ toolName: string }> }> }) => {
    const totalToolCalls = steps.reduce(
      (sum: number, s: { toolCalls: ReadonlyArray<{ toolName: string }> }) => sum + s.toolCalls.length,
      0,
    )
    const hasAgentSpawn = steps.some(
      (s: { toolCalls: ReadonlyArray<{ toolName: string }> }) =>
        s.toolCalls.some((tc: { toolName: string }) => tc.toolName === 'Agent'),
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
 * 2. extractReasoningMiddleware — 提取 <think>...</think> 标签为 reasoning 部分
 *
 * 使用 startWithReasoning: false，仅提取显式 <think> 标签包裹的内容。
 * 这样对所有模型都安全：
 * - 使用 <think> 标签的模型（DeepSeek R1、QwQ、Kimi）→ 正确提取
 * - 原生 reasoning 的模型（Claude、GPT-o 系列、Qwen 3.5）→ 无 <think> 标签，文本不受影响
 * - 无 reasoning 的模型 → 文本不受影响
 */
function wrapModelWithExamples(model: LanguageModelV3): LanguageModelV3 {
  return wrapLanguageModel({
    model,
    middleware: [
      extractReasoningMiddleware({ tagName: 'think', startWithReasoning: false }),
      addToolInputExamplesMiddleware(),
    ],
  }) as unknown as LanguageModelV3
}

/**
 * 为 Responses API 模型构建 providerOptions。
 * 第三方 Responses API 端点（如 Codex 代理）不支持服务端 item 持久化，
 * 必须设置 store: false，否则多轮对话时 SDK 会用 item_reference 引用
 * 不存在的 item 导致 400 错误。
 */
function buildResponsesApiProviderOptions(model: LanguageModelV3): Record<string, unknown> {
  const provider = model.provider ?? ''
  // 仅对 OpenAI Responses API 模型生效（provider 格式如 "openai.responses"）
  if (!provider.includes('responses')) return {}
  const sessionId = getSessionId()
  return {
    providerOptions: {
      openai: {
        store: false,
        // Codex 兼容：使用 chatSessionId 作为 prompt_cache_key，
        // 同一会话内多轮对话可复用服务端 prompt 缓存，减少 token 开销。
        // 不支持该字段的第三方 API 会自动忽略。
        ...(sessionId ? { promptCacheKey: sessionId } : {}),
      },
    },
  }
}

/** Creates the master agent instance. */
export function createMasterAgent(input: CreateMasterAgentInput) {
  const template = getPrimaryTemplate()
  const lang = resolvePromptLang(input.lang)
  const instructions = input.instructions || getMasterPrompt(lang)
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
    filteredDeferredToolIds = filteredDeferredToolIds.filter((id) => id !== 'WebSearch')
  }

  // Inject MCP tool IDs (dynamically registered by MCPClientManager)
  const mcpToolIds = getMcpToolIds()
  const allToolIds = [...new Set([...coreToolIds, ...filteredDeferredToolIds, ...mcpToolIds])]

  // Build full toolset (all tools registered, but only core visible via activeTools)
  const tools = buildToolset(allToolIds)

  // Create per-session ActivatedToolSet
  const activatedSet = new ActivatedToolSet(coreToolIds)

  // Rehydrate previously activated tools from message history (fixes approval flow state loss)
  // Pass allToolIds to skip tools from disconnected MCP servers
  const allToolIdSet = new Set(allToolIds)
  if (input.messages && input.messages.length > 0) {
    ActivatedToolSet.rehydrateFromMessages(activatedSet, input.messages, allToolIdSet)
  }

  // Inject ToolSearch (dynamically created, closes over activatedSet)
  tools['ToolSearch'] = createToolSearchTool(activatedSet, allToolIdSet, getToolJsonSchemas)

  // ★ Activation guard — block unloaded tool calls with clear error
  applyActivationGuard(tools, activatedSet, coreToolIds)

  // ★ Tool result interception — persist oversized results to disk
  applyToolResultInterception(tools, getSessionId)

  // ★ Append Hard Rules to instructions (Layer 2)
  // ToolSearch guidance is injected via session preface (platform-aware).
  const hardRules = buildHardRules(lang)
  // ★ Builtin skills appended at the very end of system prompt (Layer 3)
  const skillsSuffix = input.skillsSystemText ? `\n\n${input.skillsSystemText}` : ''
  const finalInstructions = `${instructions}\n\n${hardRules}${skillsSuffix}`

  const baseSettings = {
    model: wrappedModel,
    instructions: finalInstructions,
    tools,
    stopWhen: [stepCountIs(MASTER_HARD_MAX_STEPS), dynamicStepLimit()] as StopCondition<any>[],
    experimental_repairToolCall: createToolCallRepair(),
    ...buildResponsesApiProviderOptions(input.model),
  }
  // Extract last assistant timestamp for time-based microcompact
  const lastAssistantTimestamp = input.messages
    ? extractLastAssistantTimestamp(input.messages as any)
    : null

  // Create per-agent ContextCollapseManager for non-destructive context folding
  const collapseManager = new ContextCollapseManager({
    modelId: input.model.modelId,
  })

  // Inject prepareStep — ToolSearch pull mode + context compression
  Object.assign(baseSettings, {
    prepareStep: createToolSearchPrepareStep(allToolIds, activatedSet, {
      modelId: input.model.modelId,
      lastAssistantTimestamp,
      collapseManager,
    }),
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

/** Creates a PM agent instance for project management and specialist coordination. */
export function createPMAgent(input: CreatePMAgentInput) {
  const instructions = input.instructions || getPMPrompt(input.lang)
  const wrappedModel = wrapModelWithExamples(input.model)

  const ctx = getRequestContext()
  // PM agent shares the same core tools as master
  const coreToolIds = [...PM_CORE_TOOL_IDS] as string[]

  // Filter PM agent tools by platform
  let deferredToolIds = filterToolIdsByPlatform(
    PM_AGENT_TOOL_IDS.filter((id) => !coreToolIds.includes(id)) as string[],
    ctx?.clientPlatform,
  )
  if (!isWebSearchConfigured()) {
    deferredToolIds = deferredToolIds.filter((id) => id !== 'WebSearch')
  }

  // Inject MCP tool IDs
  const mcpToolIds = getMcpToolIds()
  const allToolIds = [...new Set([...coreToolIds, ...deferredToolIds, ...mcpToolIds])]

  const tools = buildToolset(allToolIds)
  const activatedSet = new ActivatedToolSet(coreToolIds)
  tools['ToolSearch'] = createToolSearchTool(activatedSet, new Set(allToolIds), getToolJsonSchemas)
  applyActivationGuard(tools, activatedSet, coreToolIds)
  applyToolResultInterception(tools, getSessionId)

  const hardRules = buildHardRules(resolvePromptLang(input.lang))
  const toolSearchGuidance = buildToolSearchGuidance(ctx?.clientPlatform, deferredToolIds)
  const finalInstructions = `${instructions}\n\n${hardRules}\n\n${toolSearchGuidance}`

  return new ToolLoopAgent({
    model: wrappedModel,
    instructions: finalInstructions,
    tools,
    stopWhen: [stepCountIs(PM_AGENT_MAX_STEPS), dynamicStepLimit()] as StopCondition<any>[],
    experimental_repairToolCall: createToolCallRepair(),
    prepareStep: createToolSearchPrepareStep(allToolIds, activatedSet, {
      modelId: input.model.modelId,
      collapseManager: new ContextCollapseManager({
        modelId: input.model.modelId,
      }),
    }),
    ...buildResponsesApiProviderOptions(input.model),
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

/** Create a general-purpose SubAgent with ToolSearch + full deferred toolset (excluding agent collaboration tools). */
function createGeneralPurposeSubAgent(model: LanguageModelV3): ToolLoopAgent {
  const masterTpl = getPrimaryTemplate()
  const ctx = getRequestContext()
  // General-purpose sub-agents get core file tools but NOT agent collaboration tools
  const coreToolIds = [...SUB_AGENT_CORE_TOOL_IDS] as string[]
  let deferredToolIds = filterToolIdsByPlatform(
    (masterTpl.deferredToolIds ?? []).filter((id) => !AGENT_TOOL_IDS_TO_EXCLUDE.has(id)),
    ctx?.clientPlatform,
  )
  if (!isWebSearchConfigured()) {
    deferredToolIds = deferredToolIds.filter((id) => id !== 'WebSearch')
  }

  // Inject MCP tool IDs
  const mcpToolIds = getMcpToolIds()
  const allToolIds = [...new Set([...coreToolIds, ...deferredToolIds, ...mcpToolIds])]

  const tools = buildToolset(allToolIds)
  const activatedSet = new ActivatedToolSet(coreToolIds)
  tools['ToolSearch'] = createToolSearchTool(activatedSet, new Set(allToolIds), getToolJsonSchemas)
  applyActivationGuard(tools, activatedSet, coreToolIds)
  applyToolResultInterception(tools, getSessionId)

  // 使用与主 Agent 相同的完整 instructions（SubAgent 不共享 preface，需自带 guidance）
  // 逻辑：使用用户偏好的提示词语言生成 Master prompt，而不是 template.systemPrompt 的硬编码中文版。
  const subAgentLang = resolvePromptLang()
  const basePrompt = getMasterPrompt(subAgentLang)
  const finalInstructions = `${basePrompt}\n\n${buildHardRules(subAgentLang)}\n\n${buildToolSearchGuidance(ctx?.clientPlatform, deferredToolIds)}`

  return new ToolLoopAgent({
    id: `SubAgent-general-${Date.now()}`,
    model,
    instructions: finalInstructions,
    tools,
    stopWhen: stepCountIs(SUB_AGENT_MAX_STEPS),
    experimental_repairToolCall: createToolCallRepair(),
    prepareStep: createToolSearchPrepareStep(allToolIds, activatedSet, {
      modelId: model.modelId,
    }),
  })
}

/** Create an explore SubAgent (read-only, fixed tools). */
function createExploreSubAgent(model: LanguageModelV3): ToolLoopAgent {
  const instructions = [
    '你是一个代码库探索专用子代理。你的任务是快速搜索和分析代码库。',
    '',
    '你可以使用以下工具：',
    '- Read: 读取文件内容',
    '- Glob: 搜索文件路径',
    '- Grep: 搜索文件内容',
    '- ProjectQuery: 查询项目数据',
    '',
    '注意：你是只读的，不能修改任何文件。专注于搜索、分析和回答问题。',
  ].join('\n')

  return new ToolLoopAgent({
    id: `SubAgent-explore-${Date.now()}`,
    model,
    instructions,
    tools: buildToolset([...READ_ONLY_TOOL_IDS]),
    stopWhen: stepCountIs(SUB_AGENT_MAX_STEPS),
    experimental_repairToolCall: createToolCallRepair(),
  })
}

/** Plan SubAgent 的 PLAN 文件命名常量。 */
const PLAN_FILE_PREFIX = 'PLAN_'

/** Create a plan SubAgent (explores codebase + writes PLAN_N.md + returns path). */
function createPlanSubAgent(model: LanguageModelV3): ToolLoopAgent {
  const projectId = getRequestContext()?.projectId
  const explorationPhase = projectId ? `
### Phase 1：理解需求
- 聚焦理解用户需求和相关代码。**主动搜索可复用的现有函数、工具和模式**。
- 使用只读工具（Read、Glob、Grep、ProjectQuery）探索代码库。
- 范围不确定时，优先并行发起多次工具调用高效覆盖。

### Phase 2：设计
- 综合探索结论，决定**唯一推荐方案**。
- 列出要改的文件路径、可复用的现有函数/工具（带 file:line）、边界情况。
- 不列所有备选方案——只写推荐方案。

### Phase 3：审查
- 重新读取关键文件加深理解。
- 确认方案与用户原始请求一致。
` : '' // 临时对话无代码库，跳过探索阶段

  const instructions = `你是架构方案设计专用子代理。你的任务是为父 Agent 的用户设计实现计划，写入 PLAN 文件，并返回文件路径。

## 模式判断（第一步）

读取 prompt，判断是哪种模式：
- prompt 包含"修改已有计划"+ 文件路径 → **修改模式**：Read 该文件，按反馈修改，Write 回同一路径
- 其他情况 → **新建模式**：走下面的工作流程

## 工作流程（新建模式）
${explorationPhase}
### 写入 PLAN 文件
用 Write 创建 \`${PLAN_FILE_PREFIX}1.md\`（如已存在则用 Glob 检查并递增编号）。

#### 质量硬标准
- 以 **Context** 章节开头：说明为什么做这个改动——问题/需求、动机、预期结果。
- **只写推荐方案**，不列所有备选。
- 能快速扫读，同时详细到能直接执行。
- 列出要修改的**关键文件路径**。
- 引用**要复用的现有函数/工具**（尽量 file:line）。
- 包含**验证章节**（如何端到端测试：跑代码、跑测试）。

#### 反模式（禁止）
- 重述用户需求（用户刚告诉你的）
- 并列枚举备选方案
- 泛泛的动作叙述（"分析 HTML 结构"、"检查依赖"），替换为具体交付物
- **自指步骤**——绝对禁止以下措辞出现在 <step> 里：
  "生成报告"/"输出报告"/"整理结果"/"汇总发现"/"呈现给用户"
  分析结论由父 Agent 在对话中直接说出，不占步骤。

#### \`<plan-steps>\` XML 块
- 文件**末尾必须**有 \`<plan-steps>\` XML 块——UI 卡片从这里读取步骤。
- **不要**在正文另写 \`## 步骤\` 编号列表——步骤只通过 XML 表达。
- 每个 \`<step>\` 描述一个**可观察的交付物**（改某文件、跑某命令），不要描述纯过程。
- 典型步骤数量 **2-8 步**；超过 8 步 = 粒度太细或需求未收敛。
- \`<step>\` 为纯文本，\`&\`/\`<\`/\`>\` 转义为 \`&amp;\`/\`&lt;\`/\`&gt;\`。

#### 格式示例
\`\`\`markdown
# 重构 UserService 的 email 校验

## Context

当前 UserService.createUser 内联了邮箱校验正则，AuthController.login 也复制了同样逻辑。导致两处校验规则不一致（见 #1234 bug 报告）。目标：抽出统一的 validateEmail，两处调用同一实现。

## 关键文件

- src/services/UserService.ts — 新增 validateEmail(email) 方法
- src/controllers/AuthController.ts:42 — 调用处替换
- src/utils/regex.ts:15 — 复用现有 EMAIL_REGEX 常量
- src/services/__tests__/UserService.test.ts — 添加 Jest 用例

## 验证方法

运行 pnpm test --filter=UserService 并确认新增的 4 个 case 全部通过。

<plan-steps>
  <step>在 UserService.ts 添加 validateEmail 方法（复用 EMAIL_REGEX）并添加 Jest 单元测试</step>
  <step>替换 AuthController.ts:42 的内联正则为 UserService.validateEmail</step>
  <step>运行 pnpm test --filter=UserService 确认所有用例通过</step>
</plan-steps>
\`\`\`

## 严格约束
- **禁止**修改任何代码文件（Write 只能用于 PLAN_*.md）
- **禁止**调用 SubmitPlan（审批由父 Agent 发起）
- **禁止**调用 Edit（你没有这个工具）
- Write PLAN 文件后**立即结束 turn**

## Turn 结束输出格式（仅此内容，不要额外闲聊）

Plan saved to: PLAN_N.md
Steps: <count>
Critical files for implementation:
- path/to/file1
- path/to/file2`

  return new ToolLoopAgent({
    id: `SubAgent-plan-${Date.now()}`,
    model,
    instructions,
    tools: buildToolset([...READ_ONLY_TOOL_IDS, 'Write']),
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
      '- Write: 创建或覆写文件',
      '- Read: 读取文件内容',
      '- Glob: 浏览目录结构',
      '',
      '注意：专注于文档编辑任务。输出格式优先使用 Markdown，富文本场景使用 Plate.js 兼容格式。',
    ].join('\n'),
    toolIds: ['Write', 'Read', 'Glob'],
    maxSteps: 30,
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
      '- BrowserScreenshot: 截图',
      '- WebSearch: 搜索网页',
      '',
      '注意：操作网页时注意加载等待，避免操作未渲染的元素。',
    ].join('\n'),
    toolIds: ['browser-navigate', 'browser-click', 'browser-fill', 'BrowserScreenshot', 'browser-read', 'WebSearch'],
    maxSteps: 40,
  },
  'data-analyst': {
    id: 'data-analyst',
    instructions: [
      '你是数据分析专用子代理，负责数据处理、统计和可视化。',
      '',
      '你可以使用以下工具：',
      '- Read: 读取数据文件（CSV、JSON、Excel 等）',
      '- Write: 输出分析结果',
      '- Bash: 执行 shell 命令进行数据处理',
      '',
      '注意：大数据集使用流式处理避免内存溢出。',
    ].join('\n'),
    toolIds: ['Read', 'Write', 'Bash'],
    maxSteps: 30,
  },
  'extractor': {
    id: 'extractor',
    instructions: [
      '你是信息提取专用子代理，负责从文件、网页中提取结构化信息。',
      '',
      '你可以使用以下工具：',
      '- Read: 读取文件内容',
      '- WordQuery / ExcelQuery / PptxQuery / PdfQuery: 读取 Office / PDF 文档',
      '- WebFetch: 获取网页内容',
      '',
      '注意：提取结果使用结构化格式（JSON/表格）呈现。长文档先摘要再详述。',
    ].join('\n'),
    toolIds: ['Read', 'WordQuery', 'ExcelQuery', 'PptxQuery', 'PdfQuery', 'WebFetch'],
    maxSteps: 20,
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
    maxSteps: 30,
  },
  'coder': {
    id: 'coder',
    instructions: [
      '你是代码工程师专用子代理，负责代码编写、调试和分析。',
      '',
      '你可以使用以下工具：',
      '- Write: 创建或修改代码文件',
      '- Read: 读取源代码',
      '- Grep: 搜索代码',
      '- Glob: 浏览项目结构',
      '- Bash: 执行构建、测试等命令',
      '',
      '注意：遵循项目代码规范。修改前先阅读相关代码。测试驱动开发。',
    ].join('\n'),
    toolIds: ['Write', 'Read', 'Grep', 'Glob', 'Bash'],
    maxSteps: 40,
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
          id: `SubAgent-${config.id}-${Date.now()}`,
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
const AGENT_TOOL_IDS_TO_EXCLUDE = new Set(['Agent', 'SendMessage'])

/** Agent collaboration tool IDs that are auto-injected when allowSubAgents is true. */
const AGENT_COLLAB_TOOL_IDS = ['Agent', 'SendMessage']

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

/** Resolve the effective SubAgent type for display/logging. */
export function resolveEffectiveAgentName(raw?: string): string {
  if (!raw) return 'general-purpose'
  return raw.toLowerCase().trim()
}
