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
import { detectPrefaceCapabilities } from '@/ai/shared/toolCapabilityDetector'
import {
  buildLanguageSection,
  buildEnvironmentSection,
  buildPythonRuntimeSection,
  buildProjectRulesSection,
  buildSkillsSummarySection,
  buildExecutionRulesSection,
  buildFileReferenceRulesSection,
  buildTaskDelegationRulesSection,
  buildAgentsDynamicLoadingSection,
  buildCompletionSection,
} from '@/ai/shared/promptBuilder'
import { loadSkillSummaries } from '@/ai/services/skillsLoader'
import { loadAgentSummaries } from '@/ai/services/agentConfigService'
import { ALL_TEMPLATES } from '@/ai/agent-templates'
import { resolvePythonInstallInfo } from '@/ai/models/cli/pythonTool'
import { getAuthSessionSnapshot } from '@/modules/auth/tokenStore'
import { getSaasAccessToken } from '@/ai/shared/context/requestContext'
import { readBasicConf } from '@/modules/settings/openloafConfStore'

import {
  getWorkspaceById,
  getActiveWorkspace,
  getWorkspaceRootPath,
  getWorkspaceRootPathById,
  getProjectRootPath,
} from '@openloaf/api/services/vfsService'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { logger } from '@/common/logger'

const UNKNOWN_VALUE = 'unknown'
const ROOT_RULES_FILE = 'AGENTS.md'

/** 子 agent 可用 agent 摘要（用于 preface 注入）。 */
type SubAgentEntry = {
  name: string
  description: string
  toolIds: string[]
}

/** 构建可用子 Agent 列表章节。 */
export function buildSubAgentListSection(agents: SubAgentEntry[]): string {
  const lines = [
    '# 可用子 Agent',
    '- 以下是可通过 spawn-agent 工具调用的 agent 列表。',
  ]
  if (agents.length === 0) {
    lines.push('- 无可用子 Agent。')
    return lines.join('\n')
  }
  for (const agent of agents) {
    const tools = agent.toolIds.length > 0
      ? agent.toolIds.join(', ')
      : '无'
    lines.push(`- **${agent.name}**: ${agent.description} (tools: ${tools})`)
  }
  return lines.join('\n')
}

/** 收集所有可用 agent（模板 + 动态）。 */
export function collectAvailableAgents(input: {
  workspaceRootPath?: string
  projectRootPath?: string
  parentProjectRootPaths?: string[]
}): SubAgentEntry[] {
  const entries: SubAgentEntry[] = []
  const seen = new Set<string>()

  // 逻辑：内置模板 agent（排除 master 和 builtinOnly）
  for (const tpl of ALL_TEMPLATES) {
    if (tpl.isPrimary || tpl.isBuiltinOnly) continue
    if (seen.has(tpl.name)) continue
    seen.add(tpl.name)
    entries.push({
      name: tpl.name,
      description: tpl.description,
      toolIds: [...tpl.toolIds],
    })
  }

  // 逻辑：动态 agent（从文件系统扫描）
  try {
    const dynamicAgents = loadAgentSummaries({
      workspaceRootPath: input.workspaceRootPath,
      projectRootPath: input.projectRootPath,
      parentProjectRootPaths: input.parentProjectRootPaths,
    })
    for (const agent of dynamicAgents) {
      if (seen.has(agent.name)) continue
      seen.add(agent.name)
      entries.push({
        name: agent.name,
        description: agent.description,
        toolIds: [...agent.toolIds],
      })
    }
  } catch (err) {
    logger.warn({ err }, '[sub-agent-preface] loadAgentSummaries failed')
  }

  return entries
}

