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
 * 统一 Agent 工厂 — 合并 masterAgent + subAgentFactory + 内置 SubAgent 创建逻辑。
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
import type { AgentFrame } from '@/ai/shared/context/requestContext'
import { buildToolset } from '@/ai/tools/toolRegistry'
import { createToolCallRepair } from '@/ai/shared/repairToolCall'
import { ActivatedToolSet } from '@/ai/tools/toolSearchState'
import { createToolSearchTool } from '@/ai/tools/toolSearchTool'
import {
  getTemplate,
  isTemplateId,
  getPrimaryTemplate,
  ALL_TEMPLATES,
  getBrowserPrompt,
  getCalendarPrompt,
  getCoderPrompt,
  getDocumentPrompt,
  getEmailPrompt,
  getMasterPrompt,
  getProjectPrompt,
  getShellPrompt,
  getVisionPrompt,
  getWidgetPrompt,
} from '@/ai/agent-templates'
import type { AgentTemplate } from '@/ai/agent-templates'
import { logger } from '@/common/logger'
import {
  readAgentConfigFromPath,
  type AgentConfig,
} from '@/ai/services/agentConfigService'
import { resolveAgentByName } from '@/ai/tools/AgentSelector'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { getWorkspaceRootPath } from '@openloaf/api'
import { resolveAgentDir } from '@/ai/shared/defaultAgentResolver'
import { buildHardRules } from '@/ai/shared/hardRules'

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

/** Get template prompt in specified language. */
function getTemplatePrompt(templateId: string, lang?: string): string {
  const promptGetters: Record<string, (lang?: string) => string> = {
    browser: getBrowserPrompt,
    calendar: getCalendarPrompt,
    coder: getCoderPrompt,
    document: getDocumentPrompt,
    email: getEmailPrompt,
    master: getMasterPrompt,
    project: getProjectPrompt,
    shell: getShellPrompt,
    vision: getVisionPrompt,
    widget: getWidgetPrompt,
  }
  const getter = promptGetters[templateId]
  return getter ? getter(lang) : getPrimaryTemplate().systemPrompt
}

