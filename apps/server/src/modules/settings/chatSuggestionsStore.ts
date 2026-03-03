/**
 * JSONL-backed persistent cache for chat.suggestions.
 *
 * Each line: { scope, sessionCount, generatedAt, suggestions }
 * File path: ~/.openloaf/chat-suggestions.jsonl
 */

import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { resolveOpenLoafPath } from "@openloaf/config"

const JSONL_FILE = "chat-suggestions.jsonl"
const MAX_ENTRIES_PER_SCOPE = 20

interface SuggestionEntry {
  scope: string
  sessionCount: number
  generatedAt: string
  suggestions: Array<{ label: string; value: string; type: "completion" | "question" | "action" }>
}

function getFilePath(): string {
  return resolveOpenLoafPath(JSONL_FILE)
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function readAllEntries(): SuggestionEntry[] {
  const filePath = getFilePath()
  if (!existsSync(filePath)) return []
  const raw = readFileSync(filePath, "utf-8")
  const entries: SuggestionEntry[] = []
  for (const line of raw.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      entries.push(JSON.parse(trimmed) as SuggestionEntry)
    } catch {
      // skip malformed lines
    }
  }
  return entries
}

/** Return the latest cached entry for a given scope, or null. */
export function readLatestEntry(scope: string): SuggestionEntry | null {
  const entries = readAllEntries()
  let latest: SuggestionEntry | null = null
  for (const entry of entries) {
    if (entry.scope === scope) {
      latest = entry
    }
  }
  return latest
}

/** Append a new entry and compact if needed. */
export function appendEntry(
  scope: string,
  sessionCount: number,
  suggestions: Array<{ label: string; value: string; type: string }>,
): void {
  const filePath = getFilePath()
  ensureDir(filePath)

  const entry: SuggestionEntry = {
    scope,
    sessionCount,
    generatedAt: new Date().toISOString(),
    suggestions: suggestions as SuggestionEntry["suggestions"],
  }
  appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf-8")

  // compact if too many entries for this scope
  compactIfNeeded(scope)
}

/** Keep only the latest 1 entry per scope when count exceeds threshold. */
function compactIfNeeded(scope: string): void {
  const entries = readAllEntries()
  const scopeEntries = entries.filter((e) => e.scope === scope)
  if (scopeEntries.length <= MAX_ENTRIES_PER_SCOPE) return

  // Keep last 1 for this scope, all entries for other scopes
  const latestForScope = scopeEntries[scopeEntries.length - 1]
  const compacted = [...entries.filter((e) => e.scope !== scope), latestForScope]

  const filePath = getFilePath()
  writeFileSync(filePath, `${compacted.map((e) => JSON.stringify(e)).join("\n")}\n`, "utf-8")
}
