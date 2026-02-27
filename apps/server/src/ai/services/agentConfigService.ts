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
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs'
import {
  resolveAgentsRootDir,
  readAgentJson,
} from '@/ai/shared/defaultAgentResolver'
import { isSystemAgentId } from '@/ai/shared/systemAgentDefinitions'

export type AgentScope = 'workspace' | 'project' | 'global'

export type AgentConfig = {
  /** Agent name from front matter or fallback. */
  name: string
  /** Agent description from front matter. */
  description: string
  /** Icon name. */
  icon: string
  /** Local chat model ids. */
  modelLocalIds: string[]
  /** Cloud chat model ids. */
  modelCloudIds: string[]
  /** Auxiliary model source (local/cloud). */
  auxiliaryModelSource: string
  /** Auxiliary local model ids. */
  auxiliaryModelLocalIds: string[]
  /** Auxiliary cloud model ids. */
  auxiliaryModelCloudIds: string[]
  /** Image model ids for media generation. */
  imageModelIds: string[]
  /** Video model ids for media generation. */
  videoModelIds: string[]
  /** Tool ids enabled for this agent. */
  toolIds: string[]
  /** Associated skill names. */
  skills: string[]
  /** Whether sub-agents are allowed. */
  allowSubAgents: boolean
  /** Max sub-agent depth. */
  maxDepth: number
  /** System prompt (markdown body). */
  systemPrompt: string
  /** Absolute path to AGENT.md. */
  path: string
  /** Agent folder name. */
  folderName: string
  /** Agent scope. */
  scope: AgentScope
  /** Whether this is a system agent (runtime-computed, not persisted). */
  isSystem: boolean
}

export type AgentSummary = {
  /** Agent name. */
  name: string
  /** Agent description. */
  description: string
  /** Icon name. */
  icon: string
  /** Model override. */
  model: string
  /** Image model id for media generation (empty = Auto). */
  imageModelId: string
  /** Video model id for media generation (empty = Auto). */
  videoModelId: string
  /** Tool ids enabled for this agent. */
  toolIds: string[]
  /** Associated skill names. */
  skills: string[]
  /** Absolute path to AGENT.md. */
  path: string
  /** Agent folder name. */
  folderName: string
  /** Ignore key for toggling. */
  ignoreKey: string
  /** Agent scope. */
  scope: AgentScope
  /** Whether the agent is enabled. */
  isEnabled: boolean
  /** Whether the agent can be deleted. */
  isDeletable: boolean
  /** Whether this is a system agent (runtime-computed). */
  isSystem: boolean
}

type AgentSource = {
  scope: AgentScope
  rootPath: string
}

type AgentFrontMatter = {
  name?: string
  description?: string
  icon?: string
  auxiliaryModelSource?: string
  modelLocalIds?: string[]
  modelCloudIds?: string[]
  auxiliaryModelLocalIds?: string[]
  auxiliaryModelCloudIds?: string[]
  imageModelIds?: string[]
  videoModelIds?: string[]
  toolIds?: string[]
  skills?: string[]
  allowSubAgents?: boolean
  maxDepth?: number
}

const AGENTS_META_DIR = '.agents'
const AGENTS_DIR_NAME = 'agents'
const AGENT_FILE_NAME = 'AGENT.md'
const AGENT_JSON_FILE = 'agent.json'
const FRONT_MATTER_DELIMITER = '---'