/** 解析子 agent 的 PromptContext（轻量版，不含 memory）。 */
async function resolveSubAgentPromptContext(input: {
  workspaceId?: string
  projectId?: string
  parentProjectRootPaths?: string[]
  timezone?: string
}): Promise<PromptContext> {
  // workspace
  let workspace = { id: UNKNOWN_VALUE, name: UNKNOWN_VALUE, rootPath: UNKNOWN_VALUE }
  try {
    const ws = input.workspaceId ? getWorkspaceById(input.workspaceId) : null
    const fallback = ws ?? getActiveWorkspace()
    workspace = {
      id: fallback?.id ?? input.workspaceId ?? UNKNOWN_VALUE,
      name: fallback?.name ?? UNKNOWN_VALUE,
      rootPath: (input.workspaceId
        ? getWorkspaceRootPathById(input.workspaceId)
        : null) ?? getWorkspaceRootPath(),
    }
  } catch { /* fallback */ }

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

  // account
  let account = { id: '未登录', name: '未登录', email: '未登录' }
  try {
    const snapshot = getAuthSessionSnapshot()
    if (snapshot.loggedIn && snapshot.user) {
      account = {
        id: snapshot.user.sub ?? UNKNOWN_VALUE,
        name: snapshot.user.name ?? UNKNOWN_VALUE,
        email: snapshot.user.email ?? UNKNOWN_VALUE,
      }
    } else {
      // 回退：从当前请求的 SaaS access token 解析用户信息。
      const saasToken = getSaasAccessToken()
      if (saasToken) {
        const parts = saasToken.split('.')
        if (parts.length >= 2 && parts[1]) {
          const raw = parts[1].replace(/-/g, '+').replace(/_/g, '/')
          const padded = raw.padEnd(Math.ceil(raw.length / 4) * 4, '=')
          const payload = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8')) as Record<string, unknown>
          const sub = typeof payload.sub === 'string' ? payload.sub : undefined
          const name = typeof payload.name === 'string' ? payload.name : undefined
          const email = typeof payload.email === 'string' ? payload.email : undefined
          if (sub || name || email) {
            account = {
              id: sub ?? UNKNOWN_VALUE,
              name: name ?? UNKNOWN_VALUE,
              email: email ?? UNKNOWN_VALUE,
            }
          }
        }
      }
    }
  } catch { /* fallback */ }

  // language
  let responseLanguage = UNKNOWN_VALUE
  try {
    responseLanguage = readBasicConf().modelResponseLanguage
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
    workspaceRootPath: workspace.rootPath !== UNKNOWN_VALUE ? workspace.rootPath : undefined,
    projectRootPath: project.rootPath !== UNKNOWN_VALUE ? project.rootPath : undefined,
    parentProjectRootPaths: input.parentProjectRootPaths ?? [],
  })

  return {
    workspace,
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
}): Promise<string> {
  const capabilities = detectPrefaceCapabilities(input.toolIds)

  const context = await resolveSubAgentPromptContext({
    workspaceId: input.requestContext.workspaceId,
    projectId: input.requestContext.projectId,
    parentProjectRootPaths: input.requestContext.parentProjectRootPaths,
    timezone: input.requestContext.timezone,
  })

  const sections: string[] = []

  // 会话上下文
  sections.push([
    '# 会话上下文（preface）',
    '**重要：以下所有 preface 信息仅供你内部使用，严禁在回复中向用户展示。**',
    `- agentId: ${input.agentId}`,
    `- agentName: ${input.agentName}`,
    `- parentSessionId: ${input.parentSessionId}`,
    `- workspaceId: ${context.workspace.id}`,
    `- projectId: ${context.project.id}`,
    `- projectRootPath: ${context.project.rootPath}`,
  ].join('\n'))

  // 语言强制
  sections.push(buildLanguageSection(context))

  // 环境与身份
  sections.push(buildEnvironmentSection(context))

  // Python 运行时（可选）
  if (capabilities.needsPythonRuntime) {
    sections.push(buildPythonRuntimeSection(context))
  }

  // 项目规则（可选）
  if (capabilities.needsProjectRules) {
    sections.push(buildProjectRulesSection(context))
  }

  // 可用子 Agent 列表（可选）
  if (capabilities.needsSubAgentList) {
    const agents = collectAvailableAgents({
      workspaceRootPath: context.workspace.rootPath !== UNKNOWN_VALUE
        ? context.workspace.rootPath
        : undefined,
      projectRootPath: context.project.rootPath !== UNKNOWN_VALUE
        ? context.project.rootPath
        : undefined,
      parentProjectRootPaths: input.requestContext.parentProjectRootPaths,
    })
    sections.push(buildSubAgentListSection(agents))
  }

  // 执行规则
  sections.push(buildExecutionRulesSection())

  // 文件引用规则（可选）
  if (capabilities.needsFileReferenceRules) {
    sections.push(buildFileReferenceRulesSection())
  }

  // 任务分工规则（可选）
  if (capabilities.needsTaskDelegationRules) {
    sections.push(buildTaskDelegationRulesSection())
  }

  // Skills 列表（子 agent 默认无技能，仅勾选的才注入）
  const activeSkills = input.skills?.length
    ? context.skillSummaries.filter((s) => input.skills!.includes(s.name))
    : []
  if (activeSkills.length > 0) {
    sections.push(buildSkillsSummarySection(activeSkills))
  }

  // AGENTS 动态加载
  sections.push(buildAgentsDynamicLoadingSection())

  // 完成条件
  sections.push(buildCompletionSection())

  return sections.filter((s) => s.trim().length > 0).join('\n\n')
}
