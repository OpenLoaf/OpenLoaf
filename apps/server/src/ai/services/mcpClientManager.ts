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
 * MCP Client Manager
 *
 * Manages MCP client connections with:
 * - Lazy initialization (connect on first tool-search activation)
 * - Connection pooling (shared across chat sessions)
 * - Idle timeout (disconnect after inactivity)
 * - PID tracking for stdio processes (orphan cleanup)
 * - Automatic tool registration/unregistration in toolRegistry
 * - Automatic catalog entry management in toolCatalog
 */

import { createMCPClient, type MCPClient } from '@ai-sdk/mcp'
import { Experimental_StdioMCPTransport } from '@ai-sdk/mcp/mcp-stdio'
import { logger } from '@/common/logger'
import {
  registerMcpTool,
  unregisterMcpToolsByServer,
} from '@/ai/tools/toolRegistry'
import {
  registerMcpCatalogEntry,
  unregisterMcpCatalogEntriesByServer,
  extractKeywordsFromDescription,
} from '@openloaf/api/types/tools/toolCatalog'
import type { MCPServerConfig, MCPServerStatus } from '@openloaf/api/types/mcp'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MCPClientEntry = {
  config: MCPServerConfig
  client: MCPClient | null
  /** Connection promise (dedup thundering herd). */
  connectPromise: Promise<void> | null
  status: MCPServerStatus
  toolIds: string[]
  lastUsedAt: number
  error?: string
  /** PID of stdio child process. */
  pid?: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Idle timeout: disconnect after 5 minutes of no tool calls. */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000
/** Cleanup sweep interval: check for idle connections every 60 seconds. */
const CLEANUP_INTERVAL_MS = 60 * 1000
/** Max concurrent MCP connections. */
const MAX_CONCURRENT_CONNECTIONS = 10

// ---------------------------------------------------------------------------
// Singleton Manager
// ---------------------------------------------------------------------------

class MCPClientManagerImpl {
  private entries = new Map<string, MCPClientEntry>()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.startCleanupSweep()
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Connect to an MCP server and register its tools.
   * Uses promise dedup to prevent thundering herd.
   */
  async connect(config: MCPServerConfig): Promise<string[]> {
    const existing = this.entries.get(config.id)
    if (existing?.status === 'connected' && existing.client) {
      existing.lastUsedAt = Date.now()
      return existing.toolIds
    }

    // Dedup concurrent connect calls
    if (existing?.connectPromise) {
      await existing.connectPromise
      return existing?.toolIds ?? []
    }

    const entry: MCPClientEntry = {
      config,
      client: null,
      connectPromise: null,
      status: 'connecting',
      toolIds: [],
      lastUsedAt: Date.now(),
    }
    this.entries.set(config.id, entry)

    const connectPromise = this.doConnect(entry)
    entry.connectPromise = connectPromise

    try {
      await connectPromise
      return entry.toolIds
    } finally {
      entry.connectPromise = null
    }
  }

  /** Disconnect a specific MCP server. */
  async disconnect(serverId: string): Promise<void> {
    const entry = this.entries.get(serverId)
    if (!entry) return
    await this.doDisconnect(entry)
    this.entries.delete(serverId)
  }

  /** Disconnect all MCP servers (called on graceful shutdown). */
  async shutdownAll(): Promise<void> {
    logger.info('[mcp-manager] Shutting down all MCP connections')
    this.stopCleanupSweep()
    const promises = [...this.entries.values()].map((e) => this.doDisconnect(e))
    await Promise.allSettled(promises)
    this.entries.clear()
  }

  /** Get status info for all managed servers. */
  getServerInfos(): Array<{
    id: string
    name: string
    status: MCPServerStatus
    toolCount: number
    toolIds: string[]
    error?: string
    pid?: number
  }> {
    return [...this.entries.values()].map((e) => ({
      id: e.config.id,
      name: e.config.name,
      status: e.status,
      toolCount: e.toolIds.length,
      toolIds: e.toolIds,
      error: e.error,
      pid: e.pid,
    }))
  }

  /** Get status of a specific server. */
  getServerStatus(serverId: string): MCPServerStatus {
    return this.entries.get(serverId)?.status ?? 'disconnected'
  }

  /** Mark a tool as recently used (resets idle timer). */
  touchServer(serverId: string): void {
    const entry = this.entries.get(serverId)
    if (entry) entry.lastUsedAt = Date.now()
  }

  /** Get tool IDs for a specific server. */
  getServerToolIds(serverId: string): string[] {
    return this.entries.get(serverId)?.toolIds ?? []
  }

  /** Check if any MCP servers are connected. */
  hasConnectedServers(): boolean {
    return [...this.entries.values()].some((e) => e.status === 'connected')
  }

  /**
   * Ensure all enabled MCP servers are connected.
   * Called before preface/agent creation to make MCP tools discoverable.
   * Skips servers already connected or connecting.
   */
  async ensureEnabledServersConnected(projectRoot?: string): Promise<void> {
    // Lazy import to avoid circular dependency
    const { getEnabledMcpServers } = await import('@/services/mcpConfigService')
    const servers = getEnabledMcpServers(projectRoot)
    if (servers.length === 0) return

    const promises = servers.map((config) => {
      const existing = this.entries.get(config.id)
      if (existing?.status === 'connected' || existing?.connectPromise) return
      return this.connect(config).catch((err) => {
        logger.warn({ serverId: config.id, error: String(err) }, '[mcp-manager] Auto-connect failed')
      })
    })

    await Promise.allSettled(promises.filter(Boolean))
  }

  // -----------------------------------------------------------------------
  // Connection logic
  // -----------------------------------------------------------------------

  private async doConnect(entry: MCPClientEntry): Promise<void> {
    const { config } = entry

    // Check connection limit
    const connectedCount = [...this.entries.values()].filter(
      (e) => e.status === 'connected',
    ).length
    if (connectedCount >= MAX_CONCURRENT_CONNECTIONS) {
      entry.status = 'error'
      entry.error = `Max concurrent MCP connections (${MAX_CONCURRENT_CONNECTIONS}) reached`
      logger.warn({ serverId: config.id }, entry.error)
      return
    }

    try {
      logger.info(
        { serverId: config.id, name: config.name, transport: config.transport },
        '[mcp-manager] Connecting to MCP server',
      )

      const transport = this.createTransport(config)
      const client = await createMCPClient({ transport })

      entry.client = client
      entry.status = 'connected'
      entry.error = undefined

      // Discover and register tools
      const tools = await client.tools()
      const toolIds: string[] = []

      for (const [toolName, toolInstance] of Object.entries(tools)) {
        const toolId = `mcp__${config.name}__${toolName}`
        toolIds.push(toolId)

        // Register in toolRegistry
        registerMcpTool(toolId, toolInstance)

        // Register in toolCatalog for keyword search
        const description = (toolInstance as any).description ?? ''
        registerMcpCatalogEntry({
          id: toolId,
          label: `[${config.name}] ${toolName}`,
          description,
          keywords: [
            'mcp',
            config.name.toLowerCase(),
            ...extractKeywordsFromDescription(description),
          ],
          group: `mcp-${config.name}`,
        })
      }

      entry.toolIds = toolIds
      logger.info(
        { serverId: config.id, toolCount: toolIds.length },
        '[mcp-manager] MCP server connected, tools registered',
      )
    } catch (err) {
      entry.status = 'error'
      entry.error = err instanceof Error ? err.message : String(err)
      logger.error(
        { serverId: config.id, error: entry.error },
        '[mcp-manager] Failed to connect to MCP server',
      )
    }
  }

  private async doDisconnect(entry: MCPClientEntry): Promise<void> {
    const { config, client } = entry

    // Unregister tools
    unregisterMcpToolsByServer(config.name)
    unregisterMcpCatalogEntriesByServer(config.name)

    // Close client
    if (client) {
      try {
        await client.close()
      } catch (err) {
        logger.warn(
          { serverId: config.id, error: String(err) },
          '[mcp-manager] Error closing MCP client',
        )
      }
    }

    entry.client = null
    entry.status = 'disconnected'
    entry.toolIds = []
    entry.error = undefined

    logger.info(
      { serverId: config.id, name: config.name },
      '[mcp-manager] MCP server disconnected',
    )
  }

  // -----------------------------------------------------------------------
  // Transport factory
  // -----------------------------------------------------------------------

  private createTransport(config: MCPServerConfig) {
    switch (config.transport) {
      case 'stdio':
        if (!config.command) {
          throw new Error(`MCP server "${config.name}": stdio transport requires 'command'`)
        }
        return new Experimental_StdioMCPTransport({
          command: config.command,
          args: config.args,
          env: {
            ...process.env,
            ...(config.env ?? {}),
          } as Record<string, string>,
          cwd: config.cwd,
        })

      case 'http':
        if (!config.url) {
          throw new Error(`MCP server "${config.name}": http transport requires 'url'`)
        }
        return {
          type: 'http' as const,
          url: config.url,
          headers: config.headers,
        }

      case 'sse':
        if (!config.url) {
          throw new Error(`MCP server "${config.name}": sse transport requires 'url'`)
        }
        return {
          type: 'sse' as const,
          url: config.url,
          headers: config.headers,
        }

      default:
        throw new Error(`MCP server "${config.name}": unknown transport "${config.transport}"`)
    }
  }

  // -----------------------------------------------------------------------
  // Idle cleanup
  // -----------------------------------------------------------------------

  private startCleanupSweep(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now()
      for (const [id, entry] of this.entries) {
        if (
          entry.status === 'connected' &&
          now - entry.lastUsedAt > IDLE_TIMEOUT_MS
        ) {
          logger.info(
            { serverId: id, name: entry.config.name },
            '[mcp-manager] Disconnecting idle MCP server',
          )
          void this.doDisconnect(entry).then(() => this.entries.delete(id))
        }
      }
    }, CLEANUP_INTERVAL_MS)
  }

  private stopCleanupSweep(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

/** Global MCP Client Manager singleton. */
export const mcpClientManager = new MCPClientManagerImpl()