/** Scan .openloaf/agents/ subfolders and build summaries from agent.json descriptors. */
function loadOpenLoafAgentSummaries(
  rootPath: string,
  scope: AgentScope,
): Omit<AgentSummary, 'ignoreKey' | 'isEnabled' | 'isDeletable'>[] {
  const agentsRoot = resolveAgentsRootDir(rootPath)
  if (!existsSync(agentsRoot)) return []
  const entries = readdirSync(agentsRoot, { withFileTypes: true })
  const results: Omit<AgentSummary, 'ignoreKey' | 'isEnabled' | 'isDeletable'>[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const agentDir = path.join(agentsRoot, entry.name)
    const descriptor = readAgentJson(agentDir)
    if (!descriptor) continue
    const modelLocalIds = normalizeIdList(descriptor.modelLocalIds)
    const modelCloudIds = normalizeIdList(descriptor.modelCloudIds)
    const imageModelIds = normalizeIdList(descriptor.imageModelIds)
    const videoModelIds = normalizeIdList(descriptor.videoModelIds)
    results.push({
      name: descriptor.name || entry.name,
      description: descriptor.description || '未提供',
      icon: descriptor.icon || 'bot',
      model: modelLocalIds[0] ?? modelCloudIds[0] ?? '',
      imageModelId: imageModelIds[0] ?? '',
      videoModelId: videoModelIds[0] ?? '',
      toolIds: normalizeToolIds(descriptor.toolIds || []),
      skills: descriptor.skills || [],
      path: path.join(agentDir, AGENT_JSON_FILE),
      folderName: entry.name,
      scope,
      isSystem: isSystemAgentId(entry.name),
    })
  }
  return results
}

/** Load agent configs from workspace/project/global roots. */
export function loadAgentSummaries(input: {
  workspaceRootPath?: string
  projectRootPath?: string
  parentProjectRootPaths?: string[]
  globalAgentsPath?: string
}): Omit<AgentSummary, 'ignoreKey' | 'isEnabled' | 'isDeletable'>[] {
  const sources = resolveAgentSources(input)
  const summaryByName = new Map<
    string,
    Omit<AgentSummary, 'ignoreKey' | 'isEnabled' | 'isDeletable'>
  >()
  const orderedNames: string[] = []

  // 逻辑：先扫描 .openloaf/agents/ 子目录，将 agent.json 描述的 agent 作为首批条目。
  for (const source of sources) {
    if (source.scope === 'global') continue
    const openloafAgents = loadOpenLoafAgentSummaries(source.rootPath, source.scope)
    for (const agent of openloafAgents) {
      if (!summaryByName.has(agent.name)) {
        orderedNames.push(agent.name)
      }
      if (source.scope === 'project' || !summaryByName.has(agent.name)) {
        summaryByName.set(agent.name, agent)
      }
    }
  }

  for (const source of sources) {
    const agentsRootPath =
      source.scope === 'global'
        ? source.rootPath
        : path.join(source.rootPath, AGENTS_META_DIR, AGENTS_DIR_NAME)
    const agentFiles = findAgentFiles(agentsRootPath)

    for (const filePath of agentFiles) {
      const config = readAgentConfigFromPath(filePath, source.scope)
      if (!config) continue
      if (!summaryByName.has(config.name)) {
        orderedNames.push(config.name)
      }
      // 逻辑：项目级覆盖工作空间级，工作空间级覆盖全局级。
      if (source.scope === 'project' || !summaryByName.has(config.name)) {
        summaryByName.set(config.name, {
          name: config.name,
          description: config.description,
          icon: config.icon,
          model: config.modelLocalIds[0] ?? config.modelCloudIds[0] ?? '',
          imageModelId: config.imageModelIds[0] ?? '',
          videoModelId: config.videoModelIds[0] ?? '',
          toolIds: config.toolIds,
          skills: config.skills,
          path: config.path,
          folderName: config.folderName,
          scope: config.scope,
          isSystem: isSystemAgentId(config.folderName),
        })
      }
    }
  }

  return orderedNames
    .map((name) => summaryByName.get(name))
    .filter(Boolean) as Omit<AgentSummary, 'ignoreKey' | 'isEnabled' | 'isDeletable'>[]
}

