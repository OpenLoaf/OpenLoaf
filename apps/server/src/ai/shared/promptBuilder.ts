/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from 'node:path'
import type { PromptContext, PrefaceCapabilities } from '@/ai/shared/types'

const UNKNOWN_VALUE = 'unknown'

/** Build skills summary section for a session preface. */
export function buildSkillsSummarySection(
  summaries: PromptContext['skillSummaries'],
): string {
  const lines = [
    'Skills 列表（摘要）',
    '- 仅注入 YAML front matter（name/description）。',
    '- 需要完整说明时，调用 load-skill 工具加载技能（传入技能 name）。',
    '- load-skill 会返回技能完整内容及 basePath，技能中的相对路径均相对于 basePath。',
  ]

  if (summaries.length === 0) {
    lines.push('- 未发现可用 skills。')
    return lines.join('\n')
  }

  for (const summary of summaries) {
    lines.push(
      `- ${summary.name} [${summary.scope}] ${summary.description} (command: \`/skill/${summary.name}\`, path: \`${summary.path}\`)`,
    )
  }
  return lines.join('\n')
}

/** Build active skills section for a session preface (config-driven). */
function buildActiveSkillsSection(
  selectedSkills: string[],
  summaries: PromptContext['skillSummaries'],
): string {
  // 空数组 = 全部启用（向后兼容）
  if (selectedSkills.length === 0 || selectedSkills.length >= summaries.length) {
    return [
      '# 已启用技能',
      '- 所有技能均已启用，需要时调用 load-skill 工具加载完整指引。',
      '- **当技能与可用子 Agent 功能重叠时，优先通过 spawn-agent 使用子 Agent。**',
    ].join('\n')
  }

  const lines = ['# 已启用技能']
  const summaryMap = new Map(summaries.map((summary) => [summary.name, summary]))
  for (const name of selectedSkills) {
    const summary = summaryMap.get(name)
    if (!summary) {
      lines.push(`- ${name} (未找到对应 SKILL.md)`)
      continue
    }
    lines.push(`- ${summary.name} [${summary.scope}] (path: \`${summary.path}\`)`)
  }
  lines.push('')
  lines.push('- **当技能与可用子 Agent 功能重叠时，优先通过 spawn-agent 使用子 Agent。**')
  return lines.join('\n')
}

/** Build Python runtime section for a session preface. */
export function buildPythonRuntimeSection(context: PromptContext): string {
  const version = context.python.version ?? 'unknown'
  const pathValue = context.python.path ?? 'unknown'
  return `Python 运行时: ${version} (${pathValue})`
}

/** Build language enforcement section. */
export function buildLanguageSection(context: PromptContext): string {
  return `输出语言：${context.responseLanguage}（严格使用，不得混用其他语言）`
}

/** Build environment and identity section. */
export function buildEnvironmentSection(context: PromptContext): string {
  const lines = [
    '环境与身份',
  ]
  if (!isUnknown(context.project.id)) {
    lines.push(`- project: ${context.project.name} (${context.project.id})`)
    lines.push(`- projectRootPath: ${context.project.rootPath}`)
  } else {
    lines.push('- 临时对话（未绑定项目）')
  }
  lines.push(
    `- platform: ${context.platform}`,
    `- date: ${context.date} | timezone: ${context.timezone}`,
    `- account: ${context.account.name} (${context.account.email})`,
  )
  return lines.join('\n')
}

/** Build project rules section. */
export function buildProjectRulesSection(context: PromptContext): string {
  return [
    '项目规则（已注入，必须严格遵守）',
    '<project-rules>',
    context.project.rules,
    '</project-rules>',
  ].join('\n')
}

/** Build execution rules section. */
export function buildExecutionRulesSection(): string {
  return [
    '执行规则',
    '- 工具优先：先用工具获取事实，再输出结论。',
    '- 工具结果必须先简要总结后再继续下一步。',
    '- 文件与命令工具仅允许访问 projectRootPath 内的路径。',
    '- 路径参数禁止使用 URL Encoding 编码，必须保持原始路径字符。',
    '- 文件读取类工具必须先判断路径是否为目录；若为目录需改用目录列举工具或提示用户改传文件。',
    '- 写入、删除或破坏性操作必须走审批流程。',
  ].join('\n')
}

/** Build file reference rules section. */
export function buildFileReferenceRulesSection(): string {
  return [
    '# 输入中的文件引用',
    '- 用户输入里的 `@{...}` 代表文件引用，花括号内为项目相对路径。',
    '- 标准格式：`@{path/to/file}`（默认当前项目根目录）。',
    '- 文件引用必须用 @{...} 花括号包裹，花括号内为项目相对路径。',
    '- 跨项目格式：`@{[projectId]/path}`。',
    '- 可选行号范围：`@{path/to/file:start-end}`，表示关注指定行区间。',
    '- 系统插入的文件引用会优先使用当前会话的 projectId。',
    '- 示例：`@{excel/125_1.xls}`、`@{[proj_6a5ba1eb]/年货节主图.xlsx}`。',
  ].join('\n')
}

