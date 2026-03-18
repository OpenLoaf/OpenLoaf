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
import { TOOL_CATALOG_EXTENDED } from '@openloaf/api/types/tools/toolCatalog'
import type { ActivatedToolSet } from './toolSearchState'

/** Schema resolver function type — maps tool IDs to their JSON schemas. */
export type SchemaResolver = (toolIds: string[]) => Record<string, object>

export function createToolSearchTool(
  activatedSet: ActivatedToolSet,
  availableToolIds: ReadonlySet<string>,
  getSchemas?: SchemaResolver,
) {
  return tool({
    description: toolSearchToolDef.description,
    inputSchema: zodSchema(toolSearchToolDef.parameters),
    execute: async ({ query, maxResults = 5 }) => {
      if (query.startsWith('select:')) {
        return handleDirectSelect(query.slice(7), activatedSet, availableToolIds, getSchemas)
      }
      return handleKeywordSearch(query, maxResults, activatedSet, availableToolIds, getSchemas)
    },
  })
}

function handleDirectSelect(
  idsStr: string,
  activatedSet: ActivatedToolSet,
  availableToolIds: ReadonlySet<string>,
  getSchemas?: SchemaResolver,
) {
  const requestedIds = idsStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const loaded: { id: string; name: string; description: string }[] = []
  const notFound: string[] = []

  for (const id of requestedIds) {
    if (availableToolIds.has(id)) {
      activatedSet.activate([id])
      const entry = TOOL_CATALOG_EXTENDED.find((e) => e.id === id)
      loaded.push({
        id,
        name: entry?.label ?? id,
        description: entry?.description ?? '',
      })
    } else {
      notFound.push(id)
    }
  }

  // Resolve parameter schemas for loaded tools
  const schemas = getSchemas ? getSchemas(loaded.map((t) => t.id)) : {}

  return {
    tools: loaded.map((t) => ({
      ...t,
      ...(schemas[t.id] ? { parameters: schemas[t.id] } : {}),
    })),
    notFound,
    message: loaded.length
      ? `Loaded ${loaded.length} tool(s): ${loaded.map((t) => t.id).join(', ')}. You can now call them directly.`
      : 'No matching tools found.',
  }
}

function handleKeywordSearch(
  query: string,
  maxResults: number,
  activatedSet: ActivatedToolSet,
  availableToolIds: ReadonlySet<string>,
  getSchemas?: SchemaResolver,
) {
  const queryTokens = query
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean)

  const scored = TOOL_CATALOG_EXTENDED
    .filter((e) => availableToolIds.has(e.id) && !activatedSet.isActive(e.id))
    .map((entry) => ({ entry, score: computeScore(entry, queryTokens) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)

  const matchedIds = scored.map((s) => s.entry.id)
  activatedSet.activate(matchedIds)

  // Resolve parameter schemas for matched tools
  const schemas = getSchemas ? getSchemas(matchedIds) : {}

  return {
    tools: scored.map(({ entry }) => ({
      id: entry.id,
      name: entry.label,
      description: entry.description,
      group: entry.group,
      ...(schemas[entry.id] ? { parameters: schemas[entry.id] } : {}),
    })),
    message: matchedIds.length
      ? `Loaded ${matchedIds.length} tool(s): ${matchedIds.join(', ')}. You can now call them directly.`
      : 'No matching tools found. Try different keywords.',
  }
}

function computeScore(
  entry: { id: string; keywords: string[]; group: string; label: string; description: string },
  queryTokens: string[],
): number {
  let score = 0
  for (const token of queryTokens) {
    if (entry.id === token) score += 10
    if (entry.id.includes(token)) score += 6
    if (entry.keywords.some((k) => k.includes(token))) score += 5
    if (entry.group === token) score += 4
    if (entry.label.toLowerCase().includes(token)) score += 3
    if (entry.description.toLowerCase().includes(token)) score += 1
  }
  return score
}
