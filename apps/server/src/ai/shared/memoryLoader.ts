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

/** Memory directory name under .openloaf/. */
const MEMORY_DIR_NAME = 'memory'
/** Memory file name. */
const MEMORY_FILE_NAME = 'MEMORY.md'
/** Default max lines per single memory file. */
const DEFAULT_MAX_LINES = 200

/** Resolve memory directory path: <rootPath>/.openloaf/memory/ */
export function resolveMemoryDir(rootPath: string): string {
  return path.join(rootPath, '.openloaf', MEMORY_DIR_NAME)
}

/** A structured memory block with scope metadata. */
export type MemoryBlock = {
  scope: 'workspace' | 'parent-project' | 'project'
  label: string
  filePath: string
  content: string
}

/** Read a memory file from <rootPath>/.openloaf/memory/MEMORY.md. */
export function readMemoryFile(rootPath: string): string {
  const filePath = path.join(resolveMemoryDir(rootPath), MEMORY_FILE_NAME)
  if (!existsSync(filePath)) return ''
  try {
    return readFileSync(filePath, 'utf8').trim()
  } catch {
    return ''
  }
}

/** Write memory content to <rootPath>/.openloaf/memory/MEMORY.md. */
export function writeMemoryFile(rootPath: string, content: string): void {
  const memoryDir = resolveMemoryDir(rootPath)
  mkdirSync(memoryDir, { recursive: true })
  const filePath = path.join(memoryDir, MEMORY_FILE_NAME)
  writeFileSync(filePath, content, 'utf8')
}

/**
 * Truncate memory content when it exceeds maxLines.
 * Keeps the first maxLines lines + truncation marker.
 */
export function truncateMemory(
  content: string,
  maxLines: number = DEFAULT_MAX_LINES,
): string {
  if (!content) return content
  const lines = content.split('\n')
  if (lines.length <= maxLines) return content
  return `${lines.slice(0, maxLines).join('\n')}\n\n... [memory truncated, ${maxLines} lines limit] ...`
}

/**
 * Resolve structured memory blocks from workspace + parent projects + current project.
 * Each block carries its own scope, label, file path, and content.
 */
export function resolveMemoryBlocks(input: {
  workspaceRootPath?: string
  projectRootPath?: string
  parentProjectRootPaths?: string[]
}): MemoryBlock[] {
  const blocks: MemoryBlock[] = []

  // 1. workspace 级 memory — 所有项目共享
  if (input.workspaceRootPath) {
    const content = readMemoryFile(input.workspaceRootPath)
    if (content) {
      blocks.push({
        scope: 'workspace',
        label: 'workspace memory',
        filePath: path.join(resolveMemoryDir(input.workspaceRootPath), MEMORY_FILE_NAME),
        content: truncateMemory(content),
      })
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

  // 3. 当前项目 memory — 仅当前项目
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

  return blocks
}

/**
 * Resolve merged memory content from workspace + parent projects + current project.
 * @deprecated Use resolveMemoryBlocks() for structured output instead.
 */
export function resolveMemoryContent(input: {
  workspaceRootPath?: string
  projectRootPath?: string
  parentProjectRootPaths?: string[]
}): string {
  const blocks = resolveMemoryBlocks(input)
  if (blocks.length === 0) return ''
  return blocks
    .map((block) => {
      const scopeLabel =
        block.scope === 'workspace'
          ? 'Workspace Memory'
          : block.scope === 'parent-project'
            ? `Parent Project Memory (${path.basename(path.dirname(path.dirname(block.filePath)))})`
            : 'Project Memory'
      return `## ${scopeLabel}\n${block.content}`
    })
    .join('\n\n')
}
