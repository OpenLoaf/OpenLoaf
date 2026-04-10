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
 * Per-session state tracking which tools have been activated via ToolSearch.
 */

/**
 * Metadata key on a user message storing the DYNAMIC tool snapshot — the set
 * of tools loaded via ToolSearch at any point up to this turn. Used by
 * `rehydrateFromMessages` to restore activation state without re-scanning the
 * full chain.
 */
export const ACTIVATED_TOOLS_METADATA_KEY = 'activatedToolIds'

/**
 * Metadata key on a user message storing the CORE (always-on) tool IDs for
 * this turn. Purely informational — the real core set is resolved fresh from
 * `CORE_TOOL_IDS` every request. Persisted so debug views can display the
 * exact set the LLM saw at turn start without re-querying a registry.
 */
export const CORE_TOOLS_METADATA_KEY = 'coreToolIds'

type RehydrateMessage = {
  role: string
  parts?: unknown[]
  metadata?: Record<string, unknown> | null
}

/** Extract ToolSearch-loaded tool IDs from a single assistant message's parts. */
function extractToolIdsFromAssistantParts(parts: unknown[]): string[] {
  const ids: string[] = []
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue
    const p = part as Record<string, unknown>

    // Resolve toolName from explicit field or derive from type prefix.
    // Supports both AI SDK format (toolName === 'ToolSearch') and stored
    // JSONL format (type === 'tool-tool-search').
    const toolName =
      typeof p.toolName === 'string'
        ? p.toolName
        : typeof p.type === 'string' && (p.type as string).startsWith('tool-')
          ? (p.type as string).slice(5)
          : ''
    const normalized = toolName === 'tool-search' ? 'ToolSearch' : toolName

    if (
      normalized === 'ToolSearch' &&
      p.state === 'output-available' &&
      p.output &&
      typeof p.output === 'object'
    ) {
      const output = p.output as Record<string, unknown>
      const tools = Array.isArray(output.tools) ? output.tools : []
      for (const t of tools) {
        if (t && typeof t === 'object' && typeof (t as { id?: unknown }).id === 'string') {
          ids.push((t as { id: string }).id)
        }
      }
    }
  }
  return ids
}

/** Legacy fallback: scan ALL assistant messages for ToolSearch tool IDs. */
function legacyScanAllAssistants(messages: RehydrateMessage[]): string[] {
  const ids: string[] = []
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    const parts = Array.isArray(msg.parts) ? msg.parts : []
    ids.push(...extractToolIdsFromAssistantParts(parts))
  }
  return ids
}

/** Read the snapshot stored in a user message's metadata; null if absent/invalid. */
function readSnapshot(msg: RehydrateMessage): string[] | null {
  const md = msg.metadata
  if (!md || typeof md !== 'object') return null
  const raw = (md as Record<string, unknown>)[ACTIVATED_TOOLS_METADATA_KEY]
  if (!Array.isArray(raw)) return null
  return raw.filter((id): id is string => typeof id === 'string')
}

export class ActivatedToolSet {
  /** Core tools that are always available (e.g. ToolSearch). */
  private readonly coreToolIds: ReadonlySet<string>
  /** Tools dynamically activated via ToolSearch. */
  private readonly activatedIds = new Set<string>()

  constructor(coreToolIds: readonly string[]) {
    this.coreToolIds = new Set(coreToolIds)
  }

  activate(toolIds: string[]): void {
    for (const id of toolIds) this.activatedIds.add(id)
  }

  getActiveToolIds(): string[] {
    return [...this.coreToolIds, ...this.activatedIds]
  }

  isActive(toolId: string): boolean {
    return this.coreToolIds.has(toolId) || this.activatedIds.has(toolId)
  }

  /** Deactivate a specific tool (e.g. when its MCP server disconnects). */
  deactivate(toolId: string): void {
    this.activatedIds.delete(toolId)
  }

  /** Deactivate all tools matching a prefix (e.g. "mcp__serverName__"). */
  deactivateByPrefix(prefix: string): void {
    for (const id of this.activatedIds) {
      if (id.startsWith(prefix)) this.activatedIds.delete(id)
    }
  }

