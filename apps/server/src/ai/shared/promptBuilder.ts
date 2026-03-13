/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import type { PromptContext } from '@/ai/shared/types'

const UNKNOWN_VALUE = 'unknown'

/** Build skills summary section for a session preface. */
export function buildSkillsSummarySection(
  summaries: PromptContext['skillSummaries'],
): string {
  const lines = [
    '# Skills',
    '仅注入摘要。需要完整说明时，调用 load-skill 工具加载技能（传入技能 name）。',
  ]

  if (summaries.length === 0) {
    lines.push('- 未发现可用 skills。')
    return lines.join('\n')
  }

  for (const summary of summaries) {
    lines.push(
      `- ${summary.name} [${summary.scope}] ${summary.description}`,
    )
  }
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
    '# 项目规则',
    '以下规则已注入，必须严格遵守。',
    context.project.rules,
  ].join('\n')
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
    '# 会话上下文',
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
