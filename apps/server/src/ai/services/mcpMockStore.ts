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
 * MCP mock store — drives ai-browser-test cases that need a "connected" MCP
 * server (e.g. Notion) without touching a real OAuth'd provider.
 *
 * Why this exists:
 * Notion Remote MCP (`https://mcp.notion.com/mcp`) requires per-user OAuth and
 * is not available in CI or dev-without-network. But the Notion integration
 * triggers a specific preface + ToolSearch path (deferred-load bundle), which
 * we still want to verify end-to-end. This module injects a handful of fake
 * tools straight into `MCP_TOOL_REGISTRY` + `toolCatalog`, keyed under a
 * real-looking server name (`Notion`) so the integration registry's existing
 * `findIntegrationByMcpServerName('Notion')` lookup returns true and the
 * deferred bundle path kicks in unchanged.
 *
 * Activation rules (same shape as macosHelperMockStore):
 *   - NODE_ENV !== 'production' auto-enables; browser-test just POSTs.
 *   - Explicit `OPENLOAF_MCP_MOCK=1` as an escape hatch for prod-like builds.
 * Production bundles ship inert.
 */
import { z } from 'zod'
import { zodSchema } from 'ai'
import { logger } from '@/common/logger'
import {
  registerMcpTool,
  unregisterMcpToolsByServer,
} from '@/ai/tools/toolRegistry'
import {
  registerMcpCatalogEntry,
  unregisterMcpCatalogEntriesByServer,
} from '@openloaf/api/types/tools/toolCatalog'

/**
 * Mock is active when:
 *   - NODE_ENV !== 'production', OR
 *   - OPENLOAF_MCP_MOCK=1
 *
 * When inactive, the route refuses all writes and the registry is untouched.
 */
export function mcpMockEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return process.env.OPENLOAF_MCP_MOCK === '1'
  }
  return true
}

/**
 * Minimal AI-SDK-compatible tool shape. The model never actually invokes
 * these in happy-path tests — the assertion is on which tool IDs show up in
 * `toolCalls`, not on their side effects. But `execute` must be callable so
 * the tool doesn't hard-fail if the model does try it.
 */
function createMockMcpTool(toolName: string, description: string) {
  // Must match the shape produced by `@ai-sdk/mcp`'s `client.tools()` —
  // AI SDK expects `inputSchema` to be the zodSchema adapter (FlexibleSchema),
  // not a raw JSON-schema-ish object. Using a plain object here yields
  // "schema is not a function" when the SDK tries to validate.
  return {
    description,
    inputSchema: zodSchema(z.object({}).passthrough()),
    execute: async (args: Record<string, unknown>) => ({
      ok: true,
      mock: true,
      tool: toolName,
      echoedArgs: args,
      note: 'This is a mocked MCP tool response for ai-browser-test.',
    }),
  }
}

/**
 * Canned presets mirror the shape of real integrations' exposed tools.
 * The Notion preset covers the handful most likely to appear in model
 * outputs for typical Notion prompts (search / fetch / create / update).
 * More can be added as test cases need them.
 */
const PRESETS: Record<string, { serverName: string; tools: Array<{ name: string; description: string }> }> = {
  notion: {
    serverName: 'Notion',
    tools: [
      {
        name: 'notion-search',
        description: 'Search pages and databases across the connected Notion workspace.',
      },
      {
        name: 'notion-fetch',
        description: 'Fetch a Notion page or database by id or URL.',
      },
      {
        name: 'notion-get-users',
        description: 'Get Notion user info including the connected workspace identity.',
      },
      {
        name: 'notion-create-pages',
        description: 'Create new pages under a parent page or database.',
      },
      {
        name: 'notion-update-page',
        description: 'Append blocks or update properties on an existing Notion page.',
      },
    ],
  },
}

export type McpMockPreset = keyof typeof PRESETS

/** Names of presets currently registered in the live MCP_TOOL_REGISTRY. */
const activePresets = new Set<McpMockPreset>()

/**
 * Register a preset's fake tools. Idempotent: re-registering the same preset
 * first unregisters the previous batch so tool counts stay consistent.
 */
export function registerMockPreset(preset: McpMockPreset): { serverName: string; toolIds: string[] } {
  if (!mcpMockEnabled()) throw new Error('mcp mock not enabled')
  const spec = PRESETS[preset]
  if (!spec) throw new Error(`unknown preset: ${preset} (available: ${Object.keys(PRESETS).join(', ')})`)
  unregisterMcpToolsByServer(spec.serverName)
  unregisterMcpCatalogEntriesByServer(spec.serverName)
  const toolIds: string[] = []
  for (const entry of spec.tools) {
    const toolId = `mcp__${spec.serverName}__${entry.name}`
    registerMcpTool(toolId, createMockMcpTool(entry.name, entry.description))
    registerMcpCatalogEntry({
      id: toolId,
      label: `[${spec.serverName}] ${entry.name}`,
      description: entry.description,
      keywords: ['mcp', spec.serverName.toLowerCase(), 'mock', ...entry.name.toLowerCase().split('-')],
      group: `mcp-${spec.serverName}`,
    })
    toolIds.push(toolId)
  }
  activePresets.add(preset)
  logger.info(
    { preset, serverName: spec.serverName, toolCount: toolIds.length },
    '[mcp-mock] preset registered',
  )
  return { serverName: spec.serverName, toolIds }
}

/** Tear down a specific preset. */
export function clearMockPreset(preset: McpMockPreset): void {
  const spec = PRESETS[preset]
  if (!spec) return
  unregisterMcpToolsByServer(spec.serverName)
  unregisterMcpCatalogEntriesByServer(spec.serverName)
  activePresets.delete(preset)
  logger.info({ preset, serverName: spec.serverName }, '[mcp-mock] preset cleared')
}

/** Tear down every preset currently registered. Useful at test teardown. */
export function clearAllMockPresets(): void {
  for (const preset of [...activePresets]) {
    clearMockPreset(preset)
  }
}

export function listAvailablePresets(): McpMockPreset[] {
  return Object.keys(PRESETS) as McpMockPreset[]
}
