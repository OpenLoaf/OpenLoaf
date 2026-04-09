/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
const canFetch = typeof fetch === 'function';
const DEFAULT_TIMEOUT_MS = 3000;

/**
 * 简单的 sleep 工具，用于轮询等待时控制间隔。
 */
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Checks whether a URL responds within a short timeout.
 * For HTTPS localhost URLs with self-signed certs, temporarily disables TLS verification.
 */
export async function isUrlOk(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<boolean> {
  if (!canFetch) return false;

  // Self-signed cert: temporarily disable TLS verification for localhost.
  const isLocalHttps =
    url.startsWith('https://localhost') || url.startsWith('https://127.0.0.1');
  const origTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  if (isLocalHttps) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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
    if (isLocalHttps) {
      if (origTls === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = origTls;
    }
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
