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
 * In-memory store tracking the outcome of an in-flight OAuth install, keyed by
 * the OAuth `state` parameter. The web UI polls by state to learn whether the
 * user has finished the authorization in their system browser — this replaces
 * the previous "wait for popup.closed" mechanism which breaks when the auth
 * page is opened via the OS default browser.
 */

export type OAuthInstallStatusEntry = {
  status: 'pending' | 'completed' | 'error'
  integrationId: string
  mcpServerId?: string
  error?: string
  createdAt: number
}

const ENTRY_TTL_MS = 10 * 60 * 1000
const MAX_ENTRIES = 50

const store = new Map<string, OAuthInstallStatusEntry>()

function normalizeState(state: string | null | undefined): string | null {
  const trimmed = typeof state === 'string' ? state.trim() : ''
  if (!trimmed) return null
  return trimmed.length > 256 ? trimmed.slice(0, 256) : trimmed
}

function cleanup(): void {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now - entry.createdAt > ENTRY_TTL_MS) store.delete(key)
  }
  if (store.size <= MAX_ENTRIES) return
  const entries = Array.from(store.entries()).sort(
    (a, b) => a[1].createdAt - b[1].createdAt,
  )
  const overflow = store.size - MAX_ENTRIES
  for (let i = 0; i < overflow; i += 1) store.delete(entries[i]![0])
}

/** Record a newly started OAuth install awaiting the browser redirect. */
export function registerOAuthInstallPending(
  state: string,
  integrationId: string,
): void {
  const key = normalizeState(state)
  if (!key) return
  store.set(key, {
    status: 'pending',
    integrationId,
    createdAt: Date.now(),
  })
  cleanup()
}

/** Mark the install flow as completed and remember the resulting MCP server id. */
export function markOAuthInstallCompleted(
  state: string | null | undefined,
  integrationId: string,
  mcpServerId: string,
): void {
  const key = normalizeState(state)
  if (!key) return
  const existing = store.get(key)
  store.set(key, {
    status: 'completed',
    integrationId: existing?.integrationId ?? integrationId,
    mcpServerId,
    createdAt: existing?.createdAt ?? Date.now(),
  })
  cleanup()
}

/** Mark the install flow as failed with the given human readable error. */
export function markOAuthInstallFailed(
  state: string | null | undefined,
  integrationId: string,
  error: string,
): void {
  const key = normalizeState(state)
  if (!key) return
  const existing = store.get(key)
  store.set(key, {
    status: 'error',
    integrationId: existing?.integrationId ?? integrationId,
    error,
    createdAt: existing?.createdAt ?? Date.now(),
  })
  cleanup()
}

/**
 * Read the current status for a state key. Terminal states (completed/error)
 * are consumed so that the caller sees them exactly once; pending stays until
 * it flips or expires.
 */
export function readOAuthInstallStatus(
  state: string,
): OAuthInstallStatusEntry | null {
  cleanup()
  const key = normalizeState(state)
  if (!key) return null
  const entry = store.get(key) ?? null
  if (entry && entry.status !== 'pending') store.delete(key)
  return entry
}

/** Forget an in-flight install, typically because the user pressed cancel. */
export function discardOAuthInstall(state: string | null | undefined): void {
  const key = normalizeState(state)
  if (!key) return
  store.delete(key)
}
