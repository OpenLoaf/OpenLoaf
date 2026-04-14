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
import { expandPathTemplateVars } from '@/ai/tools/toolScope'
import { getBoardId, getProjectId } from '@/ai/shared/context/requestContext'

const NOT_LOGGED_IN_ZH = '未登录'
const NOT_LOGGED_IN_EN = 'not logged in'

/** Build skills summary section — each skill as a <skill> tag with description inside. */
export function buildSkillsSummarySection(
  summaries: PromptContext['skillSummaries'],
): string {
  if (summaries.length === 0) return ''

  return summaries
    .map((s) => `\t<skill name="${s.originalName}">\n\t\t${s.description}\n\t</skill>`)
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

/** Escape a value for safe use inside an XML attribute. */
function xmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Resolve the session kind based on the current request context. */
function resolveSessionKind(context: PromptContext): 'board' | 'project' | 'ephemeral' {
  if (getBoardId()) return 'board'
  if (getProjectId() || !isUnknown(context.project.id)) return 'project'
  return 'ephemeral'
}

/**
 * Format a raw membership tier into a localized display string and flag
 * whether the user is an internal/staff account (tier === 'infinity').
 */
function formatMembershipLevel(
  level: string,
  lang?: PromptLang,
): { display: string; tier: string; isInternal: boolean } {
  const tier = level.toLowerCase().trim()
  const isInternal = tier === 'infinity'
  const zhMap: Record<string, string> = {
    free: '免费版',
    lite: '轻享版',
    pro: '专业版',
    premium: '旗舰版',
    infinity: '内部员工',
  }
  const enMap: Record<string, string> = {
    free: 'Free',
    lite: 'Lite',
    pro: 'Pro',
    premium: 'Premium',
    infinity: 'Internal Staff',
  }
  const map = lang === 'zh' ? zhMap : enMap
  const display = map[tier] ?? level
  return { display, tier, isInternal }
}

/** Build the inner body of the <system-tag type="session-context"> block as nested XML. */
export function buildSessionContextSection(
  sessionId: string,
  context: PromptContext,
  lang?: PromptLang,
): string {
  const isZh = lang === 'zh'
  const kind = resolveSessionKind(context)

  const lines: string[] = []

  // <chat-session>
  lines.push(`  <chat-session id="${xmlAttr(sessionId)}" kind="${kind}" />`)

  // <context-env-vars>
  const varDescs: Array<{ name: string; descZh: string; descEn: string }> = [
    {
      name: 'CURRENT_CHAT_DIR',
      descZh: '当前会话资源目录（WebFetch 原文、上传文件、生成文件都在这里）',
      descEn: 'current session resource directory (WebFetch originals, uploads, generated files)',
    },
    {
      name: 'CURRENT_PROJECT_ROOT',
      descZh: '当前项目根目录',
      descEn: 'current project root directory',
    },
    {
      name: 'CURRENT_BOARD_DIR',
      descZh: '当前画布资源目录（画布内与 ${CURRENT_CHAT_DIR} 等价）',
      descEn: 'current canvas resource directory (equivalent to ${CURRENT_CHAT_DIR} inside a canvas)',
    },
    {
      name: 'USER_MEMORY_DIR',
      descZh: '用户全局记忆目录；`MemorySave` 返回的 filePath 带此前缀，可直接 `Read ${USER_MEMORY_DIR}/xxx.md`',
      descEn: 'user-global memory directory; `MemorySave` filePath uses this prefix, pass straight to `Read ${USER_MEMORY_DIR}/xxx.md`',
    },
    {
      name: 'PROJECT_MEMORY_DIR',
      descZh: '当前项目记忆目录，scope="project" 的记忆写在这里',
      descEn: 'current project memory directory; scope="project" memories live here',
    },
    {
      name: 'HOME',
      descZh: '用户主目录',
      descEn: 'user home directory',
    },
  ]
  const envVarsDesc = isZh
    ? '当前上下文环境变量（工具入参/Bash 命令中可直接使用，左侧模板会被自动展开为右侧绝对路径）'
    : 'Context environment variables (use the ${NAME} token directly in tool inputs / Bash; it is auto-expanded to the absolute path on the right)'
  const varLines: string[] = []
  for (const v of varDescs) {
    const token = `\${${v.name}}`
    const expanded = expandPathTemplateVars(token)
    if (expanded === token) continue // variable is not resolvable in current context
    const desc = isZh ? v.descZh : v.descEn
    varLines.push(`    - ${token} = ${expanded} — ${desc}`)
  }
  lines.push(`  <context-env-vars desc="${xmlAttr(envVarsDesc)}">`)
  lines.push(...varLines)
  lines.push('  </context-env-vars>')

  // <environment>
  const [osNameRaw, ...osRest] = context.platform.split(' ')
  const osName = osNameRaw ?? 'unknown'
  const osVersion = osRest.join(' ') || 'unknown'
  lines.push('  <environment>')
  lines.push(`    <os name="${xmlAttr(osName)}" version="${xmlAttr(osVersion)}" />`)
  lines.push(
    `    <locale timezone="${xmlAttr(context.timezone)}" language="${xmlAttr(context.responseLanguage)}" />`,
  )
  if (context.python.installed) {
    const pyVer = context.python.version ?? 'unknown'
    const pyPath = context.python.path ?? ''
    const pathAttr = pyPath ? ` path="${xmlAttr(pyPath)}"` : ''
    lines.push(`    <runtime name="python" version="${xmlAttr(pyVer)}"${pathAttr} />`)
  }
  const apps = context.appVersions
  if (apps?.server) {
    lines.push(`    <app name="openloaf-server" version="${xmlAttr(apps.server)}" />`)
  }
  if (apps?.web) {
    lines.push(`    <app name="openloaf-web" version="${xmlAttr(apps.web)}" />`)
  }
  if (apps?.desktop) {
    lines.push(`    <app name="openloaf-desktop" version="${xmlAttr(apps.desktop)}" />`)
  }
  lines.push('  </environment>')

  // <account>
  const accountIsEmpty =
    context.account.id === NOT_LOGGED_IN_ZH ||
    context.account.id === NOT_LOGGED_IN_EN ||
    context.account.name === NOT_LOGGED_IN_ZH ||
    context.account.name === NOT_LOGGED_IN_EN
  if (!accountIsEmpty) {
    const email = context.account.email
    const showEmail = email && !email.endsWith('@wechat.local')
    const levelInfo = context.account.level
      ? formatMembershipLevel(context.account.level, lang)
      : null
    const attrs = [
      `name="${xmlAttr(context.account.name)}"`,
      showEmail ? `email="${xmlAttr(email)}"` : '',
      levelInfo ? `level="${xmlAttr(levelInfo.display)}"` : '',
      levelInfo ? `tier="${xmlAttr(levelInfo.tier)}"` : '',
      levelInfo?.isInternal ? 'internal="true"' : '',
    ]
      .filter(Boolean)
      .join(' ')
    const baseHint = isZh
      ? '查询积分/会员等级/账号详情 → `CloudUserInfo`（需先 ToolSearch 加载）'
      : 'Query credits / membership / account details → `CloudUserInfo` (load via ToolSearch first)'
    const internalHint = levelInfo?.isInternal
      ? (isZh
          ? 'OpenLoaf 内部员工账号：不受等级门槛限制，可直接调用任意云端能力。'
          : 'OpenLoaf internal staff account: bypasses all tier gates and can invoke any cloud capability directly.')
      : ''
    lines.push(`  <account ${attrs}>`)
    if (internalHint) lines.push(`    ${internalHint}`)
    lines.push(`    ${baseHint}`)
    lines.push('  </account>')
  } else {
    const hint = isZh
      ? '用户要查积分/会员/账号 或 要登录 → `CloudLogin`（ToolSearch 加载后调用，会弹登录卡片）'
      : 'If the user asks about credits / membership / account or wants to sign in → `CloudLogin` (load via ToolSearch, then call — opens a sign-in card)'
    lines.push('  <account status="not-logged-in">')
    lines.push(`    ${hint}`)
    lines.push('  </account>')
  }

  return lines.join('\n')
}
