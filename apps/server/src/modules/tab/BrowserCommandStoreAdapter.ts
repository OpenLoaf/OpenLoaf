type CacheKey = string;

type Entry = {
  expiresAt: number;
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  promise: Promise<unknown>;
};

const TTL_MS = 60 * 1000;
const cache = new Map<CacheKey, Entry>();

function cleanup(now: number) {
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

/**
 * Create a pending browser command and return a promise to await its result.
 */
export function createBrowserCommandPending(input: { commandId: string; now?: number }) {
  const now = input.now ?? Date.now();
  cleanup(now);

  const key = input.commandId;
  const existing = cache.get(key);
  if (existing) return existing.promise;

  let resolve!: (value: unknown) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  cache.set(key, { expiresAt: now + TTL_MS, resolve, reject, promise });
  return promise;
}

/**
 * Resolve a pending browser command (called by Web/Electron result reporter).
 */
export function resolveBrowserCommandPending(input: { commandId: string; result: unknown; now?: number }) {
  const now = input.now ?? Date.now();
  cleanup(now);

  const entry = cache.get(input.commandId);
  if (!entry) return;
  cache.delete(input.commandId);
  entry.resolve(input.result);
}

/**
 * Reject a pending browser command (best-effort).
 */
export function rejectBrowserCommandPending(input: { commandId: string; error: unknown; now?: number }) {
  const now = input.now ?? Date.now();
  cleanup(now);

  const entry = cache.get(input.commandId);
  if (!entry) return;
  cache.delete(input.commandId);
  entry.reject(input.error);
}

