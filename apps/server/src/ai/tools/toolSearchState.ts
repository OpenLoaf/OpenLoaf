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
 * Per-session state tracking which tools have been activated via tool-search.
 */
export class ActivatedToolSet {
  /** Core tools that are always available (e.g. tool-search). */
  private readonly coreToolIds: ReadonlySet<string>
  /** Tools dynamically activated via tool-search. */
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
   * Scans assistant messages for tool-search results (state: output-available)
   * and re-activates the tools that were previously loaded. This restores the
   * dynamic tool activation state that would otherwise be lost when a new
   * ActivatedToolSet is created (e.g., after an approval flow interruption).
   *
   * @param availableToolIds - If provided, only rehydrate IDs that are still
   *   available (prevents rehydrating tools from disconnected MCP servers).
   */
  static rehydrateFromMessages(
    set: ActivatedToolSet,
    messages: { role: string; parts?: unknown[] }[],
    availableToolIds?: ReadonlySet<string>,
  ): void {
    const ids: string[] = []
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      const parts = Array.isArray(msg.parts) ? msg.parts : []
      for (const part of parts) {
        if (!part || typeof part !== 'object') continue
        const p = part as Record<string, unknown>
        if (
          p.toolName === 'tool-search' &&
          p.state === 'output-available' &&
          p.output &&
          typeof p.output === 'object'
        ) {
          const output = p.output as Record<string, unknown>
          const tools = Array.isArray(output.tools) ? output.tools : []
          for (const t of tools) {
            if (t && typeof t === 'object' && typeof (t as any).id === 'string') {
              const toolId = (t as any).id as string
              // Skip tools that are no longer available (e.g. MCP server disconnected)
              if (availableToolIds && !availableToolIds.has(toolId)) continue
              ids.push(toolId)
            }
          }
        }
      }
    }
    if (ids.length > 0) set.activate(ids)
  }
}
