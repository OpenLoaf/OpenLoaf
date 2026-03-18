/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// MCP Server Configuration Types
// ---------------------------------------------------------------------------

/** Transport types supported by MCP. */
export const mcpTransportSchema = z.enum(['stdio', 'http', 'sse'])
export type MCPTransport = z.infer<typeof mcpTransportSchema>

/** MCP server configuration stored in mcp-servers.json. */
export const mcpServerConfigSchema = z.object({
  /** Unique identifier (nanoid). */
  id: z.string(),
  /** Display name. */
  name: z.string().min(1),
  /** Optional description. */
  description: z.string().optional(),
  /** Transport type. */
  transport: mcpTransportSchema,

  // stdio transport
  /** Command to spawn (e.g. 'npx', 'node', 'uvx'). */
  command: z.string().optional(),
  /** Command arguments. */
  args: z.array(z.string()).optional(),
  /** Environment variables for the child process. */
  env: z.record(z.string(), z.string()).optional(),
  /** Working directory for the child process. */
  cwd: z.string().optional(),

  // http / sse transport
  /** Server URL (e.g. 'http://localhost:3000/mcp'). */
  url: z.string().optional(),
  /** HTTP headers (e.g. Authorization). */
  headers: z.record(z.string(), z.string()).optional(),

  /** Whether this server is enabled. */
  enabled: z.boolean().default(true),
  /** Configuration scope. */
  scope: z.enum(['global', 'project']),
  /** Project ID (for project-scoped configs). */
  projectId: z.string().optional(),

  /** Whether this config has been explicitly trusted by the user. */
  trusted: z.boolean().default(false),
  /** Hash of the config content for change detection. */
  configHash: z.string().optional(),

  /** Custom timeout for tool execution in milliseconds (default: 60000). */
  timeout: z.number().int().positive().optional(),
})

export type MCPServerConfig = z.infer<typeof mcpServerConfigSchema>

/** Input for adding a new MCP server. */
export const addMcpServerInputSchema = mcpServerConfigSchema.omit({
  id: true,
  trusted: true,
  configHash: true,
})

export type AddMCPServerInput = z.infer<typeof addMcpServerInputSchema>

/** Input for updating an existing MCP server. */
export const updateMcpServerInputSchema = mcpServerConfigSchema
  .partial()
  .required({ id: true })

export type UpdateMCPServerInput = z.infer<typeof updateMcpServerInputSchema>

// ---------------------------------------------------------------------------
// MCP Server Status (runtime)
// ---------------------------------------------------------------------------

export type MCPServerStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

export type MCPServerInfo = {
  config: MCPServerConfig
  status: MCPServerStatus
  /** Number of tools discovered from this server. */
  toolCount: number
  /** Tool IDs discovered from this server. */
  toolIds: string[]
  /** Last successful connection time. */
  lastConnectedAt?: string
  /** Error message if status is 'error'. */
  error?: string
  /** PID of the stdio child process (if applicable). */
  pid?: number
}

// ---------------------------------------------------------------------------
// MCP Config File Schema
// ---------------------------------------------------------------------------

export const mcpConfigFileSchema = z.object({
  /** Schema version for future migration. */
  version: z.number().int().default(1),
  /** List of MCP server configurations. */
  servers: z.array(mcpServerConfigSchema).default([]),
})

export type MCPConfigFile = z.infer<typeof mcpConfigFileSchema>
