/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { randomBytes } from 'node:crypto'
import type {
  OAuthClientInformation,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthTokens,
} from '@ai-sdk/mcp'
import {
  getIntegrationOAuthEntry,
  invalidateIntegrationOAuthCredentials,
  updateIntegrationOAuthEntry,
} from './integrationOAuthStore'

type CreateIntegrationOAuthClientProviderOptions = {
  integrationId: string
  redirectUrl: string
  onRedirect?: (authorizationUrl: URL) => void | Promise<void>
}

/** Build an OAuth client provider backed by the integration OAuth store. */
export function createIntegrationOAuthClientProvider({
  integrationId,
  redirectUrl,
  onRedirect,
}: CreateIntegrationOAuthClientProviderOptions): OAuthClientProvider {
  // 逻辑：把最近一次有效 callback URL 持久化，供后台自动重连/刷新时复用。
  updateIntegrationOAuthEntry(integrationId, (current) => ({
    ...current,
    redirectUrl,
  }))

  return {
    tokens(): OAuthTokens | undefined {
      return getIntegrationOAuthEntry(integrationId)?.tokens
    },

    saveTokens(tokens: OAuthTokens): void {
      updateIntegrationOAuthEntry(integrationId, (current) => ({
        ...current,
        tokens,
        authorizedAt: new Date().toISOString(),
      }))
    },

    async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
      if (onRedirect) {
        await onRedirect(authorizationUrl)
        return
      }
      throw new Error('OAuth authorization required')
    },

    saveCodeVerifier(codeVerifier: string): void {
      updateIntegrationOAuthEntry(integrationId, (current) => ({
        ...current,
        codeVerifier,
      }))
    },

    codeVerifier(): string {
      const verifier = getIntegrationOAuthEntry(integrationId)?.codeVerifier
      if (!verifier) {
        throw new Error('Missing stored OAuth code verifier')
      }
      return verifier
    },

    invalidateCredentials(scope): void {
      invalidateIntegrationOAuthCredentials(integrationId, scope)
    },

    get redirectUrl(): string {
      return getIntegrationOAuthEntry(integrationId)?.redirectUrl ?? redirectUrl
    },

    get clientMetadata(): OAuthClientMetadata {
      return {
        redirect_uris: [redirectUrl],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        client_name: 'OpenLoaf',
        client_uri: 'https://github.com/OpenLoaf/OpenLoaf',
        scope: 'offline_access',
      }
    },

    clientInformation(): OAuthClientInformation | undefined {
      return getIntegrationOAuthEntry(integrationId)?.clientInformation
    },

    saveClientInformation(clientInformation: OAuthClientInformation): void {
      updateIntegrationOAuthEntry(integrationId, (current) => ({
        ...current,
        clientInformation,
      }))
    },

    state(): string {
      return randomBytes(16).toString('base64url')
    },

    saveState(state: string): void {
      updateIntegrationOAuthEntry(integrationId, (current) => ({
        ...current,
        state,
      }))
    },

    storedState(): string | undefined {
      return getIntegrationOAuthEntry(integrationId)?.state
    },
  }
}
