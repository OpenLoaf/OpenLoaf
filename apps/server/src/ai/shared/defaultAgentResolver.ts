import path from 'node:path'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import {
  BUILTIN_IDENTITY_PROMPT,
  BUILTIN_SOUL_PROMPT,
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

/** Prompt file names for the default agent. */
type DefaultAgentFileName = 'IDENTITY.md' | 'SOUL.md' | 'AGENT.md'

/** Resolved prompt parts for the default agent. */
export type DefaultAgentPromptParts = {
  /** Identity prompt content. */
  identity: string
  /** Soul prompt content. */
  soul: string
  /** Agent prompt content. */
  agent: string
}

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
 * Resolve a single default agent file by priority:
 * project/.openloaf/agents/master/ → workspace/.openloaf/agents/master/ → builtin.
 */
export function resolveDefaultAgentFile(
  fileName: DefaultAgentFileName,
  workspaceRootPath?: string,
  projectRootPath?: string,
): string {
  // 逻辑：project 级优先，缺失则回退 workspace 级，再回退内置默认值。
  if (projectRootPath) {
    const filePath = path.join(
      resolveAgentDir(projectRootPath, DEFAULT_AGENT_FOLDER),
      fileName,
    )
    const content = readTextFile(filePath)
    if (content) return content
  }

  if (workspaceRootPath) {
    const filePath = path.join(
      resolveAgentDir(workspaceRootPath, DEFAULT_AGENT_FOLDER),
      fileName,
    )
    const content = readTextFile(filePath)
    if (content) return content
  }

  return resolveBuiltinFallback(fileName)
}

/** Resolve all three prompt parts for the default agent. */
export function resolveDefaultAgentPromptParts(
  workspaceRootPath?: string,
  projectRootPath?: string,
): DefaultAgentPromptParts {
  return {
    identity: resolveDefaultAgentFile(
      'IDENTITY.md',
      workspaceRootPath,
      projectRootPath,
    ),
    soul: resolveDefaultAgentFile(
      'SOUL.md',
      workspaceRootPath,
      projectRootPath,
    ),
    agent: resolveDefaultAgentFile(
      'AGENT.md',
      workspaceRootPath,
      projectRootPath,
    ),
  }
}

/** Map file name to builtin fallback constant. */
function resolveBuiltinFallback(fileName: DefaultAgentFileName): string {
  switch (fileName) {
    case 'IDENTITY.md':
      return BUILTIN_IDENTITY_PROMPT
    case 'SOUL.md':
      return BUILTIN_SOUL_PROMPT
    case 'AGENT.md':
      return BUILTIN_AGENT_PROMPT
  }
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
    { name: 'IDENTITY.md', content: BUILTIN_IDENTITY_PROMPT },
    { name: 'SOUL.md', content: BUILTIN_SOUL_PROMPT },
    { name: 'AGENT.md', content: BUILTIN_AGENT_PROMPT },
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
