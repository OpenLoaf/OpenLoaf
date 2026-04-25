/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import type { Hono } from 'hono'
import { logger } from '@/common/logger'
import { renderAuthCallbackPage } from '@/modules/auth/authCallbackPage'
import { completeIntegrationOAuthInstall } from './integrationOAuthService'
import {
  markOAuthInstallCompleted,
  markOAuthInstallFailed,
} from './oauthInstallStatusStore'

/** Register OAuth callback routes for MCP-backed integrations. */
export function registerIntegrationOAuthRoutes(app: Hono): void {
  app.get('/oauth/integrations/:integrationId/callback', async (c) => {
    const integrationId = c.req.param('integrationId')
    const error = c.req.query('error')
    const errorDescription = c.req.query('error_description')
    const code = c.req.query('code')
    const state = c.req.query('state')

    if (error) {
      const message = errorDescription ?? error
      logger.warn(
        { integrationId, error, errorDescription },
        '[integrations-oauth] callback received error',
      )
      markOAuthInstallFailed(state, integrationId, message)
      return c.html(
        renderAuthCallbackPage({ message: `连接失败：${message}`, status: 'error' }),
        400,
      )
    }

    if (!code) {
      const message = '缺少授权码参数。'
      markOAuthInstallFailed(state, integrationId, message)
      return c.html(
        renderAuthCallbackPage({ message: `连接失败：${message}`, status: 'error' }),
        400,
      )
    }

    try {
      const serverOrigin = new URL(c.req.url).origin
      const { mcpServerId } = await completeIntegrationOAuthInstall(
        integrationId,
        code,
        state,
        serverOrigin,
      )
      markOAuthInstallCompleted(state, integrationId, mcpServerId)
      return c.html(
        renderAuthCallbackPage({
          message: `已成功连接 ${integrationId}`,
          status: 'success',
        }),
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误'
      logger.error({ err, integrationId }, '[integrations-oauth] callback failed')
      markOAuthInstallFailed(state, integrationId, message)
      return c.html(
        renderAuthCallbackPage({ message: `连接失败：${message}`, status: 'error' }),
        500,
      )
    }
  })
}
