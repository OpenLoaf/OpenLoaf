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
 * In-memory cache of integration identity (e.g. the Notion workspace name
 * behind a successfully-authorized Notion install). Populated right after the
 * MCP server connects — UI reads this directly instead of probing on every
 * dialog open.
 */

export interface AccessiblePage {
  /** Notion page / database UUID (with or without dashes). */
  id: string
  title: string
  /** `"page"`, `"database"`, etc. */
  type?: string
  /** ISO 8601 last-edited timestamp, if surfaced by the provider. */
  timestamp?: string
}

export interface IntegrationIdentity {
  workspaceName?: string
  workspaceId?: string
  botName?: string
  botAvatarUrl?: string
  ownerType?: string
  ownerName?: string
  ownerEmail?: string
  /** Preview of content this integration is authorised to see. */
  accessiblePages?: AccessiblePage[]
  /** Unix ms when this record was last refreshed. */
  fetchedAt: number
}

const store = new Map<string, IntegrationIdentity>()

/** Read the cached identity for an integration (null if never fetched). */
export function getIntegrationIdentity(integrationId: string): IntegrationIdentity | null {
  return store.get(integrationId) ?? null
}

/** Upsert an identity record. */
export function setIntegrationIdentity(
  integrationId: string,
  partial: Omit<IntegrationIdentity, 'fetchedAt'>,
): void {
  store.set(integrationId, { ...partial, fetchedAt: Date.now() })
}

/** Drop the cached identity — call on uninstall / credential rotation. */
export function clearIntegrationIdentity(integrationId: string): void {
  store.delete(integrationId)
}
