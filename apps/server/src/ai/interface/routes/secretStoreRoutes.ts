/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport type { Hono } from 'hono'
import { z } from 'zod'
import { storeSecret } from '@/ai/tools/secretStore'
import { logger } from '@/common/logger'

const storeSecretSchema = z.object({
  value: z.string().min(1),
})

/** Register secret store HTTP routes. */
export function registerSecretStoreRoutes(app: Hono) {
  app.post('/ai/tools/store-secret', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ ok: false, error: 'Invalid JSON body' }, 400)
    }

    const parsed = storeSecretSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ ok: false, error: 'Invalid payload' }, 400)
    }

    const token = storeSecret(parsed.data.value)
    logger.debug('[secret-store] secret stored')
    return c.json({ ok: true, token })
  })
}
