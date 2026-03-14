/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/**
 * Memory tools — memory-search and memory-get for runtime memory retrieval.
 */
import { tool, zodSchema } from 'ai'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { memorySearchToolDef, memoryGetToolDef } from '@openloaf/api/types/tools/memory'
import { memoryIndexManager } from '@/memory/memoryIndexManager'
import { getRequestContext } from '@/ai/shared/context/requestContext'
import { resolveMemoryDir } from '@/ai/shared/memoryLoader'
import { logger } from '@/common/logger'

/** Resolve memory directories visible to the current agent. */
function resolveSearchDirs(scope?: 'user' | 'project' | 'agent'): string[] {
  const dirs: string[] = []
  const ctx = getRequestContext()

  const userMemDir = resolveMemoryDir(homedir())

  if (!scope || scope === 'user') {
    dirs.push(userMemDir)
  }

  if (!scope || scope === 'project') {
    // Project memory from parent project root paths
    if (ctx?.parentProjectRootPaths) {
      for (const rootPath of ctx.parentProjectRootPaths) {
        dirs.push(resolveMemoryDir(rootPath))
      }
    }
  }

  if (!scope || scope === 'agent') {
    // Agent-specific memory
    const agentStack = ctx?.agentStack
    if (agentStack && agentStack.length > 0) {
      const currentAgent = agentStack[agentStack.length - 1]
      if (currentAgent) {
        const agentMemDir = path.join(userMemDir, 'agents', currentAgent.name)
        dirs.push(agentMemDir)
      }
    }
  }

  return dirs
}

export const memorySearchTool = tool({
  description: memorySearchToolDef.description,
  inputSchema: zodSchema(memorySearchToolDef.parameters),
  execute: async ({ query, scope, topK }: { query: string; scope?: 'user' | 'project' | 'agent'; topK?: number }) => {
    try {
      const dirs = resolveSearchDirs(scope)
      if (dirs.length === 0) {
        return { ok: true, results: [], message: 'No memory directories available' }
      }

      const results = memoryIndexManager.search(dirs, query, topK ?? 10)

      return {
        ok: true,
        results: results.map((r) => ({
          filePath: r.entry.filePath,
          fileName: r.entry.fileName,
          date: r.entry.date,
          summary: r.entry.firstLine,
          decayWeight: Math.round(r.entry.decayWeight * 100) / 100,
          score: Math.round(r.score * 100) / 100,
        })),
      }
    } catch (err) {
      logger.error({ err }, '[memory-search] Failed to search memory')
      return { ok: false, error: String(err) }
    }
  },
})

export const memoryGetTool = tool({
  description: memoryGetToolDef.description,
  inputSchema: zodSchema(memoryGetToolDef.parameters),
  execute: async ({ filePath }: { filePath: string }) => {
    try {
      // Security: only allow reading from .openloaf/memory/ directories
      const normalizedPath = path.resolve(filePath)
      if (!normalizedPath.includes('.openloaf/memory') && !normalizedPath.includes('.openloaf\\memory')) {
        return { ok: false, error: 'Access denied: can only read from .openloaf/memory/ directories' }
      }

      const content = readFileSync(normalizedPath, 'utf8')
      return { ok: true, filePath: normalizedPath, content }
    } catch (err) {
      return { ok: false, error: `Failed to read memory file: ${err}` }
    }
  },
})
