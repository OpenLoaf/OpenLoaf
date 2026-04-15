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
 * Session-scoped Read-before-Write state.
 *
 * Records what the AI has Read during a chat session so Write/Edit can
 * verify:
 *   1. The file was actually Read before being modified.
 *   2. The file hasn't changed between Read and Write/Edit (mtime match).
 *   3. The file was fully read before being overwritten by Write.
 *
 * Scope: module-level Map keyed by `${sessionId}\0${absPath}` — survives
 * across /chat/sse requests within the same chat session, so "Read in turn 1,
 * Edit in turn 2" does not force a re-Read. TTL + size pruning handles
 * cleanup (no session-delete hook yet).
 */

/** Record of a successful Read, or a post-Write/Edit state snapshot. */
export type ReadEntry = {
  /** File mtime at Read time (Math.floor(mtimeMs)). */
  mtime: number
  /** Read offset (1-indexed). 1 when the file was fully read. */
  offset: number
  /** Read limit. Number.MAX_SAFE_INTEGER when fully read. */
  limit: number
  /** Total line count of the file at Read time. */
  totalLines: number
  /** True when the displayed range did not cover the full file. */
  isPartialView: boolean
  /** Date.now() — for lazy TTL eviction. */
  recordedAt: number
  /**
   * How the file was read:
   * - `raw`: literal text content (editable with Edit/Write)
   * - `derived`: extracted/rendered view (e.g. PDF→Markdown, DOCX→Markdown,
   *    archive listing, media metadata). Edit/Write on the source file is
   *    meaningless and will be refused; use the format-specific mutate tool.
   */
  readMode: 'raw' | 'derived'
  /** For `derived` reads: which tool can actually mutate the source file. */
  mutateTool?: string
}

const TTL_MS = 60 * 60 * 1000 // 1h
const MAX_ENTRIES = 500

const readStateMap = new Map<string, ReadEntry>()

function keyOf(sessionId: string, absPath: string): string {
  return `${sessionId}\x00${absPath}`
}

/**
 * Drop expired entries, and if still over cap, drop oldest-recordedAt entries.
 * Called lazily from recordRead — avoids a background timer.
 */
function prune(): void {
  const now = Date.now()
  for (const [key, entry] of readStateMap) {
    if (now - entry.recordedAt > TTL_MS) {
      readStateMap.delete(key)
    }
  }
  if (readStateMap.size <= MAX_ENTRIES) return
  const overflow = readStateMap.size - MAX_ENTRIES
  const sorted = [...readStateMap.entries()].sort(
    (a, b) => a[1].recordedAt - b[1].recordedAt,
  )
  for (let i = 0; i < overflow; i++) {
    const entry = sorted[i]
    if (entry) readStateMap.delete(entry[0])
  }
}

/** Store/update an entry for (sessionId, absPath). */
export function recordRead(
  sessionId: string,
  absPath: string,
  entry: ReadEntry,
): void {
  readStateMap.set(keyOf(sessionId, absPath), entry)
  prune()
}

/** Retrieve an entry; returns undefined when absent or expired. */
export function getReadEntry(
  sessionId: string,
  absPath: string,
): ReadEntry | undefined {
  const entry = readStateMap.get(keyOf(sessionId, absPath))
  if (!entry) return undefined
  if (Date.now() - entry.recordedAt > TTL_MS) {
    readStateMap.delete(keyOf(sessionId, absPath))
    return undefined
  }
  return entry
}

/** Drop all entries for a given session (for future session-delete hook). */
export function clearSession(sessionId: string): void {
  const prefix = `${sessionId}\x00`
  for (const key of readStateMap.keys()) {
    if (key.startsWith(prefix)) readStateMap.delete(key)
  }
}

/** Test-only: reset the whole map. */
export function __resetForTests(): void {
  readStateMap.clear()
}
