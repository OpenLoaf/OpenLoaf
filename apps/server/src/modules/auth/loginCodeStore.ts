/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
type LoginCodeEntry = {
  /** One-time login code. */
  code: string;
  /** Created timestamp (ms). */
  createdAt: number;
};

/** Default login state key. */
const DEFAULT_STATE = "__default__";
/** Login code TTL in milliseconds. */
const CODE_TTL_MS = 10 * 60 * 1000;
/** Max entry size to avoid unbounded growth. */
const MAX_ENTRIES = 50;

const store = new Map<string, LoginCodeEntry>();

/** Normalize login state key. */
function normalizeState(state?: string | null): string {
  const trimmed = typeof state === "string" ? state.trim() : "";
  if (!trimmed) return DEFAULT_STATE;
  // 逻辑：限制长度，避免异常状态污染内存。
  return trimmed.length > 128 ? trimmed.slice(0, 128) : trimmed;
}

/** Remove expired or overflow entries. */
function cleanupStore(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.createdAt > CODE_TTL_MS) {
      store.delete(key);
    }
  }
  if (store.size <= MAX_ENTRIES) return;
  // 逻辑：超出上限时按时间淘汰最旧的记录。
  const entries = Array.from(store.entries()).sort(
    (a, b) => a[1].createdAt - b[1].createdAt,
  );
  const overflow = store.size - MAX_ENTRIES;
  for (let i = 0; i < overflow; i += 1) {
    store.delete(entries[i]![0]);
  }
}

/** Store login code for a state key. */
export function storeLoginCode(state: string | null | undefined, code: string): void {
  const key = normalizeState(state);
  store.set(key, { code, createdAt: Date.now() });
  cleanupStore();
}

/** Consume login code once by state key. */
export function consumeLoginCode(state: string | null | undefined): string | null {
  cleanupStore();
  const key = normalizeState(state);
  const entry = store.get(key);
  if (!entry) return null;
  store.delete(key);
  return entry.code;
}
