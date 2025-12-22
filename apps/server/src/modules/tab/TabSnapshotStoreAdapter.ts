import type { Tab } from "@teatime-ai/api/common";

type CacheKey = string;

type Entry = {
  seq: number;
  expiresAt: number;
  tab: Tab;
};

const TAB_SNAPSHOT_TTL_MS = 15 * 60 * 1000;
const cache = new Map<CacheKey, Entry>();
const BROWSER_WINDOW_COMPONENT = "electron-browser-window";

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
    // 用 seq 解决乱序/重复包，避免旧快照覆盖新快照。
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

export type TabBrowserTarget = { viewKey?: string; cdpTargetIds?: string[] };

export function getTabCdpTargetIds(tab: Tab | null): string[] {
  if (!tab) return [];
  const stack = Array.isArray(tab.stack) ? tab.stack : [];
  const browserItem = stack.find((item) => item?.component === BROWSER_WINDOW_COMPONENT);
  const browserTabs = (browserItem?.params as any)?.browserTabs as TabBrowserTarget[] | undefined;
  if (!Array.isArray(browserTabs)) return [];
  // 统一去重，确保 server 侧只拿到可控 targetId 列表。
  const merged = new Set<string>();
  for (const browserTab of browserTabs) {
    const ids = Array.isArray(browserTab?.cdpTargetIds) ? browserTab.cdpTargetIds : [];
    for (const id of ids) merged.add(id);
  }
  return Array.from(merged);
}
