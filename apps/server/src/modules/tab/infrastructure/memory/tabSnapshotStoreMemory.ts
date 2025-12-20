import type { Tab } from "@teatime-ai/api/common";

type CacheKey = string;

type Entry = {
  seq: number;
  expiresAt: number;
  tab: Tab;
};

const TAB_SNAPSHOT_TTL_MS = 15 * 60 * 1000;
const cache = new Map<CacheKey, Entry>();

function buildKey(input: { sessionId: string; clientId: string; tabId: string }): CacheKey {
  return `tabSnapshot:${input.sessionId}:${input.clientId}:${input.tabId}`;
}

export const tabSnapshotStore = {
  /** 写入 tab 快照（用 seq 防止乱序覆盖）。 */
  upsert: (input: {
    sessionId: string;
    clientId: string;
    tabId: string;
    seq: number;
    tab: Tab;
    now?: number;
  }) => {
    const now = input.now ?? Date.now();
    const key = buildKey(input);
    const existing = cache.get(key);
    // 中文注释：用 seq 解决乱序/重复包，避免旧快照覆盖新快照。
    if (existing && input.seq <= existing.seq) return;
    cache.set(key, {
      seq: input.seq,
      expiresAt: now + TAB_SNAPSHOT_TTL_MS,
      tab: input.tab,
    });
  },

  /** 读取 tab 快照（过期自动清理）。 */
  get: (input: { sessionId: string; clientId: string; tabId: string; now?: number }): Tab | null => {
    const now = input.now ?? Date.now();
    const key = buildKey(input);
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      cache.delete(key);
      return null;
    }
    return entry.tab;
  },
} as const;

