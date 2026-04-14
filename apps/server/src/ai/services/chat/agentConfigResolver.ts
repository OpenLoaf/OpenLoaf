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
import type { ChatModelSource } from '@openloaf/api/common'
import { resolveAgentModelIdsFromConfig } from '@/ai/shared/resolveAgentModelFromConfig'
import { readAgentJson, resolveAgentDir } from '@/ai/shared/defaultAgentResolver'
import { resolveGlobalAgentsPath } from '@/routers/settingsHelpers'
import { getProjectRootPath } from '@openloaf/api/services/vfsService'

/** Resolve model IDs from master agent config + global chatSource. */
export function resolveAgentModelIds(input: {
  projectId?: string
}): {
  chatModelId?: string
  chatModelSource?: ChatModelSource
  codeModelIds?: string[]
} {
  return resolveAgentModelIdsFromConfig({
    agentName: 'master',
    projectId: input.projectId,
  })
}

/** Normalize selected skills input. */
export function normalizeSelectedSkills(input?: unknown): string[] {
  if (!Array.isArray(input)) return []
  const candidates = input.filter((value): value is string => typeof value === 'string')
  // 逻辑：只保留非空字符串，并按输入顺序去重。
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const value of candidates) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    normalized.push(trimmed)
  }
  return normalized
}

/** Resolve active skills from master agent config.
 *  Empty array = all skills enabled (backward compatible). */
export function resolveAgentSkills(input: {
  projectId?: string
}): string[] {
  const roots: string[] = []
  if (input.projectId) {
    const projectRoot = getProjectRootPath(input.projectId)
    if (projectRoot) roots.push(projectRoot)
  }

  for (const rootPath of roots) {
    const descriptor = readAgentJson(resolveAgentDir(rootPath, 'master'))
    if (!descriptor) continue
    if (Array.isArray(descriptor.skills)) return descriptor.skills
  }

  // 全局 fallback：搜索 ~/.openloaf/agents/master/。
  const globalDescriptor = readAgentJson(path.join(resolveGlobalAgentsPath(), 'master'))
  if (globalDescriptor && Array.isArray(globalDescriptor.skills)) {
    return globalDescriptor.skills
  }

  return []
}
