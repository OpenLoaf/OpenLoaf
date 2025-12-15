const canFetch = typeof fetch === 'function';

/**
 * 简单的 sleep 工具，用于轮询等待时控制间隔。
 */
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 检测 URL 是否可访问（HTTP 2xx/3xx 视为 ok）。
 */
export async function isUrlOk(url: string): Promise<boolean> {
  if (!canFetch) return false;
  try {
    const res = await fetch(url, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 轮询等待 URL 可访问，直到超时或成功。
 */
export async function waitForUrlOk(
  url: string,
  { timeoutMs, intervalMs }: { timeoutMs: number; intervalMs: number }
): Promise<boolean> {
  const start = Date.now();
  for (;;) {
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
