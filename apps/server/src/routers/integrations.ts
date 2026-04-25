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
import { beginIntegrationOAuthInstall } from '@/modules/integrations/oauth/integrationOAuthService'
import {
  discardOAuthInstall,
  readOAuthInstallStatus,
} from '@/modules/integrations/oauth/oauthInstallStatusStore'
import { getIntegrationIdentity } from '@/modules/integrations/identity/integrationIdentityStore'
import { ensureIntegrationIdentityFresh } from '@/modules/integrations/identity/integrationIdentityService'
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
          // Disconnect/connect roundtrips to the remote MCP server; don't
          // block the HTTP response on them.
          const previousServerId = getIntegrationMcpServerId(input.integrationId)
          if (previousServerId) {
            void mcpClientManager.disconnect(previousServerId).catch((err) => {
              logger.warn(
                { id: previousServerId, error: String(err) },
                '[integrations-router] Background disconnect failed',
              )
            })
          }

          const result = installIntegration(input.integrationId, input.credentials)
          const server = getMcpServerById(result.mcpServerId)
          if (server?.enabled) {
            void mcpClientManager.connect(server).catch((err) => {
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
            void mcpClientManager.disconnect(previousServerId).catch((err) => {
              logger.warn(
                { id: previousServerId, error: String(err) },
                '[integrations-router] Background disconnect failed',
              )
            })
          }
          const { ok } = uninstallIntegration(input.integrationId)
          return { ok }
        }),

      beginOAuthIntegrationInstall: shieldedProcedure
        .input(integrationSchemas.beginOAuthIntegrationInstall.input)
        .output(integrationSchemas.beginOAuthIntegrationInstall.output)
        .mutation(async ({ input }) => {
          const result = await beginIntegrationOAuthInstall(
            input.integrationId,
            input.serverOrigin,
          )
          return {
            ok: true,
            completed: result.completed,
            mcpServerId: result.mcpServerId,
            authorizationUrl: result.authorizationUrl,
            state: result.state,
          }
        }),

      pollOAuthIntegrationInstall: shieldedProcedure
        .input(integrationSchemas.pollOAuthIntegrationInstall.input)
        .output(integrationSchemas.pollOAuthIntegrationInstall.output)
        .query(async ({ input }) => {
          const entry = readOAuthInstallStatus(input.state)
          if (!entry) return { status: 'expired' as const }
          if (entry.status === 'completed') {
            return { status: 'completed' as const, mcpServerId: entry.mcpServerId }
          }
          if (entry.status === 'error') {
            return { status: 'error' as const, error: entry.error }
          }
          return { status: 'pending' as const }
        }),

      cancelOAuthIntegrationInstall: shieldedProcedure
        .input(integrationSchemas.cancelOAuthIntegrationInstall.input)
        .output(integrationSchemas.cancelOAuthIntegrationInstall.output)
        .mutation(async ({ input }) => {
          discardOAuthInstall(input.state)
          return { ok: true }
        }),

      getIntegrationIdentity: shieldedProcedure
        .input(integrationSchemas.getIntegrationIdentity.input)
        .output(integrationSchemas.getIntegrationIdentity.output)
        .query(async ({ input }) => {
          // Cache miss + MCP already connected → fire-and-forget refresh so
          // the next poll (or any subsequent query) returns fresh data.
          ensureIntegrationIdentityFresh(input.integrationId)
          return { identity: getIntegrationIdentity(input.integrationId) }
        }),
    })
  }
}

export const integrationsRouterImplementation = IntegrationsRouterImpl.createRouter()
