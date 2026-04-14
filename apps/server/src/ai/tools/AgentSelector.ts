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
import { existsSync, readdirSync } from 'node:fs'
import {
  readAgentConfigFromPath,
  type AgentConfig,
} from '@/ai/services/agentConfigService'
import { resolveGlobalAgentsPath } from '@/routers/settingsHelpers'

const OPENLOAF_META_DIR = '.openloaf'
const AGENTS_DIR_NAME = 'agents'
const AGENT_FILE_NAME = 'AGENT.md'

type AgentRoots = {
  projectRoot?: string
  parentRoots?: string[]
  globalRoot?: string
}

type AgentMatch = {
  name: string
  path: string
  scope: 'project' | 'parent' | 'global'
  config: AgentConfig
}

type AgentSearchRoot = {
  scope: 'project' | 'parent' | 'global'
  rootPath: string
}

/** Resolve an agent by name from ordered roots. */
export function resolveAgentByName(
  name: string,
  roots: AgentRoots,
): AgentMatch | null {
  const normalizedName = name.trim().toLowerCase()
  if (!normalizedName) return null
  const searchRoots = buildSearchRoots(roots)

  for (const searchRoot of searchRoots) {
    const agentsRootPath =
      searchRoot.scope === 'global'
        ? searchRoot.rootPath
        : path.join(searchRoot.rootPath, OPENLOAF_META_DIR, AGENTS_DIR_NAME)
    const agentFiles = findAgentFiles(agentsRootPath)
    for (const filePath of agentFiles) {
      const scope =
        searchRoot.scope === 'global'
          ? searchRoot.scope
          : 'project'
      const config = readAgentConfigFromPath(filePath, scope)
      if (!config) continue
      if (config.name.trim().toLowerCase() !== normalizedName) continue
      return {
        name: config.name,
        path: filePath,
        scope: searchRoot.scope,
        config,
      }
    }
  }

  return null
}

function buildSearchRoots(roots: AgentRoots): AgentSearchRoot[] {
  const ordered: AgentSearchRoot[] = []
  if (roots.projectRoot?.trim()) {
    ordered.push({ scope: 'project', rootPath: roots.projectRoot.trim() })
  }
  if (Array.isArray(roots.parentRoots)) {
    for (const r of roots.parentRoots) {
      if (r?.trim()) ordered.push({ scope: 'parent', rootPath: r.trim() })
    }
  }
  ordered.push({
    scope: 'global',
    rootPath: resolveGlobalAgentsPath(),
  })
  return ordered
}

function findAgentFiles(rootPath: string): string[] {
  if (!existsSync(rootPath)) return []
  const entries = readdirSync(rootPath, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...findAgentFiles(entryPath))
      continue
    }
    if (entry.isFile() && entry.name === AGENT_FILE_NAME) {
      files.push(entryPath)
    }
  }
  return files
}
