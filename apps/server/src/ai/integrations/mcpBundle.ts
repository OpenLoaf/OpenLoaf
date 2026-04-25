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
 * MCP bundle resolution.
 *
 * Deferred-load integrations (e.g. Notion) expose a single bundle name in the
 * system prompt instead of listing every individual MCP tool. This module
 * maps that bundle name back to the set of live MCP tool IDs so ToolSearch
 * can activate them all in one call.
 *
 * The bundle identity lives in INTEGRATION_REGISTRY; the live tool IDs live
 * in MCP_TOOL_REGISTRY. Both are in-memory and update as users install /
 * connect integrations, so resolution is always cheap.
 */

import { getMcpToolIds } from '@/ai/tools/toolRegistry'
import { getEnabledMcpServers } from '@/services/mcpConfigService'
import { mcpClientManager } from '@/ai/services/mcpClientManager'
import { logger } from '@/common/logger'
import {
  INTEGRATION_REGISTRY,
  getIntegrationBundleName,
  getIntegrationMcpServerName,
  type ServerIntegrationDefinition,
} from './registry'

export interface McpBundleMatch {
  /** Integration that owns this bundle. */
  integration: ServerIntegrationDefinition
  /** Live MCP tool IDs currently registered for the bundle's server. */
  toolIds: string[]
  /** Friendly server name (e.g. `Notion`). */
  serverName: string
  /** Bundle name as advertised in the preface (e.g. `notion-mcp`). */
  bundleName: string
}

/** List every deferred-load integration currently registered. */
export function listDeferredIntegrations(): ServerIntegrationDefinition[] {
  return INTEGRATION_REGISTRY.filter((entry) => entry.deferredLoad === true)
}

/**
 * Resolve a ToolSearch query to a deferred-load bundle.
 *
 * Matches by bundle name (exact + case-insensitive) OR by the integration id
 * itself so the model can loosely refer to it as "notion" and still hit.
 * Returns null when the name doesn't map to any deferred integration — the
 * caller falls back to per-tool resolution.
 */
export function resolveMcpBundle(rawName: string): McpBundleMatch | null {
  const needle = rawName.trim().toLowerCase()
  if (!needle) return null
  const integration = listDeferredIntegrations().find((entry) => {
    const bundleName = getIntegrationBundleName(entry).toLowerCase()
    return bundleName === needle || entry.id.toLowerCase() === needle
  })
  if (!integration) return null
  const serverName = getIntegrationMcpServerName(integration)
  const prefix = `mcp__${serverName}__`
  const toolIds = getMcpToolIds().filter((id) => id.startsWith(prefix))
  return {
    integration,
    serverName,
    bundleName: getIntegrationBundleName(integration),
    toolIds,
  }
}

export interface EnsureBundleConnectedResult {
  /** Fresh bundle match snapshot after the connect attempt. */
  bundle: McpBundleMatch
  /** Whether the underlying MCP server is now connected. */
  connected: boolean
  /** When connected is false: human-readable reason surfaced back to the model. */
  error?: string
}

/**
 * Connect-on-demand for a deferred-load bundle.
 *
 * Called from inside ToolSearch when the model asks for a bundle name and
 * the corresponding MCP server hasn't registered any tools yet (typical
 * first-use case: user has Notion configured but we've skipped the eager
 * connect or the previous attempt failed). Looks up the matching entry in
 * mcp-servers.json, triggers `mcpClientManager.connect()` and races it
 * against a timeout so the tool call never hangs indefinitely.
 *
 * Returns the re-resolved bundle plus a connection verdict so the caller
 * can surface an actionable error to the LLM when OAuth is expired or the
 * transport is unreachable.
 */
export async function ensureBundleConnected(
  bundle: McpBundleMatch,
  timeoutMs: number = 20_000,
  projectRoot?: string,
): Promise<EnsureBundleConnectedResult> {
  if (bundle.toolIds.length > 0) {
    return { bundle, connected: true }
  }
  let serverConfig: ReturnType<typeof getEnabledMcpServers>[number] | undefined
  try {
    serverConfig = getEnabledMcpServers(projectRoot).find((s) => s.name === bundle.serverName)
  } catch (err) {
    return {
      bundle,
      connected: false,
      error: `Failed to read MCP config: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
  if (!serverConfig) {
    return {
      bundle,
      connected: false,
      error: `MCP server "${bundle.serverName}" is not configured (expected in mcp-servers.json)`,
    }
  }
  let timeoutHandle: NodeJS.Timeout | undefined
  let connectError: unknown
  const connectPromise = mcpClientManager.connect(serverConfig).catch((err) => {
    connectError = err
  })
  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    timeoutHandle = setTimeout(() => resolve('timeout'), timeoutMs)
  })
  const outcome = await Promise.race([connectPromise.then(() => 'done' as const), timeoutPromise])
  if (timeoutHandle) clearTimeout(timeoutHandle)
  const prefix = `mcp__${bundle.serverName}__`
  const refreshed: McpBundleMatch = {
    ...bundle,
    toolIds: getMcpToolIds().filter((id) => id.startsWith(prefix)),
  }
  if (refreshed.toolIds.length > 0) {
    return { bundle: refreshed, connected: true }
  }
  if (outcome === 'timeout') {
    logger.warn(
      { bundle: bundle.bundleName, serverName: bundle.serverName, timeoutMs },
      '[mcp-bundle] connect timed out',
    )
    return {
      bundle: refreshed,
      connected: false,
      error: `MCP server "${bundle.serverName}" did not connect within ${timeoutMs}ms. Ask the user to re-authorize via OpenLoaf Connections if the OAuth token has expired.`,
    }
  }
  const msg = connectError instanceof Error ? connectError.message : String(connectError ?? 'unknown error')
  return {
    bundle: refreshed,
    connected: false,
    error: `MCP server "${bundle.serverName}" failed to connect: ${msg}. Ask the user to check Connections / re-authorize.`,
  }
}
