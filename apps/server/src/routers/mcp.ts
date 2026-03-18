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
 * MCP Router Implementation
 *
 * tRPC endpoints for managing MCP server configurations and connections.
 */

import {
  BaseMcpRouter,
  mcpSchemas,
  t,
  shieldedProcedure,
} from '@openloaf/api'
import {
  getMcpServers,
  getMcpServerById,
  addMcpServer,
  updateMcpServer,
  removeMcpServer,
  setMcpServerEnabled,
  trustMcpServer,
} from '@/services/mcpConfigService'
import { mcpClientManager } from '@/ai/services/mcpClientManager'
import { logger } from '@/common/logger'

class McpRouterImpl extends BaseMcpRouter {
  public static override createRouter() {
    return t.router({
      getMcpServers: shieldedProcedure
        .input(mcpSchemas.getMcpServers.input)
        .output(mcpSchemas.getMcpServers.output)
        .query(async ({ input }) => {
          return getMcpServers(input.projectRoot)
        }),

      addMcpServer: shieldedProcedure
        .input(mcpSchemas.addMcpServer.input)
        .output(mcpSchemas.addMcpServer.output)
        .mutation(async ({ input }) => {
          const server = addMcpServer(input)
          // Auto-connect if enabled
          if (server.enabled) {
            mcpClientManager.connect(server).catch((err) => {
              logger.warn({ id: server.id, error: String(err) }, '[mcp-router] Auto-connect failed')
            })
          }
          return server
        }),

      updateMcpServer: shieldedProcedure
        .input(mcpSchemas.updateMcpServer.input)
        .output(mcpSchemas.updateMcpServer.output)
        .mutation(async ({ input }) => {
          const { projectRoot, ...updateData } = input
          const result = updateMcpServer(updateData, projectRoot)
          if (result) {
            // Reconnect if config changed
            await mcpClientManager.disconnect(result.id)
            if (result.enabled) {
              mcpClientManager.connect(result).catch((err) => {
                logger.warn({ id: result.id, error: String(err) }, '[mcp-router] Reconnect failed')
              })
            }
          }
          return { ok: result !== null, server: result }
        }),

      removeMcpServer: shieldedProcedure
        .input(mcpSchemas.removeMcpServer.input)
        .output(mcpSchemas.removeMcpServer.output)
        .mutation(async ({ input }) => {
          // Disconnect first
          await mcpClientManager.disconnect(input.id)
          const ok = removeMcpServer(input.id, input.projectRoot)
          return { ok }
        }),

      setMcpServerEnabled: shieldedProcedure
        .input(mcpSchemas.setMcpServerEnabled.input)
        .output(mcpSchemas.setMcpServerEnabled.output)
        .mutation(async ({ input }) => {
          const ok = setMcpServerEnabled(input.id, input.enabled, input.projectRoot)
          if (ok) {
            if (input.enabled) {
              const server = getMcpServerById(input.id, input.projectRoot)
              if (server) {
                mcpClientManager.connect(server).catch((err) => {
                  logger.warn({ id: input.id, error: String(err) }, '[mcp-router] Connect failed')
                })
              }
            } else {
              await mcpClientManager.disconnect(input.id)
            }
          }
          return { ok }
        }),

      testMcpConnection: shieldedProcedure
        .input(mcpSchemas.testMcpConnection.input)
        .output(mcpSchemas.testMcpConnection.output)
        .mutation(async ({ input }) => {
          const server = getMcpServerById(input.id, input.projectRoot)
          if (!server) {
            return { ok: false, toolCount: 0, toolIds: [], error: 'Server not found' }
          }
          try {
            const toolIds = await mcpClientManager.connect(server)
            return { ok: true, toolCount: toolIds.length, toolIds }
          } catch (err) {
            return {
              ok: false,
              toolCount: 0,
              toolIds: [],
              error: err instanceof Error ? err.message : String(err),
            }
          }
        }),

      getMcpServerStatus: shieldedProcedure
        .output(mcpSchemas.getMcpServerStatus.output)
        .query(async () => {
          return mcpClientManager.getServerInfos()
        }),

      trustMcpServer: shieldedProcedure
        .input(mcpSchemas.trustMcpServer.input)
        .output(mcpSchemas.trustMcpServer.output)
        .mutation(async ({ input }) => {
          const ok = trustMcpServer(input.id, input.projectRoot)
          return { ok }
        }),
    })
  }
}

export const mcpRouterImplementation = McpRouterImpl.createRouter()