/** Read full agent config from AGENT.md. */
export function readAgentConfigFromPath(
  filePath: string,
  scope: AgentScope,
): AgentConfig | null {
  if (!existsSync(filePath)) return null
  try {
    const content = readFileSync(filePath, 'utf8')
    const frontMatter = parseAgentFrontMatter(content)
    const fallbackName =
      path.basename(path.dirname(filePath)) || path.basename(filePath)
    const name = (frontMatter.name || fallbackName).trim()
    if (!name) return null
    const modelLocalIds = normalizeIdList(frontMatter.modelLocalIds)
    const modelCloudIds = normalizeIdList(frontMatter.modelCloudIds)
    const auxiliaryModelLocalIds = normalizeIdList(
      frontMatter.auxiliaryModelLocalIds,
    )
    const auxiliaryModelCloudIds = normalizeIdList(
      frontMatter.auxiliaryModelCloudIds,
    )
    const imageModelIds = normalizeIdList(frontMatter.imageModelIds)
    const videoModelIds = normalizeIdList(frontMatter.videoModelIds)
    const toolIds = normalizeToolIds(frontMatter.toolIds || [])
    return {
      name,
      description: normalizeDescription(frontMatter.description),
      icon: frontMatter.icon || 'bot',
      auxiliaryModelSource: normalizeModelSource(
        frontMatter.auxiliaryModelSource,
      ),
      modelLocalIds,
      modelCloudIds,
      auxiliaryModelLocalIds,
      auxiliaryModelCloudIds,
      imageModelIds,
      videoModelIds,
      toolIds,
      skills: frontMatter.skills || [],
      allowSubAgents: frontMatter.allowSubAgents ?? false,
      maxDepth: frontMatter.maxDepth ?? 1,
      systemPrompt: stripFrontMatter(content),
      path: filePath,
      folderName: path.basename(path.dirname(filePath)) || fallbackName,
      scope,
      isSystem: isSystemAgentId(
        path.basename(path.dirname(filePath)) || fallbackName,
      ),
    }
  } catch {
    return null
  }
}

/** Read agent system prompt (body without front matter). */
export function readAgentContentFromPath(filePath: string): string {
  if (!existsSync(filePath)) return ''
  try {
    const content = readFileSync(filePath, 'utf8')
    return stripFrontMatter(content)
  } catch {
    return ''
  }
}

function resolveAgentSources(input: {
  workspaceRootPath?: string
  projectRootPath?: string
  parentProjectRootPaths?: string[]
  globalAgentsPath?: string
}): AgentSource[] {
  const sources: AgentSource[] = []
  const globalPath = normalizeRootPath(input.globalAgentsPath)
  const workspaceRoot = normalizeRootPath(input.workspaceRootPath)
  const projectRoot = normalizeRootPath(input.projectRootPath)
  const parentRoots = normalizeRootPathList(input.parentProjectRootPaths)

  if (globalPath) sources.push({ scope: 'global', rootPath: globalPath })
  if (workspaceRoot) sources.push({ scope: 'workspace', rootPath: workspaceRoot })
  for (const parentRoot of parentRoots) {
    sources.push({ scope: 'project', rootPath: parentRoot })
  }
  if (projectRoot) sources.push({ scope: 'project', rootPath: projectRoot })
  return sources
}

function normalizeRootPath(value?: string): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeRootPathList(values?: string[]): string[] {
  if (!Array.isArray(values)) return []
  const normalized = values
    .map((v) => normalizeRootPath(v))
    .filter((v): v is string => Boolean(v))
  const unique = new Set<string>()
  return normalized
    .filter((v) => {
      if (unique.has(v)) return false
      unique.add(v)
      return true
    })
    .reverse()
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

function stripFrontMatter(content: string): string {
  const lines = content.split(/\r?\n/u)
  if (lines.length === 0) return ''
  const firstLine = lines[0] ?? ''
  if (firstLine.trim() !== FRONT_MATTER_DELIMITER) return content.trim()
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (line.trim() === FRONT_MATTER_DELIMITER) {
      return lines.slice(i + 1).join('\n').trim()
    }
  }
  return ''
}

