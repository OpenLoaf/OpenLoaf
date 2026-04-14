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
 * Integrations Router
 *
 * Exposes user-friendly integration management endpoints. Writes flow through
 * the MCP config service so the "advanced" MCP settings panel sees a
 * consistent view.
 */

import {
  BaseIntegrationsRouter,
  integrationSchemas,
  t,
  shieldedProcedure,
} from '@openloaf/api'
import {
  listIntegrations,
  installIntegration,
  uninstallIntegration,
  getIntegrationMcpServerId,
} from '@/services/integrationService'
import { getMcpServerById } from '@/services/mcpConfigService'
import { mcpClientManager } from '@/ai/services/mcpClientManager'
import { logger } from '@/common/logger'

class IntegrationsRouterImpl extends BaseIntegrationsRouter {
  public static override createRouter() {
    return t.router({
      listIntegrations: shieldedProcedure
        .output(integrationSchemas.listIntegrations.output)
        .query(async () => {
          return listIntegrations()
        }),

      installIntegration: shieldedProcedure
        .input(integrationSchemas.installIntegration.input)
        .output(integrationSchemas.installIntegration.output)
        .mutation(async ({ input }) => {
          // Disconnect any stale client from a prior install before we overwrite it
          const previousServerId = getIntegrationMcpServerId(input.integrationId)
          if (previousServerId) {
            await mcpClientManager.disconnect(previousServerId)
          }

          const result = installIntegration(input.integrationId, input.credentials)
          const server = getMcpServerById(result.mcpServerId)
          if (server?.enabled) {
            mcpClientManager.connect(server).catch((err) => {
              logger.warn(
                { id: server.id, error: String(err) },
                '[integrations-router] Auto-connect failed',
              )
            })
          }
          return { ok: true, mcpServerId: result.mcpServerId }
        }),

      uninstallIntegration: shieldedProcedure
        .input(integrationSchemas.uninstallIntegration.input)
        .output(integrationSchemas.uninstallIntegration.output)
        .mutation(async ({ input }) => {
          const previousServerId = getIntegrationMcpServerId(input.integrationId)
          if (previousServerId) {
            await mcpClientManager.disconnect(previousServerId)
          }
          const { ok } = uninstallIntegration(input.integrationId)
          return { ok }
        }),
    })
  }
}

export const integrationsRouterImplementation = IntegrationsRouterImpl.createRouter()
