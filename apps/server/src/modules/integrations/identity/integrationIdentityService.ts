/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */

import { findIntegration } from '@/ai/integrations/registry'
import { mcpClientManager } from '@/ai/services/mcpClientManager'
import { logger } from '@/common/logger'
import { getIntegrationMcpServerId } from '@/services/integrationService'
import {
  type AccessiblePage,
  type IntegrationIdentity,
  getIntegrationIdentity,
  setIntegrationIdentity,
} from './integrationIdentityStore'

/** notion-search caps `page_size` at 25 server-side. */
const ACCESSIBLE_PREVIEW_LIMIT = 20

/** In-flight refresh promises keyed by integrationId, so concurrent callers share one probe. */
const inFlight = new Map<string, Promise<void>>()
/** Cooldown after a probe failure — avoid hammering a broken MCP server from the 1s UI poll. */
const FAILURE_COOLDOWN_MS = 10_000
const lastFailureAt = new Map<string, number>()

/**
 * Call the integration's probe tool (e.g. `notion-get-self`), parse the
 * response, and persist the resulting identity in the in-memory cache. No-op
 * if the integration doesn't declare a probe tool. Concurrent calls for the
 * same integration dedupe to a single network round-trip.
 */
export function refreshIntegrationIdentity(
  integrationId: string,
  mcpServerId: string,
): Promise<void> {
  const existing = inFlight.get(integrationId)
  if (existing) return existing

  const promise = doRefresh(integrationId, mcpServerId).finally(() => {
    inFlight.delete(integrationId)
  })
  inFlight.set(integrationId, promise)
  return promise
}

async function doRefresh(integrationId: string, mcpServerId: string): Promise<void> {
  const definition = findIntegration(integrationId)
  if (!definition?.probeTool) return

  try {
    const raw = await mcpClientManager.callTool(
      mcpServerId,
      definition.probeTool.toolName,
      definition.probeTool.args ?? {},
    )
    const parsed = extractIdentity(raw)
    if (!parsed) {
      logger.warn(
        { integrationId, mcpServerId },
        '[integrations-identity] probe returned no recognisable identity fields',
      )
      return
    }
    setIntegrationIdentity(integrationId, parsed)
    lastFailureAt.delete(integrationId)
    logger.info(
      {
        integrationId,
        mcpServerId,
        workspaceName: parsed.workspaceName,
        ownerName: parsed.ownerName,
      },
      '[integrations-identity] identity cached',
    )

    // Best-effort enrichment — failures here must not invalidate the identity
    // we just cached.
    if (integrationId === 'notion') {
      try {
        const pages = await fetchNotionAccessiblePages(mcpServerId)
        if (pages.length > 0) {
          setIntegrationIdentity(integrationId, { ...parsed, accessiblePages: pages })
          logger.info(
            { integrationId, mcpServerId, count: pages.length },
            '[integrations-identity] accessible pages cached',
          )
        }
      } catch (err) {
        logger.warn(
          { integrationId, mcpServerId, err: String(err) },
          '[integrations-identity] accessible-pages fetch failed',
        )
      }
    }
  } catch (err) {
    lastFailureAt.set(integrationId, Date.now())
    logger.warn(
      { integrationId, mcpServerId, err: String(err) },
      '[integrations-identity] probe failed',
    )
  }
}

/**
 * Trigger a best-effort refresh when UI asks for identity but the cache is
 * empty — fire-and-forget, dedupes internally, silently no-ops if the MCP
 * server isn't ready.
 */
export function ensureIntegrationIdentityFresh(integrationId: string): void {
  const cached = getIntegrationIdentity(integrationId)
  if (cached && isIdentityFullyPopulated(integrationId, cached)) return
  const serverId = getIntegrationMcpServerId(integrationId)
  if (!serverId) return
  if (mcpClientManager.getServerStatus(serverId) !== 'connected') return
  const failedAt = lastFailureAt.get(integrationId)
  if (failedAt && Date.now() - failedAt < FAILURE_COOLDOWN_MS) return
  void refreshIntegrationIdentity(integrationId, serverId)
}

/**
 * Does the cache entry already carry everything we expect for this
 * integration? Having stale core fields but missing enrichment is still
 * "incomplete" and should trigger a re-probe.
 */
function isIdentityFullyPopulated(
  integrationId: string,
  identity: IntegrationIdentity,
): boolean {
  if (integrationId === 'notion') {
    return Boolean(identity.accessiblePages && identity.accessiblePages.length > 0)
  }
  return true
}

/**
 * MCP tools return their result as either `{ structuredContent: {...} }` or
 * `{ content: [{ type: 'text', text: '<json>' }] }`. Unwrap to the real JSON
 * object the probe produced.
 */
