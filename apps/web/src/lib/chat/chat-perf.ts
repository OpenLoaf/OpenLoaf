/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
/** Storage key for perf logging flag. */
const STORAGE_KEY = "openloaf:debug:chat-perf";
/** Window key for perf logging enabled flag. */
const ENABLED_KEY = "__openloafChatPerfEnabled";
/** Window key for perf counters storage. */
const COUNTERS_KEY = "__openloafChatPerfCounters";

/** Get the browser window safely. */
function getWindow(): (Window & typeof globalThis) | null {
  if (typeof window === "undefined") return null;
  return window;
}

/** Resolve whether chat perf logging is enabled. */
export function isChatPerfEnabled(): boolean {
  const win = getWindow();
  if (!win) return false;
  const cached = (win as any)[ENABLED_KEY];
  if (typeof cached === "boolean") return cached;
  let enabled = false;
  try {
    enabled = win.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    enabled = false;
  }
  // 中文注释：缓存开关，避免每次统计都读 localStorage。
  (win as any)[ENABLED_KEY] = enabled;
  return enabled;
}

/** Increment a perf counter for chat streaming. */
export function incrementChatPerf(metric: string, delta = 1): void {
  const win = getWindow();
  if (!win) return;
  if (!isChatPerfEnabled()) return;
  const counters = (win as any)[COUNTERS_KEY] as Record<string, number> | undefined;
  const store = counters && typeof counters === "object" ? counters : {};
  store[metric] = (store[metric] ?? 0) + delta;
  (win as any)[COUNTERS_KEY] = store;
}

/** Start a periodic logger for chat perf counters. */
export function startChatPerfLogger(options?: {
  label?: string;
  intervalMs?: number;
}): () => void {
  const win = getWindow();
  if (!win) return () => {};
  if (!isChatPerfEnabled()) return () => {};
  const label = options?.label ?? "chat";
  const intervalMs = Number.isFinite(options?.intervalMs)
    ? Math.max(250, Number(options?.intervalMs))
    : 1000;
  // 中文注释：按固定间隔输出并清零计数，避免控制台刷屏。
  const timer = win.setInterval(() => {
    const counters = (win as any)[COUNTERS_KEY] as Record<string, number> | undefined;
    if (!counters || typeof counters !== "object") return;
    const entries = Object.entries(counters).filter(([, value]) => value > 0);
    if (entries.length === 0) return;
    const payload: Record<string, number> = {};
    for (const [key, value] of entries) {
      payload[key] = value;
      counters[key] = 0;
    }
    // eslint-disable-next-line no-console
    console.debug(`[chat-perf:${label}]`, payload);
  }, intervalMs);

  return () => {
    win.clearInterval(timer);
  };
}
