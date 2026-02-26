/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport path from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { resolveAgentDir } from '@/ai/shared/defaultAgentResolver'

/** Default agent folder name. */
const DEFAULT_AGENT_FOLDER = 'default'
/** Memory file name. */
const MEMORY_FILE_NAME = 'MEMORY.md'
/** Default max characters per single memory file. */
const DEFAULT_MAX_CHARS = 4000

/** Read a memory file from <rootPath>/.openloaf/agents/default/MEMORY.md. */
export function readMemoryFile(rootPath: string): string {
  const filePath = path.join(
    resolveAgentDir(rootPath, DEFAULT_AGENT_FOLDER),
    MEMORY_FILE_NAME,
  )
  if (!existsSync(filePath)) return ''
  try {
    return readFileSync(filePath, 'utf8').trim()
  } catch {
    return ''
  }
}

/**
 * Truncate memory content when it exceeds maxChars.
 * Strategy: head 70% + truncation marker + tail 20%.
 */
export function truncateMemory(
  content: string,
  maxChars: number = DEFAULT_MAX_CHARS,
): string {
  if (!content || content.length <= maxChars) return content
  const headSize = Math.floor(maxChars * 0.7)
  const tailSize = Math.floor(maxChars * 0.2)
  const head = content.slice(0, headSize)
  const tail = content.slice(-tailSize)
  return `${head}\n\n... [memory truncated] ...\n\n${tail}`
}

/**
 * Resolve merged memory content from workspace + parent projects + current project.
 * Memory files are merged (not overridden) because they represent different scopes.
 */
export function resolveMemoryContent(input: {
  workspaceRootPath?: string
  projectRootPath?: string
  parentProjectRootPaths?: string[]
}): string {
  const sections: string[] = []

  // 1. workspace 级 memory — 所有项目共享
  if (input.workspaceRootPath) {
    const content = readMemoryFile(input.workspaceRootPath)
    if (content) {
      sections.push(
        `## Workspace Memory\n${truncateMemory(content)}`,
      )
    }
  }

  // 2. 父项目 memory — 从顶层到近层
  if (input.parentProjectRootPaths) {
    for (const parentRoot of input.parentProjectRootPaths) {
      const content = readMemoryFile(parentRoot)
      if (content) {
        const dirName = path.basename(parentRoot)
        sections.push(
          `## Parent Project Memory (${dirName})\n${truncateMemory(content)}`,
        )
      }
    }
  }

  // 3. 当前项目 memory — 仅当前项目
  if (input.projectRootPath) {
    const content = readMemoryFile(input.projectRootPath)
    if (content) {
      sections.push(
        `## Project Memory\n${truncateMemory(content)}`,
      )
    }
  }

  return sections.join('\n\n')
}
