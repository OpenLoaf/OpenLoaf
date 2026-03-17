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
 * Memory tools — memory-search, memory-get and memory-save.
 */
import { tool, zodSchema } from 'ai'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import {
  memorySaveToolDef,
  memorySearchToolDef,
  memoryGetToolDef,
} from '@openloaf/api/types/tools/memory'
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

// ─── memory-save ────────────────────────────────────────────────────────────

/** Resolve the target write directory based on scope + request context. */
function resolveWriteDir(scope: 'user' | 'project' | 'agent'): string {
  const ctx = getRequestContext()
  const userMemDir = resolveMemoryDir(homedir())

  if (scope === 'agent') {
    const agentStack = ctx?.agentStack
    const currentAgent = agentStack?.[agentStack.length - 1]
    if (currentAgent) {
      return path.join(userMemDir, 'agents', currentAgent.name)
    }
    return userMemDir
  }

  if (scope === 'project') {
    // Use the deepest (most specific) project root path
    const roots = ctx?.parentProjectRootPaths
    const projectRoot = roots?.[roots.length - 1]
    if (projectRoot) {
      return resolveMemoryDir(projectRoot)
    }
  }

  return userMemDir
}

/** Find existing memory file matching `*-{key}.md` or `{key}.md` in a directory. */
function findExistingMemoryFile(memoryDir: string, key: string): string | null {
  if (!existsSync(memoryDir)) return null
  const suffix = `-${key}.md`
  const exact = `${key}.md`
  const files = readdirSync(memoryDir)
  const matches = files
    .filter((f) => f.endsWith(suffix) || f === exact)
    .sort()
    .reverse()
  return matches[0] ? path.join(memoryDir, matches[0]) : null
}

/** Extract first meaningful line from content (skip frontmatter / headings). */
function extractFirstMeaningfulLine(content: string): string {
  for (const line of content.split('\n')) {
    const trimmed = line.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '').trim()
    if (trimmed && !trimmed.startsWith('---') && !trimmed.startsWith('tags:')) {
      return trimmed.slice(0, 100)
    }
  }
  return ''
}

/** Build memory file content with optional frontmatter. */
function buildMemoryContent(
  content: string,
  tags?: string[],
  existingRawContent?: string,
): string {
  const now = new Date().toISOString().slice(0, 10)
  const parts: string[] = ['---']

  if (tags?.length) {
    parts.push(`tags: [${tags.join(', ')}]`)
  }

  if (existingRawContent) {
    const createdMatch = existingRawContent.match(/created:\s*(\d{4}-\d{2}-\d{2})/)
    parts.push(`created: ${createdMatch?.[1] ?? now}`)
  } else {
    parts.push(`created: ${now}`)
  }
  parts.push(`updated: ${now}`)
  parts.push('---', '')

  const cleanContent = content.replace(/^---[\s\S]*?---\s*\n?/, '')
  parts.push(cleanContent)
  return parts.join('\n')
}

/** Update MEMORY.md index — add or remove an entry by key. */
function updateMemoryIndex(
  memoryDir: string,
  key: string,
  fileName: string,
  summary: string,
  action: 'add' | 'remove',
): void {
  const indexPath = path.join(memoryDir, 'MEMORY.md')
  let lines: string[] = []

  if (existsSync(indexPath)) {
    lines = readFileSync(indexPath, 'utf8').split('\n')
  }

  // Remove existing entry with matching key
  const filtered = lines.filter((line) => !line.includes(`[${key}]`))

  if (action === 'add') {
    filtered.push(`- [${key}](${fileName}) — ${summary}`)
  }

  const result = filtered.join('\n').trim()
  writeFileSync(indexPath, result ? result + '\n' : '', 'utf8')
}

/** Validate key format: lowercase alphanumeric + hyphens. */
const KEY_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/

export const memorySaveTool = tool({
  description: memorySaveToolDef.description,
  inputSchema: zodSchema(memorySaveToolDef.parameters),
  needsApproval: false,
  execute: async ({
    key,
    content,
    scope,
    mode,
    tags,
    indexEntry,
  }: {
    key: string
    content?: string
    scope?: 'user' | 'project' | 'agent'
    mode?: 'upsert' | 'append' | 'delete'
    tags?: string[]
    indexEntry?: string
  }) => {
    const effectiveScope = scope ?? 'user'
    const effectiveMode = mode ?? 'upsert'

    // Validate key
    if (!KEY_PATTERN.test(key)) {
      return {
        ok: false,
        error: 'invalid_key',
        hint: 'key 必须是小写字母+数字+连字符（如 food-preferences），不能以连字符开头或结尾',
      }
    }

    try {
      const memoryDir = resolveWriteDir(effectiveScope)
      mkdirSync(memoryDir, { recursive: true })

      const today = new Date().toISOString().slice(0, 10)
      const existingFile = findExistingMemoryFile(memoryDir, key)

      // ─── DELETE ───
      if (effectiveMode === 'delete') {
        if (!existingFile) {
          return { ok: false, error: 'not_found', hint: `没有找到 key="${key}" 的记忆文件` }
        }
        unlinkSync(existingFile)
        updateMemoryIndex(memoryDir, key, '', '', 'remove')
        memoryIndexManager.invalidate(memoryDir)
        return {
          ok: true,
          action: 'deleted',
          deletedFile: path.basename(existingFile),
          scope: effectiveScope,
        }
      }

      // Content required for non-delete modes
      if (!content) {
        return { ok: false, error: 'missing_content', hint: '非 delete 模式必须提供 content' }
      }

      // ─── APPEND ───
      if (effectiveMode === 'append') {
        if (!existingFile) {
          // Fallback to create
          const fileName = `${today}-${key}.md`
          const filePath = path.join(memoryDir, fileName)
          writeFileSync(filePath, buildMemoryContent(content, tags), 'utf8')
          const summary = indexEntry || extractFirstMeaningfulLine(content)
          updateMemoryIndex(memoryDir, key, fileName, summary, 'add')
          memoryIndexManager.invalidate(memoryDir)
          return { ok: true, action: 'created', filePath: fileName, scope: effectiveScope }
        }

        const existingContent = readFileSync(existingFile, 'utf8')
        writeFileSync(existingFile, existingContent.trimEnd() + '\n\n---\n\n' + content + '\n', 'utf8')
        memoryIndexManager.invalidate(memoryDir)
        return {
          ok: true,
          action: 'appended',
          filePath: path.basename(existingFile),
          scope: effectiveScope,
        }
      }

      // ─── UPSERT (default) ───
      let existingRawContent: string | undefined
      if (existingFile) {
        existingRawContent = readFileSync(existingFile, 'utf8')
        unlinkSync(existingFile)
      }

      const fileName = `${today}-${key}.md`
      const filePath = path.join(memoryDir, fileName)
      writeFileSync(filePath, buildMemoryContent(content, tags, existingRawContent), 'utf8')

      const summary = indexEntry || extractFirstMeaningfulLine(content)
      updateMemoryIndex(memoryDir, key, fileName, summary, 'add')
      memoryIndexManager.invalidate(memoryDir)

      return {
        ok: true,
        action: existingRawContent ? 'updated' : 'created',
        filePath: fileName,
        scope: effectiveScope,
        ...(existingRawContent
          ? { previousContentPreview: existingRawContent.slice(0, 200) }
          : {}),
      }
    } catch (err) {
      logger.error({ err, key, scope: effectiveScope, mode: effectiveMode }, '[memory-save] Failed')
      return { ok: false, error: String(err) }
    }
  },
})
