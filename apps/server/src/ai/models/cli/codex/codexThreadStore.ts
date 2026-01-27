type CodexThreadCacheEntry = {
  /** Codex thread id. */
  threadId: string;
  /** Latest model id bound to the thread. */
  modelId: string;
  /** Hash of the Codex config used for this thread. */
  configHash: string;
  /** Last used timestamp in ms. */
  lastUsedAt: number;
};

/** Codex thread cache TTL in ms. */
const CODEX_THREAD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Codex thread cache max size. */
const CODEX_THREAD_CACHE_MAX = 10;
/** Codex thread cache map. */
const codexThreadCache = new Map<string, CodexThreadCacheEntry>();

/** Get cached Codex thread for a chat session. */
export function getCachedCodexThread(
  sessionId: string,
  configHash: string,
): CodexThreadCacheEntry | null {
  const entry = codexThreadCache.get(sessionId);
  if (!entry) return null;
  if (entry.configHash !== configHash) {
    // 逻辑：配置变更时丢弃缓存，避免混用旧 thread。
    codexThreadCache.delete(sessionId);
    return null;
  }
  if (isCodexThreadCacheExpired(entry)) {
    // 逻辑：过期数据直接清理，避免复用旧 thread。
    codexThreadCache.delete(sessionId);
    return null;
  }
  const refreshed: CodexThreadCacheEntry = {
    ...entry,
    lastUsedAt: Date.now(),
  };
  // 逻辑：读取即刷新 LRU 时间戳。
  codexThreadCache.set(sessionId, refreshed);
  return refreshed;
}

/** Store cached Codex thread for a chat session. */
export function setCachedCodexThread(sessionId: string, entry: CodexThreadCacheEntry): void {
  const nextEntry: CodexThreadCacheEntry = {
    ...entry,
    lastUsedAt: Date.now(),
  };
  codexThreadCache.set(sessionId, nextEntry);
  pruneCodexThreadCache();
}

/** Clear all cached Codex threads. */
export function clearAllCodexThreads(): void {
  codexThreadCache.clear();
}

/** Check whether cache entry expired. */
function isCodexThreadCacheExpired(entry: CodexThreadCacheEntry): boolean {
  return Date.now() - entry.lastUsedAt > CODEX_THREAD_CACHE_TTL_MS;
}

/** Prune Codex thread cache by TTL and max size. */
function pruneCodexThreadCache(): void {
  const now = Date.now();
  // 逻辑：先清理过期 entry，避免占用缓存容量。
  for (const [sessionId, entry] of codexThreadCache.entries()) {
    if (now - entry.lastUsedAt > CODEX_THREAD_CACHE_TTL_MS) {
      codexThreadCache.delete(sessionId);
    }
  }
  if (codexThreadCache.size <= CODEX_THREAD_CACHE_MAX) return;
  let oldestSessionId: string | null = null;
  let oldestTime = Number.POSITIVE_INFINITY;
  // 逻辑：按最近使用时间淘汰最旧 entry。
  for (const [sessionId, entry] of codexThreadCache.entries()) {
    if (entry.lastUsedAt < oldestTime) {
      oldestTime = entry.lastUsedAt;
      oldestSessionId = sessionId;
    }
  }
  if (oldestSessionId) codexThreadCache.delete(oldestSessionId);
}
