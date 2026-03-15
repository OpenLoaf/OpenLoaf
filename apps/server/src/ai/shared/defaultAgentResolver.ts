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
import { existsSync, readFileSync } from 'node:fs'
import { resolveScopedOpenLoafPath } from '@openloaf/config'
import {
  BUILTIN_AGENT_PROMPT,
} from '@/ai/shared/builtinPrompts'

/** Agents directory name under .openloaf/. */
const AGENTS_DIR_NAME = 'agents'
/** Default agent folder name (master agent). */
const DEFAULT_AGENT_FOLDER = 'master'
/** Agent descriptor file name. */
const AGENT_JSON_FILE = 'agent.json'

/** Agent JSON descriptor shape. */
export type AgentJsonDescriptor = {
  name: string
  description?: string
  icon?: string
  modelLocalIds?: string[]
  modelCloudIds?: string[]
  auxiliaryModelSource?: string
  auxiliaryModelLocalIds?: string[]
  auxiliaryModelCloudIds?: string[]
  /** Image model id for media generation (empty = Auto). */
  imageModelIds?: string[]
  /** Video model id for media generation (empty = Auto). */
  videoModelIds?: string[]
  /** Code model ids for CLI coding tools (empty = Auto). */
  codeModelIds?: string[]
  /** 模型标签约束（用户可覆盖模板默认值）。 */
  requiredModelTags?: string[]
  toolIds?: string[]
  skills?: string[]
  allowSubAgents?: boolean
  maxDepth?: number
}

/** Resolve the agents root directory for a scope root. */
export function resolveAgentsRootDir(rootPath: string): string {
  return resolveScopedOpenLoafPath(rootPath, AGENTS_DIR_NAME)
}

/** Resolve a specific agent directory for a scope root. */
export function resolveAgentDir(
  rootPath: string,
  folderName: string,
): string {
  return resolveScopedOpenLoafPath(rootPath, AGENTS_DIR_NAME, folderName)
}

/** Read a text file if it exists, return empty string otherwise. */
function readTextFile(filePath: string): string {
  if (!existsSync(filePath)) return ''
  try {
    return readFileSync(filePath, 'utf8').trim()
  } catch {
    return ''
  }
}

/** Read and parse agent.json from a directory. */
export function readAgentJson(
  agentDir: string,
): AgentJsonDescriptor | null {
  const jsonPath = path.join(agentDir, AGENT_JSON_FILE)
  if (!existsSync(jsonPath)) return null
  try {
    const raw = readFileSync(jsonPath, 'utf8')
    return JSON.parse(raw) as AgentJsonDescriptor
  } catch {
    return null
  }
}
