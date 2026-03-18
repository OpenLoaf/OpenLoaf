/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
import path from 'node:path'
import { tool, zodSchema } from 'ai'
import { toolSearchToolDef } from '@openloaf/api/types/tools/toolSearch'
import {
  TOOL_CATALOG_EXTENDED,
  getMcpCatalogEntries,
  type ToolCatalogExtendedItem,
} from '@openloaf/api/types/tools/toolCatalog'
import type { ActivatedToolSet } from './toolSearchState'
import { SkillSelector } from '@/ai/tools/SkillSelector'
import { getProjectId } from '@/ai/shared/context/requestContext'
import { getProjectRootPath } from '@openloaf/api/services/vfsService'
import { getOpenLoafRootDir } from '@openloaf/config'
import { resolveParentProjectRootPaths } from '@/ai/shared/util'

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
      const loadedSkills: { name: string; scope: string; basePath: string; content: string }[] = []
      const notFound: string[] = []

      // Collect tool IDs auto-activated by skills (for schema resolution)
      const autoActivatedToolIds: string[] = []

      for (const name of requestedNames) {
        // 1. Try as tool ID
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

        // 2. Try as skill name
        const skill = await resolveSkill(name)
        if (skill) {
          loadedSkills.push(skill)
          // Auto-activate tools declared by the skill
          if (skill.tools && skill.tools.length > 0) {
            const validToolIds = skill.tools.filter((id) => availableToolIds.has(id))
            activatedSet.activate(validToolIds)
            for (const id of validToolIds) {
              // Avoid duplicates if tool was already explicitly loaded
              if (!loadedTools.some((t) => t.id === id)) {
                const entry = catalog.find((e) => e.id === id)
                loadedTools.push({
                  id,
                  name: entry?.label ?? id,
                  description: entry?.description ?? '',
                })
                autoActivatedToolIds.push(id)
              }
            }
          }
          continue
        }

        notFound.push(name)
      }

      // Resolve parameter schemas for all loaded tools (explicit + auto-activated)
      const schemas = getSchemas ? getSchemas(loadedTools.map((t) => t.id)) : {}

      const parts: string[] = []
      if (loadedTools.length > 0) {
        parts.push(`Loaded ${loadedTools.length} tool(s): ${loadedTools.map((t) => t.id).join(', ')}`)
      }
      if (loadedSkills.length > 0) {
        parts.push(`Loaded ${loadedSkills.length} skill(s): ${loadedSkills.map((s) => s.name).join(', ')}`)
      }
      if (notFound.length > 0) {
        parts.push(`Not found: ${notFound.join(', ')}`)
      }

      return {
        tools: loadedTools.map((t) => ({
          ...t,
          ...(schemas[t.id] ? { parameters: schemas[t.id] } : {}),
        })),
        skills: loadedSkills,
        notFound,
        message: parts.length > 0 ? parts.join('. ') + '.' : 'No matching tools or skills found.',
      }
    },
  })
}

/** Resolve a skill by name, returning its content, metadata, and declared tool dependencies. */
async function resolveSkill(
  skillName: string,
): Promise<{ name: string; scope: string; basePath: string; content: string; tools?: string[] } | null> {
  try {
    const projectId = getProjectId()
    const projectRoot = projectId ? getProjectRootPath(projectId) ?? undefined : undefined
    const globalRoot = getOpenLoafRootDir()
    const parentRoots = await resolveParentProjectRootPaths(projectId)

    const match = await SkillSelector.resolveSkillByName(skillName, {
      projectRoot,
      parentRoots,
      globalRoot,
    })

    if (!match) return null

    const basePath = path.dirname(match.path)
    return {
      name: match.name,
      scope: match.scope,
      basePath,
      content: match.content,
      tools: match.tools,
    }
  } catch {
    return null
  }
}
