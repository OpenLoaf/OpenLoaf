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
import {
  getTemplate,
  isTemplateId,
  getPrimaryTemplate,
  ALL_TEMPLATES,
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

// ---------------------------------------------------------------------------
// Step limits — prevent infinite tool loops (MAST FM-1.3)
// ---------------------------------------------------------------------------
const MASTER_HARD_MAX_STEPS = 30
const SUB_AGENT_MAX_STEPS = 15

// ---------------------------------------------------------------------------
// 工具动态选择 — prepareStep + activeTools (Anthropic Best Practice)
// ---------------------------------------------------------------------------

/** 工具按功能域分组，用于动态收窄 activeTools。 */
const TOOL_GROUPS: Record<string, readonly string[]> = {
  /** 核心工具 — 始终可用。 */
  core: ['time-now', 'update-plan', 'request-user-input', 'jsx-create'],
  /** Agent 协作 — 使用后持续可用。 */
  agent: ['spawn-agent', 'send-input', 'wait-agent', 'abort-agent'],
  /** 文件读取。 */
  fileRead: ['read-file', 'list-dir', 'grep-files'],
  /** 文件写入。 */
  fileWrite: ['apply-patch', 'edit-document'],
  /** Shell / 命令执行。 */
  shell: ['shell', 'shell-command', 'exec-command', 'write-stdin'],
  /** 代码执行。 */
  code: ['js-repl', 'js-repl-reset'],
  /** Web / 浏览器。 */
  web: ['open-url', 'browser-snapshot', 'browser-observe', 'browser-extract', 'browser-act', 'browser-wait'],
  /** 媒体生成。 */
  media: ['image-generate', 'video-generate', 'list-media-models'],
  /** UI / 组件。 */
  ui: ['generate-widget', 'widget-init', 'widget-list', 'widget-get', 'widget-check', 'chart-render'],
  /** 任务管理。 */
  task: ['task-manage', 'task-status'],
  /** 数据库 / 项目。 */
  db: ['project-query', 'project-mutate'],
  /** 日历。 */
  calendar: ['calendar-query', 'calendar-mutate'],
  /** 邮件。 */
  email: ['email-query', 'email-mutate'],
  /** Office。 */
  office: ['office-execute'],
}

/** 反向映射：工具 ID → 所属功能域。 */
const TOOL_TO_GROUP = new Map<string, string>()
for (const [group, ids] of Object.entries(TOOL_GROUPS)) {
  for (const id of ids) {
    TOOL_TO_GROUP.set(id, group)
  }
}

/**
 * 创建 Master Agent 的 prepareStep 回调。
 *
 * - 第 0 步：不限制工具（LLM 自由判断意图）
 * - 后续步骤：根据已使用工具的功能域自动收窄 activeTools
 * - core 组始终可用；agent 组一旦使用后始终可用
 */
function createMasterPrepareStep(
  allToolIds: readonly string[],
): PrepareStepFunction {
  return ({ steps, stepNumber }) => {
    // 第一步不限制
    if (stepNumber === 0) return {}

    // 收集已使用工具所属的功能域
    const activeGroups = new Set<string>(['core'])
    for (const step of steps) {
      for (const tc of step.toolCalls) {
        const group = TOOL_TO_GROUP.get(tc.toolName)
        if (group) activeGroups.add(group)
      }
    }
    // agent 组一旦激活，后续始终可用
    if (activeGroups.has('agent')) activeGroups.add('agent')
    // fileRead 和 fileWrite 绑定：使用写入时也需要读取
    if (activeGroups.has('fileWrite')) activeGroups.add('fileRead')

    // 构建允许的工具集
    const allowed = new Set<string>()
    for (const group of activeGroups) {
      const ids = TOOL_GROUPS[group]
      if (ids) {
        for (const id of ids) allowed.add(id)
      }
    }

    // 与实际注册的工具 ID 取交集
    const activeTools = allToolIds.filter((id) => allowed.has(id))

    logger.debug(
      { stepNumber, activeGroups: [...activeGroups], activeToolCount: activeTools.length },
      '[master-agent] prepareStep: narrowed activeTools',
    )

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
  const toolIds = input.toolIds ?? resolveTemplateToolIds(template)
  const instructions = input.instructions || template.systemPrompt
  const tools = buildToolset(toolIds)
  const wrappedModel = wrapModelWithExamples(input.model)

  // prepareStep 通过 ToolLoopAgent settings 传递到内部 streamText 调用。
  // ToolLoopAgentSettings 类型未声明 prepareStep，但运行时会透传到 streamText。
  // 使用 Object.assign 在运行时注入 prepareStep，避免影响 ToolLoopAgent 的泛型推断。
  const baseSettings = {
    model: wrappedModel,
    instructions,
    tools,
    stopWhen: [stepCountIs(MASTER_HARD_MAX_STEPS), dynamicStepLimit()] as StopCondition<any>[],
    experimental_repairToolCall: createToolCallRepair(),
  }
  // 运行时注入 prepareStep — ToolLoopAgent 内部 spread 到 streamText 时会生效
  Object.assign(baseSettings, { prepareStep: createMasterPrepareStep(toolIds) })

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
    const agentMdPath = path.join(resolveAgentDir(root, templateId), 'AGENT.md')
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