function unwrapMcpResult(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data
  const obj = data as Record<string, unknown>

  if (obj.structuredContent && typeof obj.structuredContent === 'object') {
    return obj.structuredContent
  }

  if (Array.isArray(obj.content)) {
    for (const item of obj.content) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      if (rec.type !== 'text') continue
      const text = rec.text
      if (typeof text !== 'string') continue
      try {
        return JSON.parse(text)
      } catch {
        // not JSON — keep scanning
      }
    }
  }
  return data
}

/**
 * Pull out the fields we care about from a Notion probe payload.
 *
 * Supports two shapes:
 *  - `notion-get-users({ user_id: "self" })` → `{ results: [user] }`
 *  - `notion-get-self` (legacy / not always exposed) → a bare `bot` object
 */
function extractIdentity(data: unknown): Omit<IntegrationIdentity, 'fetchedAt'> | null {
  const unwrapped = unwrapMcpResult(data)
  if (!unwrapped || typeof unwrapped !== 'object') return null
  const root = unwrapped as Record<string, unknown>

  // Case 1 — list response. Take the first result.
  let subject: Record<string, unknown> = root
  if (Array.isArray(root.results) && root.results.length > 0) {
    const first = root.results[0]
    if (first && typeof first === 'object') {
      subject = first as Record<string, unknown>
    }
  }

  const bot = asRecord(subject.bot)
  const person = asRecord(subject.person)
  const owner = asRecord(bot?.owner ?? subject.owner)
  const ownerUser = asRecord(owner?.user)

  // For a person subject, `name` lives at the top level. For a bot subject
  // fetched via get-self, Notion also puts workspace metadata under `.bot`.
  const identity = {
    workspaceName: readString(bot?.workspace_name ?? root.workspace_name),
    workspaceId: readString(bot?.workspace_id ?? root.workspace_id),
    botName: readString(subject.type === 'bot' ? subject.name : bot?.name),
    botAvatarUrl: readString(subject.avatar_url ?? bot?.avatar_url),
    ownerType: readString(
      subject.type === 'person' ? 'person' : owner?.type ?? subject.type,
    ),
    ownerName: readString(
      subject.type === 'person' ? subject.name : ownerUser?.name,
    ),
    ownerEmail: readString(
      subject.email
      ?? person?.email
      ?? asRecord(ownerUser?.person)?.email,
    ),
  }

  const hasAny =
    identity.workspaceName
    || identity.workspaceId
    || identity.botName
    || identity.botAvatarUrl
    || identity.ownerType
    || identity.ownerName
    || identity.ownerEmail
  if (!hasAny) return null
  return identity
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * Call `notion-search` with a broad query to surface pages this integration
 * has access to. Notion's MCP surface doesn't let us enumerate a workspace
 * root directly; this returns the most relevant handful of pages the bot can
 * see, which is what a user cares about ("am I connected to the right
 * workspace / are the right pages shared?").
 */
async function fetchNotionAccessiblePages(mcpServerId: string): Promise<AccessiblePage[]> {
  const raw = await mcpClientManager.callTool(mcpServerId, 'notion-search', {
    query: 'a',
    query_type: 'internal',
    page_size: ACCESSIBLE_PREVIEW_LIMIT,
  })

  // MCP tool error responses come back as `{ isError: true, content: [...] }`
  // rather than a thrown exception — surface them as a real error so the
  // caller's try/catch runs and logs it.
  if (raw && typeof raw === 'object' && (raw as { isError?: unknown }).isError === true) {
    const content = (raw as { content?: unknown }).content
    let text = 'unknown error'
    if (Array.isArray(content)) {
      const first = content.find(
        (c): c is { type: string; text: string } =>
          !!c && typeof c === 'object' && (c as any).type === 'text',
      )
      if (first) text = first.text
    }
    throw new Error(text)
  }

  const unwrapped = unwrapMcpResult(raw)
  if (!unwrapped || typeof unwrapped !== 'object') return []
  const results = (unwrapped as { results?: unknown }).results
  if (!Array.isArray(results)) return []
  return results
    .map((item): AccessiblePage | null => {
      if (!item || typeof item !== 'object') return null
      const rec = item as Record<string, unknown>
      const id = readString(rec.id)
      const title = readString(rec.title)
      if (!id || !title) return null
      return {
        id,
        title,
        type: readString(rec.type),
        timestamp: readString(rec.timestamp),
      }
    })
    .filter((x): x is AccessiblePage => x !== null)
    .slice(0, ACCESSIBLE_PREVIEW_LIMIT)
}
