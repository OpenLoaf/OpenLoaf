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
 * 通用 Agent 模型解析 — 从指定 agent 的配置读取模型 ID。
 *
 * 搜索顺序：项目 .openloaf/agents/ → 全局 ~/.openloaf/agents/。
 * chatStreamService 和 agentTools 共用此函数，避免重复逻辑。
 */

import path from 'node:path'
import { existsSync } from 'node:fs'
import type { ChatModelSource } from '@openloaf/api/common'
import { readAgentJson, resolveAgentDir } from '@/ai/shared/defaultAgentResolver'
import { readAgentConfigFromPath } from '@/ai/services/agentConfigService'
import { getTemplate } from '@/ai/agent-templates'
import { resolveEffectiveAgentName } from '@/ai/services/agentFactory'
import { isSystemAgentId } from '@/ai/shared/systemAgentDefinitions'
import { resolveAgentByName } from '@/ai/tools/AgentSelector'
import { readBasicConf } from '@/modules/settings/openloafConfStore'
import { resolveGlobalAgentsPath } from '@/routers/settingsHelpers'
import {
  getProjectRootPath,
} from '@openloaf/api/services/vfsService'

export type AgentModelIds = {
  chatModelId?: string
  chatModelSource?: ChatModelSource
  codeModelIds?: string[]
  requiredModelTags?: string[]
}

/** 取列表的首个有效 ID，失败返回 undefined。 */
function firstModelId(ids: unknown): string | undefined {
  if (!Array.isArray(ids)) return undefined
  return ids[0]?.trim() || undefined
}

/** 过滤空白并返回有效的 code model ID 列表，空数组返回 undefined。 */
function normalizeCodeModelIds(ids: unknown): string[] | undefined {
  if (!Array.isArray(ids)) return undefined
  const filtered = ids.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
  return filtered.length > 0 ? filtered : undefined
}

/**
 * 从指定 agent 的配置读取模型 ID。
 *
 * 查找顺序：project root。
 * 支持系统 agent（.openloaf/agents/<id>/agent.json）和
 * 动态 agent（.agents/agents/<name>/AGENT.md）。
 */
export function resolveAgentModelIdsFromConfig(input: {
  agentName: string
  projectId?: string
  /** 额外搜索路径（如 parentProjectRootPaths）。 */
  parentRoots?: string[]
}): AgentModelIds {
  const basicConf = readBasicConf()
  const chatModelSource: ChatModelSource =
    basicConf.chatSource === 'cloud' ? 'cloud' : 'local'

  const effectiveName = resolveEffectiveAgentName(input.agentName)
  const templateTags = getTemplate(effectiveName)?.requiredModelTags as string[] | undefined

  // 逻辑：构建按优先级排列的搜索路径列表。
  const roots: string[] = []
  if (input.projectId) {
    const projectRoot = getProjectRootPath(input.projectId)
    if (projectRoot) roots.push(projectRoot)
  }

  // 逻辑：系统 Agent — 从 .openloaf/agents/<id>/agent.json 读取。
  if (isSystemAgentId(effectiveName)) {
    for (const rootPath of roots) {
      const descriptor = readAgentJson(resolveAgentDir(rootPath, effectiveName))
      if (!descriptor) continue

      const chatModelId = firstModelId(
        chatModelSource === 'cloud' ? descriptor.modelCloudIds : descriptor.modelLocalIds,
      )
      const codeModelIds = normalizeCodeModelIds(descriptor.codeModelIds)
      // requiredModelTags: descriptor 优先，回退到 template 定义。
      const requiredModelTags =
        (Array.isArray(descriptor.requiredModelTags) && descriptor.requiredModelTags.length > 0
          ? descriptor.requiredModelTags.filter((s) => s.trim())
          : undefined) ?? templateTags

      return { chatModelId, chatModelSource, codeModelIds, requiredModelTags }
    }

    // 全局 fallback：搜索 ~/.openloaf/agents/<name>/（agent.json 或 AGENT.md）。
    const globalAgentDir = path.join(resolveGlobalAgentsPath(), effectiveName)
    const globalDescriptor = readAgentJson(globalAgentDir)
    if (globalDescriptor) {
      const chatModelId = firstModelId(
        chatModelSource === 'cloud' ? globalDescriptor.modelCloudIds : globalDescriptor.modelLocalIds,
      )
      const codeModelIds = normalizeCodeModelIds(globalDescriptor.codeModelIds)
      const requiredModelTags =
        (Array.isArray(globalDescriptor.requiredModelTags) && globalDescriptor.requiredModelTags.length > 0
          ? globalDescriptor.requiredModelTags.filter((s) => s.trim())
          : undefined) ?? templateTags
      return { chatModelId, chatModelSource, codeModelIds, requiredModelTags }
    }
    // 兼容旧 AGENT.md 格式。
    const agentMdPath = path.join(globalAgentDir, 'AGENT.md')
    if (existsSync(agentMdPath)) {
      const mdConfig = readAgentConfigFromPath(agentMdPath, 'global')
      if (mdConfig) {
        const chatModelId = firstModelId(
          chatModelSource === 'cloud' ? mdConfig.modelCloudIds : mdConfig.modelLocalIds,
        )
        const codeModelIds = normalizeCodeModelIds(mdConfig.codeModelIds)
        return { chatModelId, chatModelSource, codeModelIds, requiredModelTags: templateTags }
      }
    }
  }

  // 逻辑：动态 Agent — 从 .agents/agents/<name>/AGENT.md 读取。
  const projectRoot = input.projectId
    ? getProjectRootPath(input.projectId) ?? undefined
    : undefined
  const match = resolveAgentByName(input.agentName, {
    projectRoot,
    parentRoots: input.parentRoots,
  })
  if (match?.config) {
    const chatModelId = firstModelId(
      chatModelSource === 'cloud' ? match.config.modelCloudIds : match.config.modelLocalIds,
    )
    const codeModelIds = normalizeCodeModelIds(match.config.codeModelIds)
    // requiredModelTags: config 优先，回退到 template 定义。
    const requiredModelTags =
      (match.config.requiredModelTags?.length
        ? match.config.requiredModelTags
        : undefined) ?? templateTags

    return { chatModelId, chatModelSource, codeModelIds, requiredModelTags }
  }

  // 无 config 匹配，仍尝试从 template 读取 requiredModelTags。
  return { chatModelSource, requiredModelTags: templateTags }
}
