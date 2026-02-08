const canFetch = typeof fetch === 'function';
const DEFAULT_TIMEOUT_MS = 3000;

/**
 * 简单的 sleep 工具，用于轮询等待时控制间隔。
 */
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Checks whether a URL responds within a short timeout.
 */
export async function isUrlOk(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<boolean> {
  if (!canFetch) return false;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const res = await fetch(url, { method: 'GET', signal: controller?.signal });
    // fetch 默认跟随重定向，但这里仍保留对 3xx 的兼容判断。
    return res.ok || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * 轮询等待 URL 可访问，直到超时、成功或被 abort。
 */
export async function waitForUrlOk(
  url: string,
  { timeoutMs, intervalMs, signal }: { timeoutMs: number; intervalMs: number; signal?: AbortSignal }
): Promise<boolean> {
  const start = Date.now();
  for (;;) {
    if (signal?.aborted) return false;
    if (await isUrlOk(url)) return true;
    if (Date.now() - start > timeoutMs) return false;
    await sleep(intervalMs);
  }
}

/**
 * 延迟执行（语义化封装），用于提高调用处可读性。
 */
export async function delay(ms: number) {
  await sleep(ms);
}
