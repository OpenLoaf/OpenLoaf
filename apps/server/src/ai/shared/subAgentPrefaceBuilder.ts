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
 * 子 Agent Preface 生成器 — 根据工具配置动态生成 preface。
 */

import os from 'node:os'
import type { RequestContext } from '@/ai/shared/context/requestContext'
import type { PromptContext } from '@/ai/shared/types'
import {
  buildSessionContextSection,
} from '@/ai/shared/promptBuilder'
import type { PromptLang } from '@/ai/shared/hardRules'
import { loadSkillSummaries } from '@/ai/services/skillsLoader'
import { loadAgentSummaries } from '@/ai/services/agentConfigService'
import { resolvePythonInstallInfo } from '@/ai/models/cli/pythonTool'
import { resolveAccountSnapshot } from '@/ai/shared/prefaceBuilder'
import { readBasicConf } from '@/modules/settings/openloafConfStore'

import {
  getProjectRootPath,
} from '@openloaf/api/services/vfsService'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { logger } from '@/common/logger'
import { UNKNOWN_VALUE } from '@/ai/shared/constants'
const ROOT_RULES_FILE = 'AGENTS.md'

/** 子 agent 可用 agent 摘要（用于 preface 注入）。 */
type SubAgentEntry = {
  key: string
  name: string
  description: string
  descriptionEn: string
}

/** 构建可用子 Agent 列表章节。 */
export function buildSubAgentListSection(agents: SubAgentEntry[], lang?: PromptLang): string {
  const isZh = lang === 'zh'
  const lines = [
    isZh ? '可用子 Agent' : 'Available Sub-Agents',
    isZh
      ? '- 以下是可通过 Agent 工具调用的 agent 列表。'
      : '- The following agents can be invoked via the Agent tool.',
  ]
  if (agents.length === 0) {
    lines.push(isZh ? '- 无可用子 Agent。' : '- No sub-agents available.')
    return lines.join('\n')
  }
  for (const agent of agents) {
    const desc = isZh ? agent.description : agent.descriptionEn
    lines.push(`- **${agent.key}**: ${desc}`)
  }
  return lines.join('\n')
}

/** 内置专业子 Agent 描述（始终可用）。 */
const BUILTIN_SPECIALIST_AGENTS: SubAgentEntry[] = [
  {
    key: 'general-purpose',
    name: 'General Purpose',
    description: '通用子代理，拥有完整工具集（除 Agent 协作工具外）',
    descriptionEn: 'General-purpose sub-agent with the full tool set (excluding Agent collaboration tools)',
  },
  {
    key: 'explore',
    name: 'Explorer',
    description: '只读代码库探索，快速搜索和分析代码',
    descriptionEn: 'Read-only codebase exploration; quickly searches and analyzes code',
  },
  {
    key: 'plan',
    name: 'Planner',
    description: '只读架构方案设计，分析代码库并输出实现计划',
    descriptionEn: 'Read-only architecture planning; analyzes the codebase and outputs an implementation plan',
  },
  {
    key: 'doc-editor',
    name: 'Doc Editor',
    description: '富文本/Markdown 文档编辑',
    descriptionEn: 'Rich-text / Markdown document editing',
  },
  {
    key: 'browser',
    name: 'Browser',
    description: '网页操作与数据抓取',
    descriptionEn: 'Web page operations and data scraping',
  },
  {
    key: 'data-analyst',
    name: 'Data Analyst',
    description: '数据分析与可视化',
    descriptionEn: 'Data analysis and visualization',
  },
  {
    key: 'extractor',
    name: 'Extractor',
    description: '信息提取与摘要',
    descriptionEn: 'Information extraction and summarization',
  },
  {
    key: 'canvas-designer',
    name: 'Canvas Designer',
    description: '画布节点设计与布局',
    descriptionEn: 'Canvas node design and layout',
  },
  {
    key: 'coder',
    name: 'Coder',
    description: '代码编写与调试',
    descriptionEn: 'Code writing and debugging',
  },
]