/** Build task delegation rules section. */
export function buildTaskDelegationRulesSection(): string {
  return [
    '任务分工',
    '- 简单的事情亲自动手，干净利落。',
    '- 复杂的事情不要一个人硬扛——把它委派给专门的子代理，让他们在独立空间里完成，你只关注最终结果。这样既保护你的注意力，也提升整体效率。',
    '- 什么算"复杂"？凭判断力，但以下情况通常值得委派：',
    '  1) 需要跨多个模块或目录协同修改；',
    '  2) 预计影响 3 个以上文件或涉及系统性重构；',
    '  3) 涉及架构/协议/全局规则调整；',
    '  4) 需要大量上下文分析或风险较高；',
    '  5) 无法在少量步骤内完成。',
  ].join('\n')
}

/** Build AGENTS dynamic loading rules section. */
export function buildAgentsDynamicLoadingSection(): string {
  return [
    '# AGENTS 动态加载',
    '- 当你搜索文件或目录时，若结果所在目录存在 AGENTS.md，必须立即读取并遵守。',
    '- 多层规则冲突时，优先级：更深层目录 > 上层目录 > 根目录。',
  ].join('\n')
}

/** Build completion criteria section. */
export function buildCompletionSection(): string {
  return ['# 完成条件', '- 用户问题被解决，或给出明确可执行的下一步操作。'].join('\n')
}

/** Build context sections filtered by capabilities. */
export function buildAgentSections(
  context: PromptContext,
  capabilities: PrefaceCapabilities,
): string[] {
  const sections: string[] = []

  // 基础章节（所有 agent 都需要）
  sections.push(buildLanguageSection(context))
  sections.push(buildEnvironmentSection(context))

  // 可选章节
  if (capabilities.needsPythonRuntime) {
    sections.push(buildPythonRuntimeSection(context))
  }
  if (capabilities.needsProjectRules) {
    sections.push(buildProjectRulesSection(context))
  }

  // Skills 列表（所有 agent 都需要）
  sections.push(buildSkillsSummarySection(context.skillSummaries))

  // 执行规则（所有 agent 都需要）
  sections.push(buildExecutionRulesSection())

  if (capabilities.needsFileReferenceRules) {
    sections.push(buildFileReferenceRulesSection())
  }
  if (capabilities.needsTaskDelegationRules) {
    sections.push(buildTaskDelegationRulesSection())
  }

  // AGENTS 动态加载（所有 agent 都需要）
  sections.push(buildAgentsDynamicLoadingSection())

  // 完成条件（所有 agent 都需要）
  sections.push(buildCompletionSection())

  return sections.filter((section) => section.trim().length > 0)
}

/** Check if a value is the unknown fallback. */
function isUnknown(value: string): boolean {
  return !value || value === UNKNOWN_VALUE
}

/** Build session context section with merged environment and identity info. */
export function buildSessionContextSection(
  sessionId: string,
  context: PromptContext,
): string {
  const isTempChat = isUnknown(context.project.id) || isUnknown(context.project.name)
  const lines = [
    '会话上下文',
    `- chatSessionId: ${sessionId}`,
  ]
  if (isTempChat) {
    lines.push('- 临时对话（未绑定项目）')
  } else {
    lines.push(`- project: ${context.project.name} (${context.project.id})`)
    lines.push(`- projectRootPath: ${context.project.rootPath}`)
  }
  lines.push(`- platform: ${context.platform}`)
  if (context.python.installed) {
    const version = context.python.version ?? 'unknown'
    const pyPath = context.python.path ?? 'unknown'
    lines.push(`- python: ${version} (${pyPath})`)
  }
  lines.push(`- date: ${context.date} | timezone: ${context.timezone}`)
  if (context.account.id !== '未登录' && context.account.name !== '未登录') {
    lines.push(`- account: ${context.account.name} (${context.account.email})`)
  } else {
    lines.push('- account: 未登录')
  }
  return lines.join('\n')
}

/**
 * Build master agent context sections for session preface.
 * @deprecated Use individual section builders directly from prefaceBuilder.ts.
 * Kept for backward compatibility — AGENTS dynamic loading and completion
 * criteria are now in hardRules.ts (Layer 2).
 */
export function buildMasterAgentSections(
  sessionId: string,
  context: PromptContext,
): string[] {
  const sections: string[] = []

  sections.push(buildSessionContextSection(sessionId, context))
  sections.push(buildLanguageSection(context))

  // Python 运行时 — 仅已安装时添加
  if (context.python.installed) {
    sections.push(buildPythonRuntimeSection(context))
  }

  // 项目规则 — 仅有内容时添加
  if (context.project.rules && context.project.rules !== '未找到') {
    sections.push(buildProjectRulesSection(context))
  }

  // NOTE: buildAgentsDynamicLoadingSection() and buildCompletionSection()
  // are no longer called here — they moved to hardRules.ts (system instructions Layer 2).

  return sections.filter((section) => section.trim().length > 0)
}
