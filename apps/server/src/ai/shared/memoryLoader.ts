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
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolveScopedOpenLoafPath } from '@openloaf/config'
import { getResolvedTempStorageDir } from '@openloaf/api/services/appConfigService'

/** Memory directory name under temp-storage / .openloaf/. */
const MEMORY_DIR_NAME = 'memory'
/** Memory file name. */
const MEMORY_FILE_NAME = 'MEMORY.md'
/** Default max lines per single memory file. */
const DEFAULT_MAX_LINES = 200

/**
 * Resolve the memory directory for a project root.
 *
 * Project/parent-project memory lives inside `<rootPath>/.openloaf/memory/`.
 * For user-global and agent memory use `resolveUserMemoryDir()` and
 * `resolveAgentMemoryDir()` — those live under the user temp-storage dir
 * (e.g. ~/OpenLoafData) instead of the hidden `~/.openloaf/` config dir.
 */
export function resolveMemoryDir(rootPath: string): string {
  return resolveScopedOpenLoafPath(rootPath, MEMORY_DIR_NAME)
}

/** Resolve the user-global memory directory under temp-storage. */
export function resolveUserMemoryDir(): string {
  return path.join(getResolvedTempStorageDir(), MEMORY_DIR_NAME)
}

/** Resolve a specialist agent's memory directory under the user memory tree. */
export function resolveAgentMemoryDir(agentName: string): string {
  return path.join(resolveUserMemoryDir(), 'agents', agentName)
}

/** A structured memory block with scope metadata. */
export type MemoryBlock = {
  scope: 'user' | 'parent-project' | 'project' | 'agent'
  label: string
  filePath: string
  content: string
}

/** Read a project-scope memory file from `<rootPath>/.openloaf/memory/MEMORY.md`. */
export function readMemoryFile(rootPath: string): string {
  const filePath = path.join(resolveMemoryDir(rootPath), MEMORY_FILE_NAME)
  if (!existsSync(filePath)) return ''
  try {
    return readFileSync(filePath, 'utf8').trim()
  } catch {
    return ''
  }
}

/** Write a project-scope memory file to `<rootPath>/.openloaf/memory/MEMORY.md`. */
export function writeMemoryFile(rootPath: string, content: string): void {
  const memoryDir = resolveMemoryDir(rootPath)
  mkdirSync(memoryDir, { recursive: true })
  const filePath = path.join(memoryDir, MEMORY_FILE_NAME)
  writeFileSync(filePath, content, 'utf8')
}

/** Read the user-global MEMORY.md index from temp-storage. */
export function readUserMemoryIndex(): string {
  const filePath = path.join(resolveUserMemoryDir(), MEMORY_FILE_NAME)
  if (!existsSync(filePath)) return ''
  try {
    return readFileSync(filePath, 'utf8').trim()
  } catch {
    return ''
  }
}

/** Write the user-global MEMORY.md index in temp-storage. */
export function writeUserMemoryIndex(content: string): void {
  const memoryDir = resolveUserMemoryDir()
  mkdirSync(memoryDir, { recursive: true })
  writeFileSync(path.join(memoryDir, MEMORY_FILE_NAME), content, 'utf8')
}

/** Truncate memory content when it exceeds maxLines. */
function truncateMemory(
  content: string,
  maxLines: number = DEFAULT_MAX_LINES,
): string {
  if (!content) return content
  const lines = content.split('\n')
  if (lines.length <= maxLines) return content
  return `${lines.slice(0, maxLines).join('\n')}\n\n... [memory truncated, ${maxLines} lines limit] ...`
}

/**
 * Resolve structured memory blocks for the current request.
 *
 * User-scope and agent-scope memory live under the shared temp-storage dir
 * (`${tempStorage}/memory` / `${tempStorage}/memory/agents/<name>`). Project
 * and parent-project memory live inside each project's own `.openloaf/memory/`.
 */
export function resolveMemoryBlocks(input: {
  projectRootPath?: string
  parentProjectRootPaths?: string[]
  /** Agent name for specialist memory (e.g., "coder", "document-writer"). */
  agentName?: string
}): MemoryBlock[] {
  const blocks: MemoryBlock[] = []

  // 1. user-global memory — temp-storage/memory/MEMORY.md
  {
    const userMemDir = resolveUserMemoryDir()
    const userMemFile = path.join(userMemDir, MEMORY_FILE_NAME)
    if (existsSync(userMemFile)) {
      try {
        const content = readFileSync(userMemFile, 'utf8').trim()
        if (content) {
          blocks.push({
            scope: 'user',
            label: 'user memory',
            filePath: userMemFile,
            content: truncateMemory(content),
          })
        }
      } catch {
        // Skip unreadable user memory
      }
    }
  }

  // 2. 父项目 memory — 从顶层到近层
  if (input.parentProjectRootPaths) {
    for (const parentRoot of input.parentProjectRootPaths) {
      const content = readMemoryFile(parentRoot)
      if (content) {
        const dirName = path.basename(parentRoot)
        blocks.push({
          scope: 'parent-project',
          label: `parent project memory (${dirName})`,
          filePath: path.join(resolveMemoryDir(parentRoot), MEMORY_FILE_NAME),
          content: truncateMemory(content),
        })
      }
    }
  }

  // 3. 当前项目 memory
  if (input.projectRootPath) {
    const content = readMemoryFile(input.projectRootPath)
    if (content) {
      blocks.push({
        scope: 'project',
        label: 'project memory',
        filePath: path.join(resolveMemoryDir(input.projectRootPath), MEMORY_FILE_NAME),
        content: truncateMemory(content),
      })
    }
  }

  // 4. Specialist Agent memory — temp-storage/memory/agents/<name>/MEMORY.md
  if (input.agentName) {
    const agentMemDir = resolveAgentMemoryDir(input.agentName)
    const agentMemPath = path.join(agentMemDir, MEMORY_FILE_NAME)
    if (existsSync(agentMemPath)) {
      try {
        const content = readFileSync(agentMemPath, 'utf8').trim()
        if (content) {
          blocks.push({
            scope: 'agent',
            label: `agent memory (${input.agentName})`,
            filePath: agentMemPath,
            content: truncateMemory(content),
          })
        }
      } catch {
        // Skip unreadable agent memory
      }
    }
  }

  return blocks
}