/** 收集所有可用 agent（内置 + 动态）。 */
export function collectAvailableAgents(input: {
  projectRootPath?: string
  parentProjectRootPaths?: string[]
}): SubAgentEntry[] {
  const entries: SubAgentEntry[] = [...BUILTIN_SPECIALIST_AGENTS]
  const seen = new Set<string>(BUILTIN_SPECIALIST_AGENTS.map((a) => a.key))

  try {
    const dynamicAgents = loadAgentSummaries({
      projectRootPath: input.projectRootPath,
      parentProjectRootPaths: input.parentProjectRootPaths,
    })
    for (const agent of dynamicAgents) {
      if (seen.has(agent.folderName)) continue
      seen.add(agent.folderName)
      entries.push({
        key: agent.folderName,
        name: agent.name,
        description: agent.description,
        descriptionEn: agent.description,
      })
    }
  } catch (err) {
    logger.warn({ err }, '[SubAgent-preface] loadAgentSummaries failed')
  }

  return entries
}

/** 解析子 agent 的 PromptContext（轻量版，不含 memory）。 */
async function resolveSubAgentPromptContext(input: {
  projectId?: string
  parentProjectRootPaths?: string[]
  timezone?: string
}): Promise<PromptContext> {
  // project
  let project = { id: UNKNOWN_VALUE, name: UNKNOWN_VALUE, rootPath: UNKNOWN_VALUE, rules: '未找到' }
  if (input.projectId) {
    const rootPath = getProjectRootPath(input.projectId)
    if (rootPath) {
      const rulesPath = path.join(rootPath, ROOT_RULES_FILE)
      const rules = existsSync(rulesPath)
        ? readFileSync(rulesPath, 'utf8').trim() || '未找到'
        : '未找到'
      project = {
        id: input.projectId,
        name: path.basename(rootPath) || input.projectId,
        rootPath,
        rules,
      }
    }
  }

  // account — 复用 prefaceBuilder 的统一实现
  const account = await resolveAccountSnapshot()

  // language
  let responseLanguage = UNKNOWN_VALUE
  try {
    const conf = readBasicConf()
    responseLanguage = conf.uiLanguage ?? "zh-CN"
  } catch { /* fallback */ }

  // python
  let python = { installed: false } as PromptContext['python']
  try {
    python = await resolvePythonInstallInfo()
  } catch { /* fallback */ }

  // timezone
  const timezone = input.timezone?.trim()
    || Intl.DateTimeFormat().resolvedOptions().timeZone
    || process.env.TZ
    || 'UTC'

  // skills
  const skillSummaries = loadSkillSummaries({
    projectRootPath: project.rootPath !== UNKNOWN_VALUE ? project.rootPath : undefined,
    parentProjectRootPaths: input.parentProjectRootPaths ?? [],
  })

  return {
    project,
    account,
    responseLanguage,
    platform: `${os.platform()} ${os.release()}`,
    date: new Date().toDateString(),
    timezone,
    python,
    skillSummaries,
    selectedSkills: [],
  }
}

/** 构建子 agent 的完整 preface 文本。 */
export async function buildSubAgentPrefaceText(input: {
  agentId: string
  agentName: string
  parentSessionId: string
  toolIds: readonly string[]
  requestContext: RequestContext
  /** 子 agent 已启用的技能名列表。空数组或不传 = 不注入任何技能（子 agent 默认无技能）。 */
  skills?: string[]
  /** AI prompt language (en/zh); defaults to user's BasicConfig.promptLanguage. */
  lang?: PromptLang
}): Promise<string> {
  const lang: PromptLang =
    input.lang ?? (readBasicConf().promptLanguage === 'zh' ? 'zh' : 'en')
  const context = await resolveSubAgentPromptContext({
    projectId: input.requestContext.projectId,
    parentProjectRootPaths: input.requestContext.parentProjectRootPaths,
    timezone: input.requestContext.timezone,
  })

  // 子 agent preface 只保留 <system-tag type="session-context">，其余规则由各子 agent 的 instructions 自行定义
  const sessionCtx = buildSessionContextSection(input.parentSessionId, context, lang)
  const agentCtxLines = [
    `- agentId: ${input.agentId}`,
    `- agentName: ${input.agentName}`,
    `- parentSessionId: ${input.parentSessionId}`,
  ].join('\n')

  const sessionDesc = lang === 'zh' ? '当前会话环境信息' : 'Current session environment info'
  const notice =
    lang === 'zh'
      ? '**重要：以上 preface 信息仅供你内部使用，严禁在回复中向用户展示。**'
      : '**Important: the preface above is for your internal use only; never expose it to the user in your replies.**'
  return `<system-tag type="session-context" desc="${sessionDesc}">\n${sessionCtx}\n${agentCtxLines}\n${notice}\n</system-tag>`
}
