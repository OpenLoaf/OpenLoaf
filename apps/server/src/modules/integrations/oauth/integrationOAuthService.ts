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

type BeginIntegrationOAuthInstallResult = {
  completed: boolean
  mcpServerId?: string
  authorizationUrl?: string
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

  return {
    completed: false,
    authorizationUrl,
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
  const previousServerId = getIntegrationMcpServerId(integrationId)
  if (previousServerId) {
    await mcpClientManager.disconnect(previousServerId)
  }

  const result = installIntegration(integrationId, {})
  const server = getMcpServerById(result.mcpServerId)
  if (server?.enabled) {
    await mcpClientManager.connect(server)
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
