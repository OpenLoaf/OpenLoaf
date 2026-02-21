import path from 'node:path'
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import {
  BUILTIN_IDENTITY_PROMPT,
  BUILTIN_SOUL_PROMPT,
  BUILTIN_AGENT_PROMPT,
} from '@/ai/shared/builtinPrompts'
import {
  SYSTEM_AGENT_DEFINITIONS,
  type SystemAgentDefinition,
} from '@/ai/shared/systemAgentDefinitions'

/** Tenas meta directory name. */
const TENAS_META_DIR = '.tenas'
/** Agents directory name under .tenas/. */
const AGENTS_DIR_NAME = 'agents'
/** Default agent folder name (migrated from 'default' to 'main'). */
const DEFAULT_AGENT_FOLDER = 'main'
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
  model?: string
  capabilities?: string[]
  skills?: string[]
  allowSubAgents?: boolean
  maxDepth?: number
}

/** Resolve the agents root directory: <root>/.tenas/agents/ */
export function resolveAgentsRootDir(rootPath: string): string {
  return path.join(rootPath, TENAS_META_DIR, AGENTS_DIR_NAME)
}

/** Resolve a specific agent directory: <root>/.tenas/agents/<folderName>/ */
export function resolveAgentDir(
  rootPath: string,
  folderName: string,
): string {
  return path.join(rootPath, TENAS_META_DIR, AGENTS_DIR_NAME, folderName)
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
 * project/.tenas/agents/default/ → workspace/.tenas/agents/default/ → builtin.
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

/** Default agent.json content. */
const DEFAULT_AGENT_JSON: AgentJsonDescriptor = {
  name: '主助手',
  description: '混合模式主助手，可直接执行简单任务，也可调度子 Agent',
  icon: 'sparkles',
}

/** Default agent files to scaffold. */
const DEFAULT_AGENT_FILES: Array<{
  name: string
  content: string
}> = [
  {
    name: AGENT_JSON_FILE,
    content: JSON.stringify(DEFAULT_AGENT_JSON, null, 2),
  },
  { name: 'IDENTITY.md', content: BUILTIN_IDENTITY_PROMPT },
  { name: 'SOUL.md', content: BUILTIN_SOUL_PROMPT },
  { name: 'AGENT.md', content: BUILTIN_AGENT_PROMPT },
]

/**
 * Ensure .tenas/agents/default/ directory exists in the given root path
 * with agent.json + default prompt files. Only creates missing files.
 */
export function ensureDefaultAgentFiles(rootPath: string): void {
  if (!rootPath) return
  const defaultDir = resolveAgentDir(rootPath, DEFAULT_AGENT_FOLDER)
  // 逻辑：目录已存在则跳过，避免覆盖用户自定义文件。
  if (existsSync(defaultDir)) return
  try {
    mkdirSync(defaultDir, { recursive: true })
    for (const file of DEFAULT_AGENT_FILES) {
      const filePath = path.join(defaultDir, file.name)
      if (!existsSync(filePath)) {
        writeFileSync(filePath, file.content, 'utf8')
      }
    }
  } catch {
    // 逻辑：写入失败时静默忽略，不影响程序启动。
  }
}

/**
 * Migrate legacy 'default' agent folder to 'main'.
 * If 'default/' exists and 'main/' does not, rename it.
 */
export function migrateDefaultToMain(rootPath: string): void {
  if (!rootPath) return
  const oldDir = resolveAgentDir(rootPath, 'default')
  const newDir = resolveAgentDir(rootPath, 'main')
  if (existsSync(oldDir) && !existsSync(newDir)) {
    try {
      renameSync(oldDir, newDir)
    } catch {
      // 逻辑：迁移失败时静默忽略。
    }
  }
}

/** Build agent.json content for a system agent definition. */
function buildSystemAgentJson(def: SystemAgentDefinition): string {
  return JSON.stringify(
    {
      name: def.name,
      description: def.description,
      icon: def.icon,
      capabilities: [...def.capabilities],
      allowSubAgents: def.allowSubAgents,
      maxDepth: def.maxDepth,
    },
    null,
    2,
  )
}

/**
 * Ensure all system agent folders exist under .tenas/agents/.
 * Only creates missing folders — never overwrites existing ones.
 */
export function ensureSystemAgentFiles(rootPath: string): void {
  if (!rootPath) return
  for (const def of SYSTEM_AGENT_DEFINITIONS) {
    const agentDir = resolveAgentDir(rootPath, def.id)
    if (existsSync(agentDir)) continue
    try {
      mkdirSync(agentDir, { recursive: true })
      const jsonPath = path.join(agentDir, AGENT_JSON_FILE)
      writeFileSync(jsonPath, buildSystemAgentJson(def), 'utf8')
    } catch {
      // 逻辑：写入失败时静默忽略，不影响程序启动。
    }
  }
}