/** Parse YAML front matter for agent fields. */
function parseAgentFrontMatter(content: string): AgentFrontMatter {
  const lines = content.split(/\r?\n/u)
  if (lines.length === 0) return {}
  if ((lines[0] ?? '').trim() !== FRONT_MATTER_DELIMITER) return {}

  const result: AgentFrontMatter = {}
  let currentKey: string | null = null
  let blockMode: 'literal' | 'folded' | null = null
  let buffer: string[] = []
  let listBuffer: string[] | null = null

  const flushBlock = () => {
    if (!currentKey) return
    if (listBuffer) {
      setField(result, currentKey, listBuffer)
      listBuffer = null
    } else if (blockMode) {
      const rawValue =
        blockMode === 'folded' ? buffer.join(' ') : buffer.join('\n')
      setField(result, currentKey, rawValue.trim())
    }
    currentKey = null
    blockMode = null
    buffer = []
  }

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (line.trim() === FRONT_MATTER_DELIMITER) {
      flushBlock()
      break
    }

    // YAML list item
    const listMatch = /^\s+-\s+(.*)$/u.exec(line)
    if (listMatch && currentKey) {
      if (!listBuffer) listBuffer = []
      listBuffer.push(normalizeScalar(listMatch[1] ?? ''))
      continue
    }

    // Continuation of block scalar
    if (
      currentKey &&
      blockMode &&
      (line.startsWith(' ') || line.startsWith('\t') || line.trim() === '')
    ) {
      buffer.push(line.replace(/^\s*/u, ''))
      continue
    }

    if (currentKey) flushBlock()

    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line)
    if (!match) continue
    const key = match[1] ?? ''
    const rawValue = (match[2] ?? '').trim()

    if (rawValue === '|' || rawValue === '>') {
      currentKey = key
      blockMode = rawValue === '>' ? 'folded' : 'literal'
      buffer = []
      continue
    }

    if (!rawValue) {
      // Possibly a list follows
      currentKey = key
      listBuffer = []
      continue
    }

    setField(result, key, normalizeScalar(rawValue))
  }

  return result
}

function setField(
  result: AgentFrontMatter,
  key: string,
  value: string | string[],
): void {
  switch (key) {
    case 'name':
      result.name = typeof value === 'string' ? value : value[0] ?? ''
      break
    case 'description':
      result.description = typeof value === 'string' ? value : value.join(' ')
      break
    case 'icon':
      result.icon = typeof value === 'string' ? value : value[0] ?? ''
      break
    case 'auxiliaryModelSource':
      result.auxiliaryModelSource =
        typeof value === 'string' ? value : value[0] ?? ''
      break
    case 'modelLocalIds':
      result.modelLocalIds = normalizeIdList(value)
      break
    case 'modelCloudIds':
      result.modelCloudIds = normalizeIdList(value)
      break
    case 'auxiliaryModelLocalIds':
      result.auxiliaryModelLocalIds = normalizeIdList(value)
      break
    case 'auxiliaryModelCloudIds':
      result.auxiliaryModelCloudIds = normalizeIdList(value)
      break
    case 'imageModelIds':
      result.imageModelIds = normalizeIdList(value)
      break
    case 'videoModelIds':
      result.videoModelIds = normalizeIdList(value)
      break
    case 'toolIds':
      result.toolIds = Array.isArray(value) ? value : [value]
      break
    case 'skills':
      result.skills = Array.isArray(value) ? value : [value]
      break
    case 'allowSubAgents':
      result.allowSubAgents =
        typeof value === 'string' ? value === 'true' : false
      break
    case 'maxDepth':
      result.maxDepth =
        typeof value === 'string' ? Number.parseInt(value, 10) || 1 : 1
      break
  }
}

