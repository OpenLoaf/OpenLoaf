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
    })
  }
}

export const integrationsRouter = BaseIntegrationsRouter.createRouter()
export type IntegrationsRouter = typeof integrationsRouter
