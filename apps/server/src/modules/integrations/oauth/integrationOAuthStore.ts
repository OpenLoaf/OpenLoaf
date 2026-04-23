/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { resolveOpenLoafPath } from '@openloaf/config'
import type { OAuthClientInformation, OAuthTokens } from '@ai-sdk/mcp'

const INTEGRATION_OAUTH_FILENAME = 'integration-oauth.json'

export interface IntegrationOAuthEntry {
  /** Redirect URI registered for this OAuth client. */
  redirectUrl?: string
  /** OAuth client registration info returned by the auth server. */
  clientInformation?: OAuthClientInformation
  /** Latest OAuth token set. */
  tokens?: OAuthTokens
  /** Last PKCE verifier generated before redirecting. */
  codeVerifier?: string
  /** Last OAuth state generated for callback validation. */
  state?: string
  /** Timestamp of the last successful authorization. */
  authorizedAt?: string
}

interface IntegrationOAuthFile {
  version: 1
  integrations: Record<string, IntegrationOAuthEntry>
}

/** Resolve the persisted integration OAuth store path. */
function getStorePath(): string {
  return resolveOpenLoafPath(INTEGRATION_OAUTH_FILENAME)
}

/** Read the OAuth store from disk. */
function readStore(): IntegrationOAuthFile {
  const filePath = getStorePath()
  if (!existsSync(filePath)) {
    return { version: 1, integrations: {} }
  }

  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as IntegrationOAuthFile
    return {
      version: 1,
      integrations:
        raw?.integrations && typeof raw.integrations === 'object'
          ? raw.integrations
          : {},
    }
  } catch {
    return { version: 1, integrations: {} }
  }
}

/** Persist the OAuth store atomically. */
function writeStore(store: IntegrationOAuthFile): void {
  const filePath = getStorePath()
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${Date.now()}.tmp`
  writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8')
  renameSync(tmpPath, filePath)
}

/** Return one integration OAuth entry if present. */
export function getIntegrationOAuthEntry(
  integrationId: string,
): IntegrationOAuthEntry | undefined {
  return readStore().integrations[integrationId]
}

/** Update one integration OAuth entry. */
export function updateIntegrationOAuthEntry(
  integrationId: string,
  updater: (current: IntegrationOAuthEntry) => IntegrationOAuthEntry | null,
): void {
  const store = readStore()
  const current = store.integrations[integrationId] ?? {}
  const next = updater(current)

  // 逻辑：返回 null 表示清空该 integration 的 OAuth 状态。
  if (next === null) {
    delete store.integrations[integrationId]
  } else {
    store.integrations[integrationId] = next
  }

  writeStore(store)
}

/** Remove one or more credential scopes from the integration OAuth entry. */
export function invalidateIntegrationOAuthCredentials(
  integrationId: string,
  scope: 'all' | 'client' | 'tokens' | 'verifier',
): void {
  updateIntegrationOAuthEntry(integrationId, (current) => {
    const next: IntegrationOAuthEntry = { ...current }

    if (scope === 'all' || scope === 'client') {
      delete next.redirectUrl
      delete next.clientInformation
    }
    if (scope === 'all' || scope === 'tokens') {
      delete next.tokens
      delete next.authorizedAt
    }
    if (scope === 'all' || scope === 'verifier') {
      delete next.codeVerifier
      delete next.state
    }

    return Object.keys(next).length > 0 ? next : null
  })
}

/** Check whether the integration already has persisted OAuth tokens. */
export function hasIntegrationOAuthTokens(integrationId: string): boolean {
  const entry = getIntegrationOAuthEntry(integrationId)
  return Boolean(entry?.tokens?.access_token)
}
