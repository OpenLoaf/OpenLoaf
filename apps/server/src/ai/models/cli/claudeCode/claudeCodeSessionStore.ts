/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
type CcSessionCacheEntry = {
  /** Claude Code SDK session id. */
  sdkSessionId: string;
  /** Latest model id bound to the session. */
  modelId: string;
  /** Last used timestamp in ms. */
  lastUsedAt: number;
};

/** Claude Code session cache TTL in ms. */
const CC_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Claude Code session cache max size. */
const CC_CACHE_MAX = 10;
/** Claude Code session cache map. */
const ccSessionCache = new Map<string, CcSessionCacheEntry>();

/** Get cached Claude Code session for a chat session. */
export function getCachedCcSession(chatSessionId: string): CcSessionCacheEntry | null {
  const entry = ccSessionCache.get(chatSessionId);
  if (!entry) return null;
  if (isCcSessionCacheExpired(entry)) {
    ccSessionCache.delete(chatSessionId);
    return null;
  }
  const refreshed: CcSessionCacheEntry = {
    ...entry,
    lastUsedAt: Date.now(),
  };
  ccSessionCache.set(chatSessionId, refreshed);
  return refreshed;
}

/** Store cached Claude Code session for a chat session. */
export function setCachedCcSession(chatSessionId: string, entry: CcSessionCacheEntry): void {
  const nextEntry: CcSessionCacheEntry = {
    ...entry,
    lastUsedAt: Date.now(),
  };
  ccSessionCache.set(chatSessionId, nextEntry);
  pruneCcSessionCache();
}

/** Clear cached Claude Code session for a chat session. */
export function clearCachedCcSession(chatSessionId: string): void {
  ccSessionCache.delete(chatSessionId);
}

/** Check whether cache entry expired. */
function isCcSessionCacheExpired(entry: CcSessionCacheEntry): boolean {
  return Date.now() - entry.lastUsedAt > CC_CACHE_TTL_MS;
}

/** Prune Claude Code session cache by TTL and max size. */
function pruneCcSessionCache(): void {
  const now = Date.now();
  for (const [id, entry] of ccSessionCache.entries()) {
    if (now - entry.lastUsedAt > CC_CACHE_TTL_MS) {
      ccSessionCache.delete(id);
    }
  }
  if (ccSessionCache.size <= CC_CACHE_MAX) return;
  let oldestId: string | null = null;
  let oldestTime = Number.POSITIVE_INFINITY;
  for (const [id, entry] of ccSessionCache.entries()) {
    if (entry.lastUsedAt < oldestTime) {
      oldestTime = entry.lastUsedAt;
      oldestId = id;
    }
  }
  if (oldestId) ccSessionCache.delete(oldestId);
}
