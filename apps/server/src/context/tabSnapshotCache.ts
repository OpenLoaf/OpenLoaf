import type { Tab } from "@teatime-ai/api/common";

type CacheKey = string;

type Entry = {
  seq: number;
  expiresAt: number;
  tab: Tab;
};

const TAB_SNAPSHOT_TTL_MS = 15 * 60 * 1000;

const cache = new Map<CacheKey, Entry>();

export function buildTabSnapshotCacheKey(input: {
  sessionId: string;
  webClientId: string;
  tabId: string;
}): string {
  // 中文注释：key 需要足够唯一，避免多窗口/多会话互相覆盖。
  return `tabSnapshot:${input.sessionId}:${input.webClientId}:${input.tabId}`;
}

export function upsertTabSnapshot(input: {
  key: string;
  seq: number;
  tab: Tab;
  now?: number;
}): void {
  const now = input.now ?? Date.now();
  const existing = cache.get(input.key);
  // 中文注释：用 seq 解决乱序/重复包，避免旧快照覆盖新快照。
  if (existing && input.seq <= existing.seq) return;
  cache.set(input.key, {
    seq: input.seq,
    expiresAt: now + TAB_SNAPSHOT_TTL_MS,
    tab: input.tab,
  });
}

export function getTabSnapshot(key: string, now = Date.now()): Tab | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }
  return entry.tab;
}

