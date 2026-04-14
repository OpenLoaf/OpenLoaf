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
 * Memory tools — MemorySave.
 *
 * Reading memory files is intentionally NOT a dedicated tool: the model can
 * use Glob/Grep/Read against `${USER_MEMORY_DIR}` / `${PROJECT_MEMORY_DIR}`
 * directly (both are resolved by expandPathTemplateVars).
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
import { memorySaveToolDef } from '@openloaf/api/types/tools/memory'
import { getRequestContext } from '@/ai/shared/context/requestContext'
import { resolveMemoryDir } from '@/ai/shared/memoryLoader'
import { logger } from '@/common/logger'

// ─── MemorySave ────────────────────────────────────────────────────────────

/** Resolve the target write directory based on scope + request context. Returns null if scope cannot be satisfied. */
function resolveWriteDir(scope: 'user' | 'project' | 'agent'): string | null {
  const ctx = getRequestContext()
  const userMemDir = resolveMemoryDir(homedir())

  if (scope === 'agent') {
    const agentStack = ctx?.agentStack
    const currentAgent = agentStack?.[agentStack.length - 1]
    if (currentAgent) {
      return path.join(userMemDir, 'agents', currentAgent.name)
    }
    return null
  }

  if (scope === 'project') {
    const roots = ctx?.parentProjectRootPaths
    const projectRoot = roots?.[roots.length - 1]
    if (projectRoot) {
      return resolveMemoryDir(projectRoot)
    }
    return null
  }

  return userMemDir
}

/** Find existing memory file matching `YYYY-MM-DD-{key}.md` or `{key}.md` precisely. */
function findExistingMemoryFile(memoryDir: string, key: string): string | null {
  if (!existsSync(memoryDir)) return null
  const exact = `${key}.md`
  const datedPattern = new RegExp(`^\\d{4}-\\d{2}-\\d{2}-${escapeRegexSource(key)}\\.md$`)
  const files = readdirSync(memoryDir)
  const matches = files
    .filter((f) => f === exact || datedPattern.test(f))
    .sort()
    .reverse()
  return matches[0] ? path.join(memoryDir, matches[0]) : null
}

function escapeRegexSource(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractFirstMeaningfulLine(content: string): string {
  for (const line of content.split('\n')) {
    const trimmed = line.replace(/^#+\s*/, '').replace(/^[-*]\s*/, '').trim()
    if (trimmed && !trimmed.startsWith('---') && !trimmed.startsWith('tags:')) {
      return trimmed.slice(0, 100)
    }
  }
  return ''
}

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

  const filtered = lines
    .filter((line) => !line.includes(`[${key}]`))
    .filter((line) => line.trim() !== '')

  if (action === 'add') {
    filtered.push(`- [${key}](${fileName}) — ${summary}`)
  }

  writeFileSync(indexPath, filtered.length > 0 ? filtered.join('\n') + '\n' : '', 'utf8')
}

/**
 * Format a memory file's absolute path as a template-variable path so callers
 * can pass it straight back to Read/Edit (both resolve ${USER_MEMORY_DIR} /
 * ${PROJECT_MEMORY_DIR} via expandPathTemplateVars).
 */
function formatMemoryFilePath(
  scope: 'user' | 'project' | 'agent',
  memoryDir: string,
  fileName: string,
): string {
  const absFile = path.join(memoryDir, fileName)
  if (scope === 'project') {
    const rel = path.relative(memoryDir, absFile).split(path.sep).join('/')
    return `\${PROJECT_MEMORY_DIR}/${rel}`
  }
  const userMemDir = resolveMemoryDir(homedir())
  const rel = path.relative(userMemDir, absFile).split(path.sep).join('/')
  return `\${USER_MEMORY_DIR}/${rel}`
}

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

    if (!KEY_PATTERN.test(key)) {
      return {
        ok: false,
        error: 'invalid_key',
        hint: 'key 必须是小写字母+数字+连字符（如 food-preferences），不能以连字符开头或结尾',
      }
    }

    const RESERVED_KEYS = ['memory', 'agents', 'index']
    if (RESERVED_KEYS.includes(key)) {
      return {
        ok: false,
        error: 'reserved_key',
        hint: `key "${key}" 是保留名，请使用其他名称`,
      }
    }

    try {
      const memoryDir = resolveWriteDir(effectiveScope)
      if (!memoryDir) {
        const scopeLabel = effectiveScope === 'project' ? '项目' : 'Agent'
        return {
          ok: false,
          error: 'no_scope_context',
          hint: `当前对话未绑定${scopeLabel}，无法保存 scope="${effectiveScope}" 的记忆。请使用 scope: "user" 或在${scopeLabel}对话中使用。`,
        }
      }
      mkdirSync(memoryDir, { recursive: true })

      const today = new Date().toISOString().slice(0, 10)
      const existingFile = findExistingMemoryFile(memoryDir, key)

      // ─── DELETE ───
      if (effectiveMode === 'delete') {
        if (!existingFile) {
          return { ok: false, error: 'not_found', hint: `没有找到 key="${key}" 的记忆文件` }
        }
        const deletedName = path.basename(existingFile)
        unlinkSync(existingFile)
        updateMemoryIndex(memoryDir, key, '', '', 'remove')
        return {
          ok: true,
          action: 'deleted',
          filePath: formatMemoryFilePath(effectiveScope, memoryDir, deletedName),
          scope: effectiveScope,
        }
      }

      if (!content) {
        return { ok: false, error: 'missing_content', hint: '非 delete 模式必须提供 content' }
      }

      // ─── APPEND ───
      if (effectiveMode === 'append') {
        if (!existingFile) {
          const fileName = `${today}-${key}.md`
          const filePath = path.join(memoryDir, fileName)
          writeFileSync(filePath, buildMemoryContent(content, tags), 'utf8')
          const summary = indexEntry || extractFirstMeaningfulLine(content)
          updateMemoryIndex(memoryDir, key, fileName, summary, 'add')
          return {
            ok: true,
            action: 'created',
            filePath: formatMemoryFilePath(effectiveScope, memoryDir, fileName),
            scope: effectiveScope,
          }
        }

        const existingContent = readFileSync(existingFile, 'utf8')
        writeFileSync(existingFile, existingContent.trimEnd() + '\n\n---\n\n' + content + '\n', 'utf8')
        return {
          ok: true,
          action: 'appended',
          filePath: formatMemoryFilePath(effectiveScope, memoryDir, path.basename(existingFile)),
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

      return {
        ok: true,
        action: existingRawContent ? 'updated' : 'created',
        filePath: formatMemoryFilePath(effectiveScope, memoryDir, fileName),
        scope: effectiveScope,
        ...(existingRawContent
          ? { previousContentPreview: existingRawContent.slice(0, 200) }
          : {}),
      }
    } catch (err) {
      logger.error({ err, key, scope: effectiveScope, mode: effectiveMode }, '[MemorySave] Failed')
      return { ok: false, error: String(err) }
    }
  },
})
