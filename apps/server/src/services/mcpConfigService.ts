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
 * MCP Server Configuration Service
 *
 * Manages mcp-servers.json files for global and project-scoped MCP server
 * configurations. Follows the same atomic write pattern as openloafConfStore.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { nanoid } from 'nanoid'
import { createHash } from 'node:crypto'
import { resolveOpenLoafPath, resolveScopedOpenLoafPath } from '@openloaf/config'
import {
  mcpConfigFileSchema,
  type MCPServerConfig,
  type MCPConfigFile,
  type AddMCPServerInput,
  type UpdateMCPServerInput,
} from '@openloaf/api/types/mcp'
import { logger } from '@/common/logger'

// ---------------------------------------------------------------------------
// File I/O helpers (atomic write, safe read)
// ---------------------------------------------------------------------------

function writeJson(filePath: string, payload: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${Date.now()}.tmp`
  writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf-8')
  renameSync(tmpPath, filePath)
}

function readJsonSafely<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const MCP_CONFIG_FILENAME = 'mcp-servers.json'

/** Global MCP config: ~/.openloaf/mcp-servers.json */
function getGlobalConfigPath(): string {
  return resolveOpenLoafPath(MCP_CONFIG_FILENAME)
}

/** Project MCP config: {projectRoot}/.openloaf/mcp-servers.json */
function getProjectConfigPath(projectRoot: string): string {
  return resolveScopedOpenLoafPath(projectRoot, MCP_CONFIG_FILENAME)
}

// ---------------------------------------------------------------------------
// Config hash for trust verification
// ---------------------------------------------------------------------------

/** Compute a hash of the config content (excluding trust/hash fields). */
function computeConfigHash(config: MCPServerConfig): string {
  const { trusted, configHash, ...rest } = config
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex').slice(0, 16)
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

function readConfigFile(filePath: string): MCPConfigFile {
  const raw = readJsonSafely(filePath, { version: 1, servers: [] })
  try {
    return mcpConfigFileSchema.parse(raw)
  } catch {
    logger.warn({ filePath }, '[mcp-config] Invalid config file, using empty config')
    return { version: 1, servers: [] }
  }
}

function writeConfigFile(filePath: string, config: MCPConfigFile): void {
  writeJson(filePath, config)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get all MCP servers (merged global + project).
 * Project servers take precedence when names conflict.
 */
export function getMcpServers(projectRoot?: string): MCPServerConfig[] {
  const globalConfig = readConfigFile(getGlobalConfigPath())
  const globalServers = globalConfig.servers.map((s) => ({
    ...s,
    scope: 'global' as const,
  }))

  if (!projectRoot) return globalServers

  const projectConfig = readConfigFile(getProjectConfigPath(projectRoot))
  const projectServers = projectConfig.servers.map((s) => ({
    ...s,
    scope: 'project' as const,
  }))

  // Project servers take precedence (by name)
  const projectNames = new Set(projectServers.map((s) => s.name))
  const merged = [
    ...globalServers.filter((s) => !projectNames.has(s.name)),
    ...projectServers,
  ]

  return merged
}

/** Get enabled MCP servers only. */
export function getEnabledMcpServers(projectRoot?: string): MCPServerConfig[] {
  return getMcpServers(projectRoot).filter((s) => s.enabled)
}

/** Get a single MCP server by ID. */
export function getMcpServerById(
  serverId: string,
  projectRoot?: string,
): MCPServerConfig | undefined {
  return getMcpServers(projectRoot).find((s) => s.id === serverId)
}

/** Add a new MCP server. */
export function addMcpServer(input: AddMCPServerInput): MCPServerConfig {
  const id = nanoid(12)
  const config: MCPServerConfig = {
    ...input,
    id,
    trusted: input.scope === 'global', // Global configs are trusted by default
    configHash: undefined,
  }
  config.configHash = computeConfigHash(config)

  const filePath =
    config.scope === 'project' && config.projectId
      ? getProjectConfigPath(config.projectId)
      : getGlobalConfigPath()

  const file = readConfigFile(filePath)
  file.servers.push(config)
  writeConfigFile(filePath, file)

  logger.info({ id, name: config.name, scope: config.scope }, '[mcp-config] Server added')
  return config
}

/** Update an existing MCP server. */
export function updateMcpServer(input: UpdateMCPServerInput, projectRoot?: string): MCPServerConfig | null {
  // Try project config first, then global
  for (const scope of ['project', 'global'] as const) {
    const filePath =
      scope === 'project' && projectRoot
        ? getProjectConfigPath(projectRoot)
        : getGlobalConfigPath()

    const file = readConfigFile(filePath)
    const idx = file.servers.findIndex((s) => s.id === input.id)
    if (idx === -1) continue

    const existing = file.servers[idx]!
    const updated: MCPServerConfig = { ...existing, ...input }
    // Recompute hash on content change; revoke trust if hash changed
    const newHash = computeConfigHash(updated)
    if (newHash !== existing.configHash) {
      updated.configHash = newHash
      // Content changed — revoke trust for project-scoped configs
      if (updated.scope === 'project') {
        updated.trusted = false
      }
    }

    file.servers[idx] = updated
    writeConfigFile(filePath, file)
    logger.info({ id: input.id }, '[mcp-config] Server updated')
    return updated
  }

  return null
}

/** Remove an MCP server by ID. */
export function removeMcpServer(serverId: string, projectRoot?: string): boolean {
  for (const scope of ['project', 'global'] as const) {
    const filePath =
      scope === 'project' && projectRoot
        ? getProjectConfigPath(projectRoot)
        : getGlobalConfigPath()

    const file = readConfigFile(filePath)
    const idx = file.servers.findIndex((s) => s.id === serverId)
    if (idx === -1) continue

    file.servers.splice(idx, 1)
    writeConfigFile(filePath, file)
    logger.info({ id: serverId }, '[mcp-config] Server removed')
    return true
  }

  return false
}

/** Set enabled/disabled state. */
export function setMcpServerEnabled(
  serverId: string,
  enabled: boolean,
  projectRoot?: string,
): boolean {
  const result = updateMcpServer({ id: serverId, enabled }, projectRoot)
  return result !== null
}

/** Mark a project-scoped server as trusted by the user. */
export function trustMcpServer(serverId: string, projectRoot?: string): boolean {
  const server = getMcpServerById(serverId, projectRoot)
  if (!server) return false
  const result = updateMcpServer({
    id: serverId,
    trusted: true,
    configHash: computeConfigHash(server),
  }, projectRoot)
  return result !== null
}

/**
 * Check if a project-scoped server needs trust verification.
 * Returns true if the server is untrusted or its config has changed since last trust.
 */
export function needsTrustVerification(server: MCPServerConfig): boolean {
  if (server.scope === 'global') return false
  if (!server.trusted) return true
  const currentHash = computeConfigHash(server)
  return currentHash !== server.configHash
}