  /**
   * Rehydrate activated tool IDs from message history.
   *
   * Preferred path (O(1)): read the snapshot stored in the last user message's
   * `metadata.activatedToolIds`. The snapshot is the accumulated set of all
   * ToolSearch-loaded tools up to that turn, persisted by
   * `computeSnapshotForUserMessage` before each request.
   *
   * Legacy fallback (O(N)): if the last user message has no snapshot (older
   * sessions recorded before this mechanism existed), scan ALL assistant
   * messages in the chain for ToolSearch outputs — identical to the old
   * behavior so nothing regresses on historical data.
   *
   * Approval-resume safety: we always also scan any assistant messages that
   * appear AFTER the last user in the chain. When an approval interruption
   * resumes a partial assistant stream, the stored snapshot was written at
   * request start and doesn't yet include newly-loaded tools from that
   * partial stream — the post-user scan backfills them.
   *
   * @param availableToolIds - If provided, only rehydrate IDs still available
   *   (skips tools from disconnected MCP servers).
   */
  static rehydrateFromMessages(
    set: ActivatedToolSet,
    messages: RehydrateMessage[],
    availableToolIds?: ReadonlySet<string>,
  ): void {
    if (messages.length === 0) return

    // Locate the last user message — snapshots live there.
    let lastUserIdx = -1
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'user') {
        lastUserIdx = i
        break
      }
    }

    const ids: string[] = []

    if (lastUserIdx >= 0) {
      const lastUser = messages[lastUserIdx] as RehydrateMessage
      const snapshot = readSnapshot(lastUser)
      if (snapshot !== null) {
        ids.push(...snapshot)
      } else {
        // Legacy data — full scan up to and including the last user turn's window.
        ids.push(...legacyScanAllAssistants(messages.slice(0, lastUserIdx + 1)))
      }
      // Approval-resume backfill: also capture any assistants after the last user.
      for (let i = lastUserIdx + 1; i < messages.length; i += 1) {
        const msg = messages[i]
        if (!msg || msg.role !== 'assistant') continue
        const parts = Array.isArray(msg.parts) ? msg.parts : []
        ids.push(...extractToolIdsFromAssistantParts(parts))
      }
    } else {
      // No user in chain — degenerate case; fall back to full scan.
      ids.push(...legacyScanAllAssistants(messages))
    }

    const filtered = availableToolIds ? ids.filter((id) => availableToolIds.has(id)) : ids
    if (filtered.length > 0) set.activate(filtered)
  }

  /**
   * Compute the DYNAMIC activated-tools snapshot to persist on a user message.
   *
   * Semantics: "every tool loaded via ToolSearch at any point in the
   * conversation up to the start of this user turn". Core/always-on tools are
   * NOT included here — they're persisted separately under
   * `CORE_TOOLS_METADATA_KEY` so debug views can split the two groups without
   * losing the rehydrate fast path (which only needs the dynamic delta to
   * layer on top of the fresh CORE_TOOL_IDS).
   *
   * The dynamic portion is seeded by the PREVIOUS user message's own snapshot
   * (so we never re-scan ancient history — each turn just adds its delta on
   * top), plus all ToolSearch outputs observed between the previous user and
   * the end of the chain. Scanning to end (rather than stopping at the target
   * index) captures partial assistant streams from approval-resume flows.
   *
   * If the previous user has no stored snapshot (legacy data), we fall back
   * to scanning all pre-target history for ToolSearch outputs — giving
   * exactly the same dynamic set the old O(N) rehydrate would have produced.
   *
   * @param messages - chain containing the target user message
   * @param targetUserIdx - index of the user message whose snapshot we compute
   * @param availableToolIds - optional filter for currently-available tool IDs
   */
  static computeSnapshotForUserMessage(
    messages: RehydrateMessage[],
    targetUserIdx: number,
    availableToolIds?: ReadonlySet<string>,
  ): string[] {
    if (targetUserIdx < 0 || targetUserIdx >= messages.length) return []
    if (messages[targetUserIdx]?.role !== 'user') return []

    // Find the most recent user message BEFORE the target.
    let prevUserIdx = -1
    for (let i = targetUserIdx - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === 'user') {
        prevUserIdx = i
        break
      }
    }

    const accumulated = new Set<string>()

    // Seed with previous user's snapshot (or legacy scan of pre-target range).
    if (prevUserIdx >= 0) {
      const prevUser = messages[prevUserIdx] as RehydrateMessage
      const prevSnapshot = readSnapshot(prevUser)
      if (prevSnapshot !== null) {
        for (const id of prevSnapshot) accumulated.add(id)
      } else {
        for (const id of legacyScanAllAssistants(messages.slice(0, targetUserIdx))) {
          accumulated.add(id)
        }
      }
    }

    // Accumulate ToolSearch loads from (prevUserIdx, end-of-chain].
    // Scanning to end (rather than stopping at targetUserIdx) captures partial
    // assistant streams from approval-resume flows on the current turn.
    const scanStart = prevUserIdx >= 0 ? prevUserIdx + 1 : 0
    for (let i = scanStart; i < messages.length; i += 1) {
      const msg = messages[i]
      if (!msg || msg.role !== 'assistant') continue
      const parts = Array.isArray(msg.parts) ? msg.parts : []
      for (const id of extractToolIdsFromAssistantParts(parts)) {
        accumulated.add(id)
      }
    }

    const result = [...accumulated]
    return availableToolIds ? result.filter((id) => availableToolIds.has(id)) : result
  }
}