/** Read base system prompt markdown content. */
export function readMasterAgentBasePrompt(lang?: string): string {
  return getTemplatePrompt('master', lang)
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
const CORE_TOOL_IDS = ['tool-search'] as const

/**
 * Creates a prepareStep that only exposes tool-search + dynamically activated tools.
 * Replaces the old TOOL_GROUPS push-based narrowing logic.
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
// ToolSearch 引导 — 运行时注入 <tool-search-guidance>
// ---------------------------------------------------------------------------

/**
 * Build ToolSearch guidance text appended to instructions at runtime.
 * Model discovers tools dynamically via tool-search; no pre-populated list needed.
 */
export function buildToolSearchGuidance(): string {
  return `<tool-search-guidance>
你启动时只有 tool-search 一个工具可用。当用户请求需要执行操作时，必须先用 tool-search 加载所需工具。

使用方式：
- 关键词搜索：tool-search(query: "file read") — 返回最匹配的工具并立即加载
- 直接选择：tool-search(query: "select:read-file,list-dir") — 按 ID 精确加载
- 搜索到的工具立即可用，无需额外步骤
- 可一次加载多个：用逗号分隔 ID

必须使用工具的场景（不可纯文本回答）：
- 查询时间/日期 → select:time-now
- 用户提及未来时间+事件（"明天开会"、"3小时后提醒"、"记一下周三拜访"、"设闹钟"）→ 先 time-now 获取当前时间，再 task-manage 创建定时任务（必须包含 schedule 参数），不可仅文字确认
- 多个事件 → 每个事件各调用一次 task-manage
- 查询待办/任务列表 → select:task-status
- 创建/修改/取消任务 → select:task-manage（取消前先 task-status 查询）
- 查询日程安排 → select:calendar-query
- 查询/操作邮件 → select:email-query
- 文件/目录操作 → read-file, list-dir, grep-files, apply-patch
- 打开链接/URL → select:open-url
- 渲染组件/诗歌/UI 展示 → select:jsx-create
- 画图表/折线图/柱状图 → select:chart-render
- 代码开发（"帮我开发"、"Claude Code"）→ select:spawn-agent（coder 子代理）

重要：简单对话直接回答，不需要加载任何工具。
</tool-search-guidance>`
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

  // ToolSearch Pull mode
  const coreToolIds = [...CORE_TOOL_IDS] as string[]
  const deferredToolIds = template.deferredToolIds ?? []
  const allToolIds = [...new Set([...coreToolIds, ...deferredToolIds])]

  // Build full toolset (all tools registered, but only core visible via activeTools)
  const tools = buildToolset(allToolIds)

  // Create per-session ActivatedToolSet
  const activatedSet = new ActivatedToolSet(coreToolIds)

  // Inject tool-search (dynamically created, closes over activatedSet)
  tools['tool-search'] = createToolSearchTool(activatedSet, new Set(allToolIds))

  // ★ Append Hard Rules + ToolSearch guidance to instructions (Layer 2)
  const hardRules = buildHardRules()
  const toolSearchGuidance = buildToolSearchGuidance()
  const finalInstructions = `${instructions}\n\n${hardRules}\n\n${toolSearchGuidance}`

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

/** 显示名称 → 模版 ID 映射（支持中文名称解析，如 "终端助手" → "shell"）。 */
const NAME_TO_ID = new Map<string, string>(
  ALL_TEMPLATES
    .filter((t) => !t.isPrimary)
    .map((t) => [t.name.toLowerCase().trim(), t.id]),
)

/** Resolve raw agentType string to a known SubAgentType. */
export function resolveAgentType(raw?: string): SubAgentType {
  if (!raw) return 'default'
  const lower = raw.toLowerCase().trim()

  const mapped = LEGACY_ALIASES[lower] ?? lower
  if (isTemplateId(mapped)) return 'system'

  // 按显示名称反查模版 ID（支持中文名称）
  const byName = NAME_TO_ID.get(lower)
  if (byName && isTemplateId(byName)) return 'system'

  return 'dynamic'
}

/** Resolve the effective agent name after legacy alias mapping. */
export function resolveEffectiveAgentName(raw?: string): string {
  if (!raw) return 'master'
  const lower = raw.toLowerCase().trim()
  const aliased = LEGACY_ALIASES[lower]
  if (aliased) return aliased

  // 按显示名称反查模版 ID（支持中文名称）
  const byName = NAME_TO_ID.get(lower)
  if (byName) return byName

  return lower
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
  const wrappedModel = wrapModelWithExamples(input.model)

  // 逻辑：内联配置 — 直接创建自定义 agent，优先级最高。
  if (input.inlineConfig?.systemPrompt || input.inlineConfig?.toolIds?.length) {
    const fallbackTemplate = getPrimaryTemplate()
    const toolIds = input.inlineConfig.toolIds?.length
      ? input.inlineConfig.toolIds
      : resolveTemplateToolIds(fallbackTemplate)
    const systemPrompt = input.inlineConfig.systemPrompt || '你是一个 AI 助手。'
    return new ToolLoopAgent({
      id: `inline-agent-${Date.now()}`,
      model: wrappedModel,
      instructions: systemPrompt,
      tools: buildToolset(toolIds),
      stopWhen: stepCountIs(SUB_AGENT_MAX_STEPS),
      experimental_repairToolCall: createToolCallRepair(),
    })
  }

  const effectiveName = resolveEffectiveAgentName(input.rawAgentType)

  // 逻辑：系统 Agent — 从模版查找定义，支持用户 AGENT.md 覆盖。
  if (input.agentType === 'system') {
    const template = getTemplate(effectiveName)
    if (template) {
      const toolIds = resolveTemplateToolIds(template)
      const userOverride = readSystemAgentOverride(effectiveName, input.skillRoots)
      const instructions = userOverride
        || template.systemPrompt
        || `你是 ${template.name}。${template.description}`
      return new ToolLoopAgent({
        id: `system-agent-${template.id}`,
        model: wrappedModel,
        instructions,
        tools: buildToolset(toolIds),
        stopWhen: stepCountIs(SUB_AGENT_MAX_STEPS),
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
  logger.warn(
    { rawAgentType: input.rawAgentType, agentType: input.agentType },
    '[agent-factory] No matching template or dynamic agent found, falling back to master template',
  )
  const masterTpl = getPrimaryTemplate()
  const toolIds = resolveTemplateToolIds(masterTpl)
  return new ToolLoopAgent({
    id: 'fallback-master-agent',
    model: wrappedModel,
    instructions:
      masterTpl.systemPrompt || `你是 ${masterTpl.name}。${masterTpl.description}`,
    tools: buildToolset(toolIds),
    stopWhen: stepCountIs(SUB_AGENT_MAX_STEPS),
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

/** Read user-override AGENT.md for a system agent template. */
function readSystemAgentOverride(
  templateId: string,
  skillRoots?: CreateSubAgentInput['skillRoots'],
): string | null {
  const roots = [
    skillRoots?.projectRoot,
    skillRoots?.workspaceRoot,
    getWorkspaceRootPath(),
  ].filter(Boolean) as string[]

  for (const root of roots) {
    const agentMdPath = path.join(resolveAgentDir(root, templateId), 'prompt.md')
    if (existsSync(agentMdPath)) {
      try {
        const content = readFileSync(agentMdPath, 'utf8').trim()
        if (content) return content
      } catch { /* ignore */ }
    }
  }
  return null
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