function normalizeScalar(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function normalizeDescription(value?: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return '未提供'
  return trimmed.replace(/\s+/gu, ' ')
}

function normalizeIdList(value?: string | string[] | null): string[] {
  if (!value) return []
  const list = Array.isArray(value) ? value : [value]
  return list
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function normalizeModelSource(value?: string): 'local' | 'cloud' {
  // 逻辑：仅允许 local/cloud，其他值回退到 local。
  return value === 'cloud' ? 'cloud' : 'local'
}

/** Normalize tool ids. */
function normalizeToolIds(value?: string[]): string[] {
  if (!Array.isArray(value)) return []
  const next = new Set<string>()
  for (const toolId of value) {
    if (toolId) next.add(toolId)
  }
  return Array.from(next)
}

/** Serialize agent config to AGENT.md content. */
export function serializeAgentToMarkdown(config: {
  name: string
  description?: string
  icon?: string
  modelLocalIds?: string[]
  modelCloudIds?: string[]
  auxiliaryModelSource?: string
  auxiliaryModelLocalIds?: string[]
  auxiliaryModelCloudIds?: string[]
  imageModelIds?: string[]
  videoModelIds?: string[]
  toolIds?: string[]
  skills?: string[]
  allowSubAgents?: boolean
  maxDepth?: number
  systemPrompt?: string
}): string {
  const lines: string[] = ['---']
  lines.push(`name: ${config.name}`)
  if (config.description) lines.push(`description: ${config.description}`)
  if (config.icon) lines.push(`icon: ${config.icon}`)
  if (config.modelLocalIds?.length) {
    lines.push('modelLocalIds:')
    for (const id of config.modelLocalIds) {
      lines.push(`  - ${id}`)
    }
  }
  if (config.modelCloudIds?.length) {
    lines.push('modelCloudIds:')
    for (const id of config.modelCloudIds) {
      lines.push(`  - ${id}`)
    }
  }
  if (config.auxiliaryModelSource) {
    lines.push(`auxiliaryModelSource: ${config.auxiliaryModelSource}`)
  }
  if (config.auxiliaryModelLocalIds?.length) {
    lines.push('auxiliaryModelLocalIds:')
    for (const id of config.auxiliaryModelLocalIds) {
      lines.push(`  - ${id}`)
    }
  }
  if (config.auxiliaryModelCloudIds?.length) {
    lines.push('auxiliaryModelCloudIds:')
    for (const id of config.auxiliaryModelCloudIds) {
      lines.push(`  - ${id}`)
    }
  }
  if (config.imageModelIds?.length) {
    lines.push('imageModelIds:')
    for (const id of config.imageModelIds) {
      lines.push(`  - ${id}`)
    }
  }
  if (config.videoModelIds?.length) {
    lines.push('videoModelIds:')
    for (const id of config.videoModelIds) {
      lines.push(`  - ${id}`)
    }
  }
  if (config.toolIds?.length) {
    lines.push('toolIds:')
    for (const toolId of config.toolIds) {
      lines.push(`  - ${toolId}`)
    }
  }
  if (config.skills?.length) {
    lines.push('skills:')
    for (const skill of config.skills) {
      lines.push(`  - ${skill}`)
    }
  }
  if (config.allowSubAgents !== undefined) {
    lines.push(`allowSubAgents: ${config.allowSubAgents}`)
  }
  if (config.maxDepth !== undefined) {
    lines.push(`maxDepth: ${config.maxDepth}`)
  }
  lines.push('---')
  lines.push('')
  if (config.systemPrompt?.trim()) {
    lines.push(config.systemPrompt.trim())
    lines.push('')
  }
  return lines.join('\n')
}

/** Write agent config to AGENT.md file. Creates directory if needed. */
export function writeAgentFile(
  rootPath: string,
  agentName: string,
  content: string,
): string {
  const sanitizedName = agentName.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
  const agentDir = path.join(rootPath, AGENTS_META_DIR, AGENTS_DIR_NAME, sanitizedName)
  mkdirSync(agentDir, { recursive: true })
  const filePath = path.join(agentDir, AGENT_FILE_NAME)
  writeFileSync(filePath, content, 'utf8')
  return filePath
}
