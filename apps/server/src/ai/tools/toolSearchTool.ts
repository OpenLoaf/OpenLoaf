/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import { tool, zodSchema } from 'ai'
import { toolSearchToolDef } from '@openloaf/api/types/tools/toolSearch'
import {
  TOOL_CATALOG_EXTENDED,
  getMcpCatalogEntries,
  type ToolCatalogExtendedItem,
} from '@openloaf/api/types/tools/toolCatalog'
import { enhanceCloudNamedToolDescription } from '@/ai/tools/cloud/cloudNamedTools'
import { resolveMcpBundle, ensureBundleConnected } from '@/ai/integrations/mcpBundle'
import { buildToolset } from '@/ai/tools/toolRegistry'
import type { ActivatedToolSet } from './toolSearchState'

/** Schema resolver function type — maps tool IDs to their JSON schemas. */
export type SchemaResolver = (toolIds: string[]) => Record<string, object>

/**
 * Optional post-processor for the description ToolSearch returns for each
 * loaded tool. Used by channel agents to swap the base description (which
 * may assume chat-UI inline rendering) for a channel-accurate version without
 * mutating the shared TOOL_CATALOG_EXTENDED.
 *
 * Called AFTER `enhanceCloudNamedToolDescription`, so rewriters receive the
 * cloud-variant-enriched text. Return the (possibly) rewritten string.
 */
export type DescriptionRewriter = (toolId: string, description: string) => string

/** Merge native static catalog with dynamic MCP catalog. */
function getCombinedCatalog(): ToolCatalogExtendedItem[] {
  const mcpEntries = getMcpCatalogEntries()
  return mcpEntries.length > 0
    ? [...TOOL_CATALOG_EXTENDED, ...mcpEntries]
    : TOOL_CATALOG_EXTENDED
}

/**
 * Allow dynamic access to the available tool pool so late-registered MCP
 * tools (e.g. Notion after lazy OAuth connect inside ToolSearch) become
 * visible to the same execute call that registered them. Passing a getter
 * lets each execute re-read the current pool instead of using a snapshot
 * taken at agent-creation time.
 */
export type AvailableToolIdsSource =
  | ReadonlySet<string>
  | (() => ReadonlySet<string>)

/**
 * Optional sink so ToolSearch can splice newly-connected MCP tools into the
 * live agent toolset (`tools` dict + `allToolIds` list). Without this, a
 * lazy connect inside ToolSearch would register tools in MCP_TOOL_REGISTRY
 * but they'd never reach AI SDK's tools dict / prepareStep allowlist for
 * the remaining steps.
 */
export interface LiveToolsetSink {
  /** Mutable tools dict passed to ToolLoopAgent — late MCP tools are merged here. */
  tools: Record<string, any>
  /** Mutable allToolIds list referenced by prepareStep — late MCP IDs appended here. */
  allToolIds: string[]
}

