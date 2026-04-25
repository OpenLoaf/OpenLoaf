/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { auth } from '@ai-sdk/mcp'
import type { ServerIntegrationDefinition } from '@/ai/integrations/registry'
import { findIntegration } from '@/ai/integrations/registry'
import { mcpClientManager } from '@/ai/services/mcpClientManager'
import { logger } from '@/common/logger'
import { getMcpServerById } from '@/services/mcpConfigService'
import {
  getIntegrationMcpServerId,
  installIntegration,
} from '@/services/integrationService'
import { createIntegrationOAuthClientProvider } from './integrationOAuthProvider'
import {
  hasIntegrationOAuthTokens,
  invalidateIntegrationOAuthCredentials,
} from './integrationOAuthStore'
import { registerOAuthInstallPending } from './oauthInstallStatusStore'

type BeginIntegrationOAuthInstallResult = {
  completed: boolean
  mcpServerId?: string
  authorizationUrl?: string
  /** OAuth `state` param — the web UI uses this to poll install status. */
  state?: string
}

/** Build the local callback URL used by integration OAuth flows. */
export function buildIntegrationOAuthCallbackUrl(
  integrationId: string,
  serverOrigin: string,
): string {
  const origin = new URL(serverOrigin).origin
  return `${origin}/oauth/integrations/${integrationId}/callback`
}

/** Clear all persisted OAuth credentials for an integration. */
export function clearIntegrationOAuthCredentials(integrationId: string): void {
  invalidateIntegrationOAuthCredentials(integrationId, 'all')
}

/** Check whether an integration already has persisted OAuth tokens. */
export function hasStoredIntegrationOAuthTokens(integrationId: string): boolean {
  return hasIntegrationOAuthTokens(integrationId)
}

/** Start an OAuth install flow for an integration and return the auth URL. */
export async function beginIntegrationOAuthInstall(
  integrationId: string,
  serverOrigin: string,
): Promise<BeginIntegrationOAuthInstallResult> {
  const definition = requireOAuthIntegrationDefinition(integrationId)
  const redirectUrl = buildIntegrationOAuthCallbackUrl(integrationId, serverOrigin)
  const serverUrl = getOAuthIntegrationServerUrl(definition)
  let authorizationUrl: string | undefined

  // Re-auth recovery: if this integration is already "installed" (i.e. we
  // previously stored tokens for it), those tokens may be the reason the
  // caller is retrying — the MCP handshake just failed with
  // `OAuth authorization required`. The SDK's `auth(provider)` short-circuits
  // to `AUTHORIZED` whenever tokens exist in the provider, even if they've
  // been revoked server-side. Wipe them here so `auth()` is forced to open
  // the consent screen and mint a fresh token pair.
  if (getIntegrationMcpServerId(integrationId) && hasStoredIntegrationOAuthTokens(integrationId)) {
    logger.info(
      { integrationId },
      '[integrations-oauth] clearing stale tokens before re-authorize',
    )
    clearIntegrationOAuthCredentials(integrationId)
  }

  const provider = createIntegrationOAuthClientProvider({
    integrationId,
    redirectUrl,
    onRedirect: (url) => {
      authorizationUrl = url.toString()
    },
  })

  const result = await auth(provider, { serverUrl })
  if (result === 'AUTHORIZED') {
    const installResult = await finalizeAuthorizedIntegrationInstall(integrationId)
    return {
      completed: true,
      mcpServerId: installResult.mcpServerId,
    }
  }

  if (!authorizationUrl) {
    throw new Error('OAuth authorization URL was not generated')
  }

  const state = extractStateFromAuthorizationUrl(authorizationUrl)
  if (state) registerOAuthInstallPending(state, integrationId)

  return {
    completed: false,
    authorizationUrl,
    state,
  }
}

function extractStateFromAuthorizationUrl(url: string): string | undefined {
  try {
    return new URL(url).searchParams.get('state') ?? undefined
  } catch {
    return undefined
  }
}

/** Complete the OAuth callback flow and install the integration. */
export async function completeIntegrationOAuthInstall(
  integrationId: string,
  code: string,
  callbackState: string | undefined,
  serverOrigin: string,
): Promise<{ mcpServerId: string }> {
  const definition = requireOAuthIntegrationDefinition(integrationId)
  const redirectUrl = buildIntegrationOAuthCallbackUrl(integrationId, serverOrigin)
  const serverUrl = getOAuthIntegrationServerUrl(definition)
  const provider = createIntegrationOAuthClientProvider({
    integrationId,
    redirectUrl,
  })

  const result = await auth(provider, {
    serverUrl,
    authorizationCode: code,
    callbackState,
  })

  if (result !== 'AUTHORIZED') {
    throw new Error('OAuth authorization did not complete')
  }

  return finalizeAuthorizedIntegrationInstall(integrationId)
}

/** Install or rotate the MCP config after OAuth succeeds. */
async function finalizeAuthorizedIntegrationInstall(
  integrationId: string,
): Promise<{ mcpServerId: string }> {
  // MCP disconnect/connect does an HTTP round-trip to the remote server and
  // can take several seconds. We don't want that latency to block the OAuth
  // callback response (and by extension the frontend poll), so fire the MCP
  // side effects in the background and let the status-query machinery surface
  // any connection errors.
  const previousServerId = getIntegrationMcpServerId(integrationId)
  if (previousServerId) {
    void mcpClientManager.disconnect(previousServerId).catch((err) => {
      logger.warn(
        { integrationId, previousServerId, err: String(err) },
        '[integrations-oauth] background disconnect failed',
      )
    })
  }

  const result = installIntegration(integrationId, {})
  const server = getMcpServerById(result.mcpServerId)
  if (server?.enabled) {
    void mcpClientManager.connect(server).catch((err) => {
      logger.warn(
        { integrationId, mcpServerId: result.mcpServerId, err: String(err) },
        '[integrations-oauth] background connect failed',
      )
    })
  }

  logger.info(
    { integrationId, mcpServerId: result.mcpServerId },
    '[integrations-oauth] integration authorized',
  )

  return result
}

/** Ensure the integration uses the OAuth quick-connect flow. */
function requireOAuthIntegrationDefinition(
  integrationId: string,
): ServerIntegrationDefinition {
  const definition = findIntegration(integrationId)
  if (!definition) {
    throw new Error(`Unknown integration: ${integrationId}`)
  }
  if (definition.authType !== 'oauth') {
    throw new Error(`Integration "${integrationId}" does not use OAuth`)
  }
  return definition
}

/** Resolve the remote MCP URL that backs an OAuth integration. */
function getOAuthIntegrationServerUrl(
  definition: ServerIntegrationDefinition,
): string {
  const config = definition.buildMcpConfig({})
  if ((config.transport !== 'http' && config.transport !== 'sse') || !config.url) {
    throw new Error(`Integration "${definition.id}" does not expose a remote MCP URL`)
  }
  return config.url
}
