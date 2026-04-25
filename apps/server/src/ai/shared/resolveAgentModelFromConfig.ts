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
 * 搜索顺序：项目 .openloaf/agents/ → 全局 <tempStorage>/agents/（由 resolveGlobalAgentsPath() 解析）。
 * chatStreamService 和 agentTools 共用此函数，避免重复逻辑。
 */

import path from 'node:path'
import { existsSync } from 'node:fs'
import type { ChatModelSource } from '@openloaf/api/common'
import { readAgentJson, resolveAgentDir } from '@/ai/shared/defaultAgentResolver'
import { readAgentConfigFromPath } from '@/ai/services/agentConfigService'
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

type DescriptorShape = {
  modelCloudIds?: unknown
  modelLocalIds?: unknown
  codeModelIds?: unknown
}

/** 从 descriptor 构建 AgentModelIds，统一 chatModelId/codeModelIds 派生逻辑。 */
function buildModelIdsFromDescriptor(
  descriptor: DescriptorShape,
  chatModelSource: ChatModelSource,
): AgentModelIds {
  const chatModelId = firstModelId(
    chatModelSource === 'cloud' ? descriptor.modelCloudIds : descriptor.modelLocalIds,
  )
  const codeModelIds = normalizeCodeModelIds(descriptor.codeModelIds)
  return { chatModelId, chatModelSource, codeModelIds }
}

/**
 * 从指定 agent 的配置读取模型 ID。
 *
 * 注意：master agent 的模型 ID 已迁移到 basic config（chatModelId / chatSource），
 * 此函数仅用于 sub-agent 的 codeModelIds 读取。
 * master 的 chatModelId 直接从请求体获取。
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

  // 逻辑：master agent — 模型 ID 从 basic config 读取。
  if (effectiveName === 'master') {
    return {
      chatModelId: basicConf.chatModelId?.trim() || undefined,
      chatModelSource,
    }
  }

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
      return buildModelIdsFromDescriptor(descriptor, chatModelSource)
    }

    // 全局 fallback：搜索 <tempStorage>/agents/<name>/（agent.json 或 AGENT.md）。
    const globalAgentDir = path.join(resolveGlobalAgentsPath(), effectiveName)
    const globalDescriptor = readAgentJson(globalAgentDir)
    if (globalDescriptor) {
      return buildModelIdsFromDescriptor(globalDescriptor, chatModelSource)
    }
    // 兼容旧 AGENT.md 格式。
    const agentMdPath = path.join(globalAgentDir, 'AGENT.md')
    if (existsSync(agentMdPath)) {
      const mdConfig = readAgentConfigFromPath(agentMdPath, 'global')
      if (mdConfig) {
        return buildModelIdsFromDescriptor(mdConfig, chatModelSource)
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
    return buildModelIdsFromDescriptor(match.config, chatModelSource)
  }

  return { chatModelSource }
}
