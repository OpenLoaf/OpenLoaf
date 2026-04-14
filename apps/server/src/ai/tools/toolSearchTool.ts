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
import type { ActivatedToolSet } from './toolSearchState'

/** Schema resolver function type — maps tool IDs to their JSON schemas. */
export type SchemaResolver = (toolIds: string[]) => Record<string, object>

/** Merge native static catalog with dynamic MCP catalog. */
function getCombinedCatalog(): ToolCatalogExtendedItem[] {
  const mcpEntries = getMcpCatalogEntries()
  return mcpEntries.length > 0
    ? [...TOOL_CATALOG_EXTENDED, ...mcpEntries]
    : TOOL_CATALOG_EXTENDED
}

export function createToolSearchTool(
  activatedSet: ActivatedToolSet,
  availableToolIds: ReadonlySet<string>,
  getSchemas?: SchemaResolver,
) {
  return tool({
    description: toolSearchToolDef.description,
    inputSchema: zodSchema(toolSearchToolDef.parameters),
    execute: async ({ names }) => {
      const requestedNames = names
        .split(',')
        .map((s) => s.trim().replace(/^select:/i, '').trim())
        .filter(Boolean)

      const catalog = getCombinedCatalog()
      // Case-insensitive lookup: lowercased id → canonical id.
      const lowerIdIndex = new Map<string, string>()
      for (const id of availableToolIds) {
        lowerIdIndex.set(id.toLowerCase(), id)
      }

      const resolveName = (raw: string): string | null => {
        if (availableToolIds.has(raw)) return raw
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
      const seen = new Set<string>()

      for (const name of requestedNames) {
        const resolved = resolveName(name)
        if (resolved && !seen.has(resolved)) {
          seen.add(resolved)
          activatedSet.activate([resolved])
          const entry = catalog.find((e) => e.id === resolved)
          loadedTools.push({
            id: resolved,
            name: entry?.label ?? resolved,
            description: entry?.description ?? '',
          })
          continue
        }
        if (!resolved) notFound.push(name)
      }

      const schemas = getSchemas ? getSchemas(loadedTools.map((t) => t.id)) : {}

      const parts: string[] = []
      if (loadedTools.length > 0) {
        parts.push(`Loaded ${loadedTools.length} tool(s): ${loadedTools.map((t) => t.id).join(', ')}`)
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
        notFound,
        message: parts.length > 0 ? parts.join('. ') + '.' : 'No matching tools found.',
      }
    },
  })
}
