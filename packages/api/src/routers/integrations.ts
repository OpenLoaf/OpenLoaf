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
import { t, shieldedProcedure } from '../../generated/routers/helpers/createRouter'
import { integrationDefinitionSchema } from '../types/integrations'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const integrationSchemas = {
  listIntegrations: {
    output: z.array(integrationDefinitionSchema),
  },
  installIntegration: {
    input: z.object({
      integrationId: z.string(),
      credentials: z.record(z.string(), z.string()),
    }),
    output: z.object({
      ok: z.boolean(),
      mcpServerId: z.string(),
    }),
  },
  uninstallIntegration: {
    input: z.object({
      integrationId: z.string(),
    }),
    output: z.object({
      ok: z.boolean(),
    }),
  },
  beginOAuthIntegrationInstall: {
    input: z.object({
      integrationId: z.string(),
      serverOrigin: z.string().url(),
    }),
    output: z.object({
      ok: z.boolean(),
      completed: z.boolean(),
      mcpServerId: z.string().optional(),
      authorizationUrl: z.string().url().optional(),
      /** OAuth `state` — pass to pollOAuthIntegrationInstall to watch progress. */
      state: z.string().optional(),
    }),
  },
  pollOAuthIntegrationInstall: {
    input: z.object({
      state: z.string(),
    }),
    output: z.object({
      status: z.enum(['pending', 'completed', 'error', 'expired']),
      mcpServerId: z.string().optional(),
      error: z.string().optional(),
    }),
  },
  cancelOAuthIntegrationInstall: {
    input: z.object({
      state: z.string(),
    }),
    output: z.object({
      ok: z.boolean(),
    }),
  },
  getIntegrationIdentity: {
    input: z.object({
      integrationId: z.string(),
    }),
    output: z.object({
      identity: z
        .object({
          workspaceName: z.string().optional(),
          workspaceId: z.string().optional(),
          botName: z.string().optional(),
          botAvatarUrl: z.string().optional(),
          ownerType: z.string().optional(),
          ownerName: z.string().optional(),
          ownerEmail: z.string().optional(),
          accessiblePages: z
            .array(
              z.object({
                id: z.string(),
                title: z.string(),
                type: z.string().optional(),
                timestamp: z.string().optional(),
              }),
            )
            .optional(),
          fetchedAt: z.number(),
        })
        .nullable(),
    }),
  },
}

// ---------------------------------------------------------------------------
// Base Router (abstract, implemented in server)
// ---------------------------------------------------------------------------

export abstract class BaseIntegrationsRouter {
  public static routeName = 'integrations'

  public static createRouter() {
    return t.router({
      listIntegrations: shieldedProcedure
        .output(integrationSchemas.listIntegrations.output)
        .query(async () => {
          throw new Error('Not implemented in base class')
        }),

      installIntegration: shieldedProcedure
        .input(integrationSchemas.installIntegration.input)
        .output(integrationSchemas.installIntegration.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),

      uninstallIntegration: shieldedProcedure
        .input(integrationSchemas.uninstallIntegration.input)
        .output(integrationSchemas.uninstallIntegration.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),

      beginOAuthIntegrationInstall: shieldedProcedure
        .input(integrationSchemas.beginOAuthIntegrationInstall.input)
        .output(integrationSchemas.beginOAuthIntegrationInstall.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),

      pollOAuthIntegrationInstall: shieldedProcedure
        .input(integrationSchemas.pollOAuthIntegrationInstall.input)
        .output(integrationSchemas.pollOAuthIntegrationInstall.output)
        .query(async () => {
          throw new Error('Not implemented in base class')
        }),

      cancelOAuthIntegrationInstall: shieldedProcedure
        .input(integrationSchemas.cancelOAuthIntegrationInstall.input)
        .output(integrationSchemas.cancelOAuthIntegrationInstall.output)
        .mutation(async () => {
          throw new Error('Not implemented in base class')
        }),

      getIntegrationIdentity: shieldedProcedure
        .input(integrationSchemas.getIntegrationIdentity.input)
        .output(integrationSchemas.getIntegrationIdentity.output)
        .query(async () => {
          throw new Error('Not implemented in base class')
        }),
    })
  }
}

export const integrationsRouter = BaseIntegrationsRouter.createRouter()
export type IntegrationsRouter = typeof integrationsRouter
