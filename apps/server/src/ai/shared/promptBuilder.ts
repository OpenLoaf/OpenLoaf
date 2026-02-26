/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { PromptContext, PrefaceCapabilities } from '@/ai/shared/types'

/** Build skills summary section for a session preface. */
export function buildSkillsSummarySection(
  summaries: PromptContext['skillSummaries'],
): string {
  const lines = [
    '# Skills 列表（摘要）',
    '- 仅注入 YAML front matter（name/description）。',
    '- 需要完整说明请使用工具读取对应 SKILL.md。',
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

/** Build selected skills section for a session preface. */
function buildSelectedSkillsSection(
  selectedSkills: string[],
  summaries: PromptContext['skillSummaries'],
): string {
  const lines = ['# 已选择技能（来自 /skill/ 指令）']
  if (selectedSkills.length === 0) {
    lines.push('- 无')
    return lines.join('\n')
  }

  const summaryMap = new Map(summaries.map((summary) => [summary.name, summary]))
  for (const name of selectedSkills) {
    const summary = summaryMap.get(name)
    if (!summary) {
      lines.push(`- ${name} (未找到对应 SKILL.md)`)
      continue
    }
    lines.push(`- ${summary.name} [${summary.scope}] (path: \`${summary.path}\`)`)
  }
  return lines.join('\n')
}

/** Build Python runtime section for a session preface. */
export function buildPythonRuntimeSection(context: PromptContext): string {
  const version = context.python.version ?? 'unknown'
  const pathValue = context.python.path ?? 'unknown'
  const installedLabel = context.python.installed ? '已安装' : '未安装'
  return [
    '# Python 运行时',
    `- 安装状态: ${installedLabel}`,
    `- version: ${version}`,
    `- path: ${pathValue}`,
  ].join('\n')
}

/** Build language enforcement section. */
export function buildLanguageSection(context: PromptContext): string {
  return [
    '# 语言强制',
    `- 当前输出语言：${context.responseLanguage}`,
    '- 你的所有输出必须严格使用上述语言，不得混用或夹杂其他语言。',
  ].join('\n')
}

/** Build environment and identity section. */
export function buildEnvironmentSection(context: PromptContext): string {
  return [
    '# 环境与身份',
    `- workspaceId: ${context.workspace.id}`,
    `- workspaceName: ${context.workspace.name}`,
    `- workspaceRootPath: ${context.workspace.rootPath}`,
    `- projectId: ${context.project.id}`,
    `- projectName: ${context.project.name}`,
    `- projectRootPath: ${context.project.rootPath}`,
    `- platform: ${context.platform}`,
    `- date: ${context.date}`,
    `- timezone: ${context.timezone}`,
    `- accountId: ${context.account.id}`,
    `- accountName: ${context.account.name}`,
    `- accountEmail: ${context.account.email}`,
  ].join('\n')
}

/** Build project rules section. */
export function buildProjectRulesSection(context: PromptContext): string {
  return [
    '# 项目规则（已注入，必须严格遵守）',
    '<project-rules>',
    context.project.rules,
    '</project-rules>',
  ].join('\n')
}

/** Build execution rules section. */
export function buildExecutionRulesSection(): string {
  return [
    '# 执行规则（强制）',
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
    '# 输入中的文件引用（强制）',
    '- 用户输入里的 `@...` 代表文件引用，占位内容是项目内的相对路径。',
    '- 标准格式：`@path/to/file`（默认当前项目根目录）。',
    '- 禁止使用 `@/` 或 `@\\`，必须写成 `@path` 而不是 `@/path`。',
    '- 跨项目格式：`@[projectId]/path`。',
    '- 可选行号范围：`@path/to/file:<start>-<end>`，表示关注指定行区间。',
    '- 系统插入的文件引用会优先使用当前会话的 projectId。',
    '- 示例：`@excel/125_1.xls`、`@[proj_6a5ba1eb-6c89-4bc6-a1a1-ca0ed1b2386d]/年货节主图.xlsx`。',
  ].join('\n')
}

/** Build task delegation rules section. */
export function buildTaskDelegationRulesSection(): string {
  return [
    '# 任务分工（强制）',
    '- 轻量任务由你直接完成。',
    '- 复杂任务必须调用 subAgent 工具。',
    '- 复杂任务判定标准（满足任一条即视为复杂）：',
    '  1) 需要跨多个模块或目录协同修改；',
    '  2) 预计影响 3 个以上文件或涉及系统性重构；',
    '  3) 涉及架构/协议/全局规则调整；',
    '  4) 需要大量上下文分析或风险较高；',
    '  5) 无法在少量工具调用内完成。',
  ].join('\n')
}

/** Build AGENTS dynamic loading rules section. */
export function buildAgentsDynamicLoadingSection(): string {
  return [
    '# AGENTS 动态加载（强制）',
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

/** Build master agent context sections for session preface. */
export function buildMasterAgentSections(context: PromptContext): string[] {
  const skillsSummarySection = buildSkillsSummarySection(context.skillSummaries)
  const selectedSkillsSection = buildSelectedSkillsSection(
    context.selectedSkills,
    context.skillSummaries,
  )
  return [
    buildLanguageSection(context),
    buildEnvironmentSection(context),
    buildPythonRuntimeSection(context),
    buildProjectRulesSection(context),
    skillsSummarySection,
    selectedSkillsSection,
    buildExecutionRulesSection(),
    buildFileReferenceRulesSection(),
    buildTaskDelegationRulesSection(),
    buildAgentsDynamicLoadingSection(),
    buildCompletionSection(),
  ].filter((section) => section.trim().length > 0)
}
