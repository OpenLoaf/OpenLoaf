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
 * Shared front-matter parsing utilities used by skillsLoader and agentConfigService.
 */

const FRONT_MATTER_DELIMITER = '---'

/** Normalize scalar values from YAML front matter (strip surrounding quotes). */
export function normalizeScalar(value: string): string {
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

/** Normalize description into a single-line string. */
export function normalizeDescription(value?: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) return '未提供'
  return trimmed.replace(/\s+/gu, ' ')
}

/** Normalize root path input into a usable string. */
export function normalizeRootPath(value?: string): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

/** Normalize parent project root paths in priority order (deduped, reversed). */
export function normalizeRootPathList(values?: string[]): string[] {
  if (!Array.isArray(values)) return []
  const normalized = values
    .map((v) => normalizeRootPath(v))
    .filter((v): v is string => Boolean(v))
  const unique = new Set<string>()
  const deduped = normalized.filter((v) => {
    if (unique.has(v)) return false
    unique.add(v)
    return true
  })
  return deduped.reverse()
}

/** Strip YAML front matter from markdown content, returning body only. */
export function stripFrontMatter(content: string): string {
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

export type SkillFrontMatter = {
  name?: string
  description?: string
}

/** Parse YAML front matter from SKILL.md content, extracting name and description. */
export function parseFrontMatter(content: string): SkillFrontMatter {
  const lines = content.split(/\r?\n/u)
  if (lines.length === 0) return {}
  const firstLine = lines[0] ?? ''
  if (firstLine.trim() !== FRONT_MATTER_DELIMITER) return {}

  const result: SkillFrontMatter = {}
  let currentKey: 'name' | 'description' | null = null
  let blockMode: 'literal' | 'folded' | null = null
  let buffer: string[] = []

  const flushBlock = () => {
    if (!currentKey) return
    const rawValue = blockMode === 'folded' ? buffer.join(' ') : buffer.join('\n')
    const normalized = rawValue.trim()
    if (normalized) {
      result[currentKey] = normalized
    }
    currentKey = null
    blockMode = null
    buffer = []
  }

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    if (line.trim() === FRONT_MATTER_DELIMITER) {
      flushBlock()
      break
    }

    if (currentKey && (line.startsWith(' ') || line.startsWith('\t') || line.trim() === '')) {
      buffer.push(line.replace(/^\s*/u, ''))
      continue
    }

    if (currentKey) {
      flushBlock()
    }

    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line)
    if (!match) continue
    const key = match[1]
    const rawValue = (match[2] ?? '').trim()

    if (key !== 'name' && key !== 'description') continue

    if (rawValue === '|' || rawValue === '>') {
      currentKey = key
      blockMode = rawValue === '>' ? 'folded' : 'literal'
      buffer = []
      continue
    }

    const normalized = normalizeScalar(rawValue)
    if (normalized) {
      result[key] = normalized
    }
  }

  return result
}