export function createToolSearchTool(
  activatedSet: ActivatedToolSet,
  availableToolIds: AvailableToolIdsSource,
  getSchemas?: SchemaResolver,
  describeOverride?: DescriptionRewriter,
  liveSink?: LiveToolsetSink,
) {
  const resolveAvailableIds = (): ReadonlySet<string> =>
    typeof availableToolIds === 'function' ? availableToolIds() : availableToolIds
  return tool({
    description: toolSearchToolDef.description,
    inputSchema: zodSchema(toolSearchToolDef.parameters),
    execute: async ({ names }) => {
      const requestedNames = names
        .split(',')
        .map((s) => s.trim().replace(/^select:/i, '').trim())
        .filter(Boolean)

      const catalog = getCombinedCatalog()
      let currentAvailableIds = resolveAvailableIds()
      // Case-insensitive lookup: lowercased id → canonical id. Rebuilt after
      // lazy MCP connects so newly-registered tool IDs participate in fuzzy
      // matching for subsequent names within the same call.
      let lowerIdIndex = new Map<string, string>()
      const rebuildLowerIndex = () => {
        lowerIdIndex = new Map<string, string>()
        for (const id of currentAvailableIds) lowerIdIndex.set(id.toLowerCase(), id)
      }
      rebuildLowerIndex()

      const resolveName = (raw: string): string | null => {
        if (currentAvailableIds.has(raw)) return raw
        const lower = raw.toLowerCase()
        const ci = lowerIdIndex.get(lower)
        if (ci) return ci
        // Substring fuzzy fallback — unique match only, to avoid ambiguity.
        const matches: string[] = []
        for (const [lid, cid] of lowerIdIndex) {
          if (lid.includes(lower) || lower.includes(lid)) matches.push(cid)
        }
        return matches.length === 1 ? (matches[0] ?? null) : null
      }

      const loadedTools: { id: string; name: string; description: string }[] = []
      const notFound: string[] = []
      const bundleErrors: { bundleName: string; error: string }[] = []
      const loadedBundles: { bundleName: string; toolCount: number }[] = []
      const seen = new Set<string>()

      /**
       * Splice newly-registered MCP tool IDs into the live agent toolset so
       * the next prepareStep / stream iteration can include them. Without
       * this, the late-connected tool sits in MCP_TOOL_REGISTRY but never
       * reaches AI SDK because `allToolIds` / `tools` were frozen at agent
       * creation.
       */
      const spliceNewMcpTools = (newIds: string[]) => {
        if (!liveSink || newIds.length === 0) return
        const fresh = newIds.filter((id) => !liveSink.allToolIds.includes(id))
        if (fresh.length === 0) return
        const newToolset = buildToolset(fresh)
        Object.assign(liveSink.tools, newToolset)
        for (const id of fresh) liveSink.allToolIds.push(id)
        // Refresh our local view so resolveName / loadToolId see the new IDs.
        currentAvailableIds = resolveAvailableIds()
        rebuildLowerIndex()
      }

      const loadToolId = (id: string) => {
        if (seen.has(id)) return
        seen.add(id)
        if (!currentAvailableIds.has(id)) return
        activatedSet.activate([id])
        const entry = catalog.find((e) => e.id === id)
        const enhanced = enhanceCloudNamedToolDescription(
          id,
          entry?.description ?? '',
        )
        const finalDesc = describeOverride ? describeOverride(id, enhanced) : enhanced
        loadedTools.push({
          id,
          name: entry?.label ?? id,
          description: finalDesc,
        })
      }

      for (const name of requestedNames) {
        // Bundle resolution first — a deferred-load MCP integration (e.g. Notion)
        // advertises only its bundle name in the preface; matching here pulls
        // every tool of that MCP server into the active set in one call.
        const bundle = resolveMcpBundle(name)
        if (bundle) {
          const result = await ensureBundleConnected(bundle)
          if (result.connected && result.bundle.toolIds.length > 0) {
            // Inject the newly-registered tool IDs into the live agent
            // toolset (tools dict + allToolIds) so subsequent steps can
            // actually invoke them, then activate them for the model.
            spliceNewMcpTools(result.bundle.toolIds)
            for (const id of result.bundle.toolIds) loadToolId(id)
            loadedBundles.push({
              bundleName: result.bundle.bundleName,
              toolCount: result.bundle.toolIds.length,
            })
            continue
          }
          // Connection failed or timed out — surface actionable error back
          // to the model so it can report to the user.
          bundleErrors.push({
            bundleName: result.bundle.bundleName,
            error: result.error ?? 'Unknown MCP connection failure',
          })
          continue
        }
        const resolved = resolveName(name)
        if (resolved) {
          loadToolId(resolved)
          continue
        }
        notFound.push(name)
      }

      const schemas = getSchemas ? getSchemas(loadedTools.map((t) => t.id)) : {}

      const parts: string[] = []
      if (loadedBundles.length > 0) {
        const summary = loadedBundles
          .map((b) => `${b.bundleName} (${b.toolCount} tools)`)
          .join(', ')
        parts.push(`Loaded MCP bundle(s): ${summary}`)
      }
      if (loadedTools.length > 0) {
        parts.push(`Loaded ${loadedTools.length} tool(s): ${loadedTools.map((t) => t.id).join(', ')}`)
      }
      if (bundleErrors.length > 0) {
        const summary = bundleErrors
          .map((b) => `${b.bundleName}: ${b.error}`)
          .join(' | ')
        parts.push(`MCP bundle connect failed: ${summary}`)
      }
      if (notFound.length > 0) {
        parts.push(
          `Not found: ${notFound.join(', ')}. If you were trying to load a skill, call the Skill tool directly with the skill name instead.`,
        )
      }

      return {
        tools: loadedTools.map((t) => ({
          ...t,
          ...(schemas[t.id] ? { parameters: schemas[t.id] } : {}),
        })),
        bundles: loadedBundles,
        bundleErrors,
        notFound,
        message: parts.length > 0 ? parts.join('. ') + '.' : 'No matching tools found.',
      }
    },
  })
}
