/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
\nimport { BROWSER_WINDOW_COMPONENT, type BrowserTab, type Tab } from "@openloaf/api/common";

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

export type TabBrowserTarget = Pick<BrowserTab, "id" | "cdpTargetIds">;

/** Resolve the latest CDP target id for the active browser tab in a snapshot. */
export function getActiveBrowserTargetId(tab: Tab | null): string | null {
  if (!tab) return null;
  const stack = Array.isArray(tab.stack) ? tab.stack : [];
  const browserItem = stack.find((item) => item?.component === BROWSER_WINDOW_COMPONENT);
  const params = (browserItem?.params ?? {}) as Record<string, unknown>;
  const browserTabs = Array.isArray((params as any).browserTabs)
    ? ((params as any).browserTabs as TabBrowserTarget[])
    : [];
  if (browserTabs.length === 0) return null;

  const activeId =
    typeof (params as any).activeBrowserTabId === "string"
      ? String((params as any).activeBrowserTabId)
      : "";
  // 只允许命中激活中的浏览器标签，避免跨标签页误操作。
  const activeTab = activeId
    ? browserTabs.find((item) => item?.id === activeId)
    : browserTabs.length === 1
      ? browserTabs[0]
      : undefined;
  if (!activeTab) return null;

  const ids = Array.isArray(activeTab.cdpTargetIds) ? activeTab.cdpTargetIds : [];
  const usableIds = ids.filter((id) => typeof id === "string" && id.length > 0);
  if (usableIds.length === 0) return null;
  // 优先取最新的 targetId，避免旧目标覆盖当前页面。
  return usableIds[usableIds.length - 1]!;
}
