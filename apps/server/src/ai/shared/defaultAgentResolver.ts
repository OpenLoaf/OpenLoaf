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
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import {
  BUILTIN_AGENT_PROMPT,
} from '@/ai/shared/builtinPrompts'
import {
  getScaffoldableTemplates,
  getPrimaryTemplate,
  type AgentTemplate,
} from '@/ai/agent-templates'

/** OpenLoaf meta directory name. */
const OPENLOAF_META_DIR = '.openloaf'
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

/** Resolve the agents root directory: <root>/.openloaf/agents/ */
export function resolveAgentsRootDir(rootPath: string): string {
  return path.join(rootPath, OPENLOAF_META_DIR, AGENTS_DIR_NAME)
}

/** Resolve a specific agent directory: <root>/.openloaf/agents/<folderName>/ */
export function resolveAgentDir(
  rootPath: string,
  folderName: string,
): string {
  return path.join(rootPath, OPENLOAF_META_DIR, AGENTS_DIR_NAME, folderName)
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

/**
 * Resolve user's custom prompt.md by priority:
 * project/.openloaf/agents/master/ → workspace/.openloaf/agents/master/ → null.
 * Returns null if no user override exists or if the content matches the builtin default.
 */
export function resolveUserAgentOverride(
  workspaceRootPath?: string,
  projectRootPath?: string,
): string | null {
  const candidates = [projectRootPath, workspaceRootPath].filter(Boolean) as string[]
  for (const root of candidates) {
    const filePath = path.join(
      resolveAgentDir(root, DEFAULT_AGENT_FOLDER),
      'prompt.md',
    )
    const content = readTextFile(filePath)
    if (content && content !== BUILTIN_AGENT_PROMPT) {
      return content
    }
  }
  return null
}

/** Default agent.json content (derived from primary template). */
function buildDefaultAgentJson(): AgentJsonDescriptor {
  const primary = getPrimaryTemplate()
  return {
    name: primary.name,
    description: primary.description,
    icon: primary.icon,
  }
}

/** Default agent files to scaffold. */
function buildDefaultAgentFiles(): Array<{ name: string; content: string }> {
  return [
    {
      name: AGENT_JSON_FILE,
      content: JSON.stringify(buildDefaultAgentJson(), null, 2),
    },
    { name: 'prompt.md', content: BUILTIN_AGENT_PROMPT },
  ]
}

/**
 * Ensure .openloaf/agents/master/ directory exists in the given root path
 * with agent.json + default prompt files. Only creates missing files.
 */
export function ensureDefaultAgentFiles(rootPath: string): void {
  if (!rootPath) return
  const defaultDir = resolveAgentDir(rootPath, DEFAULT_AGENT_FOLDER)
  // 逻辑：目录已存在则跳过，避免覆盖用户自定义文件。
  if (existsSync(defaultDir)) return
  try {
    mkdirSync(defaultDir, { recursive: true })
    for (const file of buildDefaultAgentFiles()) {
      const filePath = path.join(defaultDir, file.name)
      if (!existsSync(filePath)) {
        writeFileSync(filePath, file.content, 'utf8')
      }
    }
  } catch {
    // 逻辑：写入失败时静默忽略，不影响程序启动。
  }
}

/** Build agent.json content for a scaffoldable template. */
function buildTemplateAgentJson(template: AgentTemplate): string {
  return JSON.stringify(
    {
      name: template.name,
      description: template.description,
      icon: template.icon,
      toolIds: [...template.toolIds],
      allowSubAgents: template.allowSubAgents,
      maxDepth: template.maxDepth,
    },
    null,
    2,
  )
}

/**
 * Ensure all scaffoldable agent folders exist under .openloaf/agents/.
 * Only creates missing folders — never overwrites existing ones.
 */
export function ensureSystemAgentFiles(rootPath: string): void {
  if (!rootPath) return
  for (const template of getScaffoldableTemplates()) {
    const agentDir = resolveAgentDir(rootPath, template.id)
    if (existsSync(agentDir)) continue
    try {
      mkdirSync(agentDir, { recursive: true })
      const jsonPath = path.join(agentDir, AGENT_JSON_FILE)
      writeFileSync(jsonPath, buildTemplateAgentJson(template), 'utf8')
    } catch {
      // 逻辑：写入失败时静默忽略，不影响程序启动。
    }
  }
}
