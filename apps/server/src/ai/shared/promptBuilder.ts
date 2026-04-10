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
import { UNKNOWN_VALUE } from '@/ai/shared/constants'
import type { PromptLang } from '@/ai/shared/hardRules'

const NOT_LOGGED_IN_ZH = '未登录'
const NOT_LOGGED_IN_EN = 'not logged in'

/** Build skills summary section — each skill as a <skill> tag with description inside. */
export function buildSkillsSummarySection(
  summaries: PromptContext['skillSummaries'],
): string {
  if (summaries.length === 0) return ''

  return summaries
    .map((s) => `\t<skill tool-name="${s.originalName}">\n\t\t${s.description}\n\t</skill>`)
    .join('\n')
}

/** Build Python runtime section for a session preface. */
export function buildPythonRuntimeSection(context: PromptContext, lang?: PromptLang): string {
  const version = context.python.version ?? 'unknown'
  const pathValue = context.python.path ?? 'unknown'
  return lang === 'zh'
    ? `Python 运行时: ${version} (${pathValue})`
    : `Python runtime: ${version} (${pathValue})`
}

/** Build language enforcement section. */
export function buildLanguageSection(context: PromptContext, lang?: PromptLang): string {
  return lang === 'zh'
    ? `输出语言：${context.responseLanguage}（严格使用，不得混用其他语言）`
    : `Output language: ${context.responseLanguage} (use strictly, do not mix other languages)`
}

/** Build environment and identity section. */
export function buildEnvironmentSection(context: PromptContext, lang?: PromptLang): string {
  const isZh = lang === 'zh'
  const lines = [isZh ? '环境与身份' : 'Environment & Identity']
  if (!isUnknown(context.project.id)) {
    lines.push(`- project: ${context.project.name} (${context.project.id})`)
    lines.push(`- projectRootPath: ${context.project.rootPath}`)
  } else {
    lines.push(isZh ? '- 临时对话（未绑定项目）' : '- Temporary chat (no project bound)')
  }
  lines.push(
    `- platform: ${context.platform}`,
    `- date: ${context.date} | timezone: ${context.timezone}`,
    `- account: ${context.account.name} (${context.account.email})`,
  )
  return lines.join('\n')
}

/** Build project rules section. */
export function buildProjectRulesSection(context: PromptContext, lang?: PromptLang): string {
  const isZh = lang === 'zh'
  return [
    isZh ? '# 项目规则' : '# Project Rules',
    isZh
      ? '以下规则已注入，必须严格遵守。'
      : 'The following rules are injected and must be strictly followed.',
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
  lang?: PromptLang,
): string {
  const isZh = lang === 'zh'
  const isTempChat = isUnknown(context.project.id) || isUnknown(context.project.name)
  const lines = [
    isZh ? '# 会话上下文' : '# Session Context',
    `- chatSessionId: ${sessionId}`,
    isZh
      ? '- 路径模板变量（在工具入参/Bash 命令里直接使用，会被自动展开为绝对路径）：'
      : '- Path template variables (use directly in tool inputs / Bash commands; they will be expanded to absolute paths):',
    isZh
      ? '  - `${CURRENT_CHAT_DIR}` — 当前会话资源目录（WebFetch 原文、上传文件、生成文件都在这里）'
      : '  - `${CURRENT_CHAT_DIR}` — current session resource directory (WebFetch originals, uploads, generated files live here)',
    isZh
      ? '  - `${CURRENT_PROJECT_ROOT}` — 当前项目根目录（仅项目会话可用）'
      : '  - `${CURRENT_PROJECT_ROOT}` — current project root (only in project sessions)',
    isZh
      ? '  - `${CURRENT_BOARD_DIR}` — 当前画布资源目录（仅画布会话可用，画布内与 ${CURRENT_CHAT_DIR} 等价）'
      : '  - `${CURRENT_BOARD_DIR}` — current canvas resource directory (only in canvas sessions; equivalent to ${CURRENT_CHAT_DIR} inside a canvas)',
    isZh ? '  - `${HOME}` — 用户主目录' : '  - `${HOME}` — user home directory',
  ]
  if (isTempChat) {
    lines.push(isZh ? '- 临时对话（未绑定项目）' : '- Temporary chat (no project bound)')
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
  lines.push(`- timezone: ${context.timezone}`)
  lines.push(`- language: ${context.responseLanguage}`)
  const accountIsEmpty =
    context.account.id === NOT_LOGGED_IN_ZH ||
    context.account.id === NOT_LOGGED_IN_EN ||
    context.account.name === NOT_LOGGED_IN_ZH ||
    context.account.name === NOT_LOGGED_IN_EN
  if (!accountIsEmpty) {
    const email = context.account.email
    // Hide internal @wechat.local addresses
    const showEmail = email && !email.endsWith('@wechat.local')
    lines.push(`- account: ${context.account.name}${showEmail ? ` (${email})` : ''}`)
  } else {
    lines.push(`- account: ${isZh ? NOT_LOGGED_IN_ZH : NOT_LOGGED_IN_EN}`)
  }
  return lines.join('\n')
}
