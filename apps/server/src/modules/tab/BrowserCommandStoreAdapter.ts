import Keyv from "keyv";

type Entry = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  promise: Promise<unknown>;
  timeout: NodeJS.Timeout;
};

const TTL_MS = 60 * 1000;
const cache = new Keyv<Entry>({
  namespace: "tab:browserCommandPending",
  // 中文注释：这里需要缓存 promise/resolve/reject（不可 JSON 序列化），禁用默认序列化以使用 raw 存储。
  serialize: undefined as any,
  deserialize: undefined as any,
});

/**
 * Create a pending browser command and return a promise to await its result.
 */
export async function createBrowserCommandPending(input: { commandId: string }) {
  const key = input.commandId;
  const existing = await cache.get(key);
  if (existing) return existing.promise;

  let resolve!: (value: unknown) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const timeout = setTimeout(() => {
    // 中文注释：兜底超时，避免 pending 一直挂住导致内存无法释放。
    void rejectBrowserCommandPending({ commandId: key, error: new Error("Browser command timeout") });
  }, TTL_MS);
  timeout.unref?.();

  await cache.set(key, { resolve, reject, promise, timeout }, TTL_MS);
  return promise;
}

/**
 * Resolve a pending browser command (called by Web/Electron result reporter).
 */
export async function resolveBrowserCommandPending(input: { commandId: string; result: unknown }) {
  const entry = await cache.get(input.commandId);
  if (!entry) return;
  await cache.delete(input.commandId);
  try {
    clearTimeout(entry.timeout);
  } catch {
    // ignore
  }
  entry.resolve(input.result);
}

/**
 * Reject a pending browser command (best-effort).
 */
export async function rejectBrowserCommandPending(input: { commandId: string; error: unknown }) {
  const entry = await cache.get(input.commandId);
  if (!entry) return;
  await cache.delete(input.commandId);
  try {
    clearTimeout(entry.timeout);
  } catch {
    // ignore
  }
  entry.reject(input.error);
}
