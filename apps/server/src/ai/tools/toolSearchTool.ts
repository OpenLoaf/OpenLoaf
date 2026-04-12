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
        .map((s) => s.trim())
        .filter(Boolean)

      const catalog = getCombinedCatalog()
      const loadedTools: { id: string; name: string; description: string }[] = []
      const notFound: string[] = []

      for (const name of requestedNames) {
        if (availableToolIds.has(name)) {
          activatedSet.activate([name])
          const entry = catalog.find((e) => e.id === name)
          loadedTools.push({
            id: name,
            name: entry?.label ?? name,
            description: entry?.description ?? '',
          })
          continue
        }
        notFound.push(name)
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
