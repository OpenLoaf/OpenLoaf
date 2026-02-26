/**
 * 通用 Agent 模型解析 — 从指定 agent 的配置读取模型 ID。
 *
 * 支持系统 agent（.openloaf/agents/）和动态 agent（.agents/agents/）。
 * chatStreamService 和 agentTools 共用此函数，避免重复逻辑。
 */

import type { ChatModelSource } from '@openloaf/api/common'
import { readAgentJson, resolveAgentDir } from '@/ai/shared/defaultAgentResolver'
import { resolveEffectiveAgentName } from '@/ai/services/agentFactory'
import { isSystemAgentId } from '@/ai/shared/systemAgentDefinitions'
import { resolveAgentByName } from '@/ai/tools/AgentSelector'
import { readBasicConf } from '@/modules/settings/openloafConfStore'
import {
  getProjectRootPath,
  getWorkspaceRootPath,
  getWorkspaceRootPathById,
} from '@openloaf/api/services/vfsService'

export type AgentModelIds = {
  chatModelId?: string
  chatModelSource?: ChatModelSource
  imageModelId?: string
  videoModelId?: string
}

/**
 * 从指定 agent 的配置读取模型 ID。
 *
 * 查找顺序：project root → workspace root → fallback workspace。
 * 支持系统 agent（.openloaf/agents/<id>/agent.json）和
 * 动态 agent（.agents/agents/<name>/AGENT.md）。
 */
export function resolveAgentModelIdsFromConfig(input: {
  agentName: string
  workspaceId?: string
  projectId?: string
  /** 额外搜索路径（如 parentProjectRootPaths）。 */
  parentRoots?: string[]
}): AgentModelIds {
  const basicConf = readBasicConf()
  const chatModelSource: ChatModelSource =
    basicConf.chatSource === 'cloud' ? 'cloud' : 'local'

  const effectiveName = resolveEffectiveAgentName(input.agentName)

  // 逻辑：构建按优先级排列的搜索路径列表。
  const roots: string[] = []
  if (input.projectId) {
    const projectRoot = getProjectRootPath(input.projectId)
    if (projectRoot) roots.push(projectRoot)
  }
  if (input.workspaceId) {
    const wsRoot = getWorkspaceRootPathById(input.workspaceId)
    if (wsRoot) roots.push(wsRoot)
  }
  const fallbackWs = getWorkspaceRootPath()
  if (fallbackWs && !roots.includes(fallbackWs)) roots.push(fallbackWs)

  // 逻辑：系统 Agent — 从 .openloaf/agents/<id>/agent.json 读取。
  if (isSystemAgentId(effectiveName)) {
    for (const rootPath of roots) {
      const descriptor = readAgentJson(resolveAgentDir(rootPath, effectiveName))
      if (!descriptor) continue

      const modelIds =
        chatModelSource === 'cloud'
          ? descriptor.modelCloudIds
          : descriptor.modelLocalIds
      const chatModelId = Array.isArray(modelIds)
        ? modelIds[0]?.trim() || undefined
        : undefined
      const imageModelId = Array.isArray(descriptor.imageModelIds)
        ? descriptor.imageModelIds[0]?.trim() || undefined
        : undefined
      const videoModelId = Array.isArray(descriptor.videoModelIds)
        ? descriptor.videoModelIds[0]?.trim() || undefined
        : undefined

      return { chatModelId, chatModelSource, imageModelId, videoModelId }
    }
  }

  // 逻辑：动态 Agent — 从 .agents/agents/<name>/AGENT.md 读取。
  const projectRoot = input.projectId
    ? getProjectRootPath(input.projectId) ?? undefined
    : undefined
  const workspaceRoot = input.workspaceId
    ? getWorkspaceRootPathById(input.workspaceId) ?? undefined
    : fallbackWs ?? undefined
  const match = resolveAgentByName(input.agentName, {
    projectRoot,
    parentRoots: input.parentRoots,
    workspaceRoot,
  })
  if (match?.config) {
    const modelIds =
      chatModelSource === 'cloud'
        ? match.config.modelCloudIds
        : match.config.modelLocalIds
    const chatModelId = Array.isArray(modelIds)
      ? modelIds[0]?.trim() || undefined
      : undefined
    const imageModelId = Array.isArray(match.config.imageModelIds)
      ? match.config.imageModelIds[0]?.trim() || undefined
      : undefined
    const videoModelId = Array.isArray(match.config.videoModelIds)
      ? match.config.videoModelIds[0]?.trim() || undefined
      : undefined

    return { chatModelId, chatModelSource, imageModelId, videoModelId }
  }

  return { chatModelSource }
}
