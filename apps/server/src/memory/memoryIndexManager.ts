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
 * MemoryIndexManager — 内存中的记忆文件索引。
 *
 * 设计原则（参考 OpenClaw）：
 * - 文件即真相，不依赖向量数据库
 * - 用关键词匹配 + 日期衰减权重排序
 * - 索引不持久化，重启后重建（记忆文件通常不多）
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { logger } from '@/common/logger'

/** Half-life for date-based memory decay (in days). */
const DECAY_HALF_LIFE_DAYS = 30

/** Lambda for exponential decay: ln(2) / halfLife. */
const DECAY_LAMBDA = Math.LN2 / DECAY_HALF_LIFE_DAYS

/** Date pattern for memory files: YYYY-MM-DD or YYYY-MM-DD-slug. */
const DATE_FILE_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:[-_].+)?\.md$/

/** Indexed memory entry. */
export type MemoryEntry = {
  filePath: string
  fileName: string
  /** Parsed date from filename (null for evergreen files like MEMORY.md). */
  date: string | null
  /** Keywords extracted from file content. */
  keywords: string[]
  /** First non-empty line as summary. */
  firstLine: string
  /** Pre-calculated decay weight (1.0 for evergreen, decays for dated files). */
  decayWeight: number
}

/** Search result with relevance score. */
export type MemorySearchResult = {
  entry: MemoryEntry
  /** Combined score: keyword match × decay weight. */
  score: number
}

/** Calculate exponential decay weight for a given date. */
export function calculateDecayWeight(dateStr: string | null, now?: Date): number {
  if (!dateStr) return 1.0 // Evergreen — no decay
  const fileDate = new Date(dateStr)
  if (Number.isNaN(fileDate.getTime())) return 1.0
  const nowTime = (now ?? new Date()).getTime()
  const ageInDays = (nowTime - fileDate.getTime()) / (1000 * 60 * 60 * 24)
  if (ageInDays <= 0) return 1.0
  return Math.exp(-DECAY_LAMBDA * ageInDays)
}

/** Extract keywords from text content (simple word tokenization). */
function extractKeywords(content: string): string[] {
  // Split on whitespace and punctuation, lowercase, deduplicate
  const words = content
    .toLowerCase()
    .replace(/[#*`\-_=\[\](){}|\\/<>]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && w.length <= 50)
  return [...new Set(words)]
}

/** Parse date from memory filename. */
function parseDateFromFileName(fileName: string): string | null {
  const match = fileName.match(DATE_FILE_PATTERN)
  return match?.[1] ?? null
}

class MemoryIndexManager {
  private indices = new Map<string, Map<string, MemoryEntry>>()
  private lastScanTime = new Map<string, number>()
  /** Re-scan interval in milliseconds (5 minutes). */
  private scanIntervalMs = 5 * 60 * 1000

  /**
   * Scan a memory directory and build/refresh the index.
   * Skips if scanned recently (within scanIntervalMs).
   */
  scan(memoryDir: string, force = false): Map<string, MemoryEntry> {
    const now = Date.now()
    const existing = this.indices.get(memoryDir)
    const lastScan = this.lastScanTime.get(memoryDir) ?? 0

    if (!force && existing && (now - lastScan) < this.scanIntervalMs) {
      return existing
    }

    const index = new Map<string, MemoryEntry>()

    try {
      const files = readdirSync(memoryDir)
      const nowDate = new Date()

      for (const fileName of files) {
        if (!fileName.endsWith('.md')) continue
        const filePath = path.join(memoryDir, fileName)

        try {
          const stat = statSync(filePath)
          if (!stat.isFile()) continue

          const content = readFileSync(filePath, 'utf8')
          const lines = content.split('\n').filter((l) => l.trim())
          const date = parseDateFromFileName(fileName)

          index.set(filePath, {
            filePath,
            fileName,
            date,
            keywords: extractKeywords(content),
            firstLine: lines[0]?.trim() ?? '',
            decayWeight: calculateDecayWeight(date, nowDate),
          })
        } catch {
          // Skip unreadable files
        }
      }

      // Also scan agents/ subdirectory for specialist memories
      const agentsDir = path.join(memoryDir, 'agents')
      try {
        const agentDirs = readdirSync(agentsDir)
        for (const agentName of agentDirs) {
          const agentMemDir = path.join(agentsDir, agentName)
          try {
            const stat = statSync(agentMemDir)
            if (!stat.isDirectory()) continue
            const agentFiles = readdirSync(agentMemDir)
            for (const fileName of agentFiles) {
              if (!fileName.endsWith('.md')) continue
              const filePath = path.join(agentMemDir, fileName)
              try {
                const fstat = statSync(filePath)
                if (!fstat.isFile()) continue
                const content = readFileSync(filePath, 'utf8')
                const lines = content.split('\n').filter((l) => l.trim())
                const date = parseDateFromFileName(fileName)
                index.set(filePath, {
                  filePath,
                  fileName,
                  date,
                  keywords: extractKeywords(content),
                  firstLine: lines[0]?.trim() ?? '',
                  decayWeight: calculateDecayWeight(date, new Date()),
                })
              } catch { /* skip */ }
            }
          } catch { /* skip */ }
        }
      } catch { /* agents/ may not exist */ }
    } catch (err) {
      logger.debug({ memoryDir, err }, '[memory-index] Failed to scan directory')
    }

    this.indices.set(memoryDir, index)
    this.lastScanTime.set(memoryDir, now)
    return index
  }

  /**
   * Search memory files by query keywords.
   * Returns results sorted by (keyword match score × decay weight).
   */
  search(
    memoryDirs: string[],
    query: string,
    topK = 10,
  ): MemorySearchResult[] {
    const queryKeywords = extractKeywords(query)
    if (queryKeywords.length === 0) return []

    const results: MemorySearchResult[] = []

    for (const dir of memoryDirs) {
      const index = this.scan(dir)
      for (const entry of index.values()) {
        // Simple keyword matching score (fraction of query keywords found)
        let matchCount = 0
        for (const qk of queryKeywords) {
          if (entry.keywords.some((ek) => ek.includes(qk) || qk.includes(ek))) {
            matchCount++
          }
        }
        if (matchCount === 0) continue

        const matchScore = matchCount / queryKeywords.length
        const score = matchScore * entry.decayWeight
        results.push({ entry, score })
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, topK)
  }

  /** Get a specific memory entry by file path. */
  getEntry(filePath: string): MemoryEntry | undefined {
    for (const index of this.indices.values()) {
      const entry = index.get(filePath)
      if (entry) return entry
    }
    return undefined
  }

  /** Invalidate a specific directory's index. */
  invalidate(memoryDir: string): void {
    this.indices.delete(memoryDir)
    this.lastScanTime.delete(memoryDir)
  }
}

export const memoryIndexManager = new MemoryIndexManager()
