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
 * Integration Service
 *
 * Bridges user-friendly "integrations" (Notion, Feishu, etc.) to MCP server
 * configurations. Owns an integrations.json map file that tracks which MCP
 * server belongs to which integration so uninstall can reverse the write.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { resolveOpenLoafPath } from '@openloaf/config'
import type { IntegrationDefinition } from '@openloaf/api/types/integrations'
import { INTEGRATION_REGISTRY, findIntegration } from '@/ai/integrations/registry'
import { addMcpServer, getMcpServers, removeMcpServer } from '@/services/mcpConfigService'
import { logger } from '@/common/logger'

const INTEGRATIONS_FILENAME = 'integrations.json'

interface IntegrationInstallRecord {
  mcpServerId: string
  installedAt: string
}

interface IntegrationMapFile {
  version: 1
  installs: Record<string, IntegrationInstallRecord>
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------
function getMapPath(): string {
  return resolveOpenLoafPath(INTEGRATIONS_FILENAME)
}

function readMap(): IntegrationMapFile {
  const filePath = getMapPath()
  if (!existsSync(filePath)) return { version: 1, installs: {} }
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as IntegrationMapFile
    return {
      version: 1,
      installs: raw?.installs && typeof raw.installs === 'object' ? raw.installs : {},
    }
  } catch {
    return { version: 1, installs: {} }
  }
}

function writeMap(map: IntegrationMapFile): void {
  const filePath = getMapPath()
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${Date.now()}.tmp`
  writeFileSync(tmpPath, JSON.stringify(map, null, 2), 'utf-8')
  renameSync(tmpPath, filePath)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * List all known integrations with their current install status.
 * Also verifies the referenced MCP server still exists — if the user
 * deleted it manually through the MCP settings page, we treat the
 * integration as uninstalled.
 */
export function listIntegrations(): IntegrationDefinition[] {
  const map = readMap()
  const mcpServerIds = new Set(getMcpServers().map((s) => s.id))
  let mapDirty = false

  const result: IntegrationDefinition[] = INTEGRATION_REGISTRY.map(
    ({ buildMcpConfig: _build, ...rest }) => {
      const entry = map.installs[rest.id]
      const stillInstalled = Boolean(entry && mcpServerIds.has(entry.mcpServerId))
      if (entry && !stillInstalled) {
        delete map.installs[rest.id]
        mapDirty = true
      }
      return {
        ...rest,
        installed: stillInstalled,
        mcpServerId: stillInstalled ? entry!.mcpServerId : undefined,
      }
    },
  )

  if (mapDirty) writeMap(map)
  return result
}

/** Find the MCP server id that backs a given integration (if any). */
export function getIntegrationMcpServerId(integrationId: string): string | undefined {
  const map = readMap()
  const entry = map.installs[integrationId]
  if (!entry) return undefined
  const mcpServerIds = new Set(getMcpServers().map((s) => s.id))
  return mcpServerIds.has(entry.mcpServerId) ? entry.mcpServerId : undefined
}

/**
 * Install an integration by materialising its MCP config and writing it
 * through the MCP config service. If the integration was already installed,
 * the previous MCP server is removed first (credential rotation).
 */
export function installIntegration(
  integrationId: string,
  credentials: Record<string, string>,
): { mcpServerId: string } {
  const def = findIntegration(integrationId)
  if (!def) throw new Error(`Unknown integration: ${integrationId}`)

  for (const field of def.credentials) {
    const required = field.required !== false
    if (required && !credentials[field.key]?.trim()) {
      throw new Error(`Missing required field: ${field.label}`)
    }
  }

  const map = readMap()
  const existing = map.installs[integrationId]
  if (existing) {
    removeMcpServer(existing.mcpServerId)
  }

  const mcpInput = def.buildMcpConfig(credentials)
  const server = addMcpServer(mcpInput)

  map.installs[integrationId] = {
    mcpServerId: server.id,
    installedAt: new Date().toISOString(),
  }
  writeMap(map)

  logger.info({ integrationId, mcpServerId: server.id }, '[integrations] installed')
  return { mcpServerId: server.id }
}

/**
 * Uninstall an integration by removing the backing MCP server and clearing
 * the map entry. Returns the previous MCP server id so callers can run
 * extra cleanup (e.g. disconnecting an active client).
 */
export function uninstallIntegration(
  integrationId: string,
): { ok: boolean; previousMcpServerId?: string } {
  const map = readMap()
  const entry = map.installs[integrationId]
  if (!entry) return { ok: false }

  removeMcpServer(entry.mcpServerId)
  delete map.installs[integrationId]
  writeMap(map)

  logger.info({ integrationId }, '[integrations] uninstalled')
  return { ok: true, previousMcpServerId: entry.mcpServerId }
}
